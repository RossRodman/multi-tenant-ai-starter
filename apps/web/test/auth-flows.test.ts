import { createHmac } from "node:crypto";

import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  getSessionUser,
  isRecoverySession,
  parseEmailLink,
  requestPasswordReset,
  resendConfirmation,
  sendMagicLink,
  signInWithPassword,
  signUp,
  startGoogleSignIn,
  updatePassword,
  verifyEmailLink,
} from "../src/server/auth";
import { env } from "./env";
import {
  createEmailClient,
  createJar,
  createTestClient,
  extractLink,
  findEmails,
  first,
  PASSWORD,
  sessionCookie,
  sessionFromCookies,
  uniqueEmail,
  waitForEmail,
} from "./harness";

const db = new pg.Client({ connectionString: env.dbUrl });
await db.connect();
afterAll(() => db.end());

async function confirmedUser(label: string) {
  const email = uniqueEmail(label);
  const { client } = createTestClient();
  expect(await signUp(client, { email, password: PASSWORD })).toEqual({ ok: true });
  const link = extractLink((await waitForEmail(email)).html);
  expect(link.type).toBe("signup");
  expect(await verifyEmailLink(client, { tokenHash: link.tokenHash, type: "signup" })).toEqual({
    ok: true,
  });
  return email;
}

describe("sign-up and confirmation", () => {
  it("requires confirmation before sign-in and resends the email", async () => {
    const email = uniqueEmail("signup");
    const { client } = createTestClient();

    expect(await signUp(client, { email, password: PASSWORD })).toEqual({ ok: true });
    expect(await getSessionUser(client)).toBeNull();
    expect(await signInWithPassword(client, { email, password: PASSWORD })).toEqual({
      ok: false,
      error: "email_not_confirmed",
    });

    await waitForEmail(email);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await resendConfirmation(client, email)).toEqual({ ok: true });
    await expect.poll(async () => (await findEmails(email)).length).toBe(2);

    const link = extractLink(first(await findEmails(email)).html);
    expect(await verifyEmailLink(client, { tokenHash: link.tokenHash, type: "signup" })).toEqual({
      ok: true,
    });
    expect((await getSessionUser(client))?.email).toBe(email);
  });

  it("rejects short passwords", async () => {
    const { client } = createTestClient();
    expect(await signUp(client, { email: uniqueEmail("weak"), password: "short" })).toEqual({
      ok: false,
      error: "weak_password",
    });
  });

  it("answers the same for an already registered email", async () => {
    const email = await confirmedUser("dup");
    const { client } = createTestClient();
    expect(await signUp(client, { email, password: "another-password-1" })).toEqual({ ok: true });
    expect(await getSessionUser(client)).toBeNull();
  });
});

describe("email links", () => {
  it("carry a plain token hash that verifies in another client", async () => {
    const email = uniqueEmail("plain-link");
    expect(await signUp(createEmailClient(), { email, password: PASSWORD })).toEqual({ ok: true });

    const link = extractLink((await waitForEmail(email)).html);
    expect(link.tokenHash).not.toMatch(/^pkce_/);

    const { client, jar } = createTestClient();
    expect(await verifyEmailLink(client, { tokenHash: link.tokenHash, type: "signup" })).toEqual({
      ok: true,
    });
    expect(await getSessionUser(client)).not.toBeNull();
    expect([...jar.cookies.keys()].filter((name) => name.endsWith("-code-verifier"))).toEqual([]);
  });
});

describe("per-user email limit", () => {
  async function sendsEmail(
    send: (client: ReturnType<typeof createTestClient>["client"]) => Promise<unknown>,
  ) {
    const { client } = createTestClient();
    const seen = new Set<unknown>();
    for (let i = 0; i < 3; i++) seen.add(JSON.stringify(await send(client)));
    return [...seen];
  }

  const ok = [JSON.stringify({ ok: true })];

  it("does not show up for a known email on sign-up", async () => {
    const email = uniqueEmail("limit-signup");
    expect(await sendsEmail((c) => signUp(c, { email, password: PASSWORD }))).toEqual(ok);
  });

  it("does not show up for a known email on resend", async () => {
    const email = uniqueEmail("limit-resend");
    await signUp(createTestClient().client, { email, password: PASSWORD });
    expect(await sendsEmail((c) => resendConfirmation(c, email))).toEqual(ok);
  });

  it("does not show up for a known email on magic link", async () => {
    const email = await confirmedUser("limit-magic");
    expect(await sendsEmail((c) => sendMagicLink(c, email))).toEqual(ok);
  });

  it("does not show up for a known email on password reset", async () => {
    const email = await confirmedUser("limit-reset");
    expect(await sendsEmail((c) => requestPasswordReset(c, email))).toEqual(ok);
  });
});

describe("password sign-in", () => {
  it("opens a session with the right password", async () => {
    const email = await confirmedUser("pw");
    const { client } = createTestClient();
    expect(await signInWithPassword(client, { email, password: PASSWORD })).toEqual({ ok: true });
    expect((await getSessionUser(client))?.email).toBe(email);
  });

  it("does not tell a wrong password from an unknown email", async () => {
    const email = await confirmedUser("pw-wrong");
    const { client } = createTestClient();
    const wrong = await signInWithPassword(client, { email, password: "wrong-password-1" });
    const unknown = await signInWithPassword(client, {
      email: uniqueEmail("ghost"),
      password: PASSWORD,
    });
    expect(wrong).toEqual({ ok: false, error: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
  });

  it("shows email_not_confirmed only after the password checked out", async () => {
    const email = uniqueEmail("unconfirmed");
    const { client } = createTestClient();
    await signUp(client, { email, password: PASSWORD });
    expect(await signInWithPassword(client, { email, password: "wrong-password-1" })).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
  });
});

describe("magic link", () => {
  it("signs in an existing user", async () => {
    const email = await confirmedUser("magic");
    const { client } = createTestClient();
    const before = (await findEmails(email)).length;

    expect(await sendMagicLink(client, email)).toEqual({ ok: true });
    await expect.poll(async () => (await findEmails(email)).length).toBe(before + 1);

    const link = extractLink(first(await findEmails(email)).html);
    expect(link.type).toBe("magiclink");
    expect(await verifyEmailLink(client, { tokenHash: link.tokenHash, type: "magiclink" })).toEqual(
      { ok: true },
    );
    expect((await getSessionUser(client))?.email).toBe(email);
  });

  it("answers ok for an unknown email without sending mail or creating a user", async () => {
    const email = uniqueEmail("nobody");
    const { client } = createTestClient();

    expect(await sendMagicLink(client, email)).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 1000));

    expect(await findEmails(email)).toHaveLength(0);
    const { rowCount } = await db.query("select 1 from auth.users where email = $1", [email]);
    expect(rowCount).toBe(0);
  });
});

describe("password reset", () => {
  it("answers ok for known and unknown emails", async () => {
    const known = await confirmedUser("reset-known");
    const { client } = createTestClient();
    expect(await requestPasswordReset(client, known)).toEqual({ ok: true });
    expect(await requestPasswordReset(client, uniqueEmail("reset-unknown"))).toEqual({ ok: true });
  });

  it("changes the password only from a session marked as recovery", async () => {
    const email = await confirmedUser("reset");
    const newPassword = "brand-new-password-1";

    const password = createTestClient();
    await signInWithPassword(password.client, { email, password: PASSWORD });
    const ordinary = await getSessionUser(password.client);
    expect(isRecoverySession(ordinary, undefined)).toBe(false);
    expect(isRecoverySession(ordinary, crypto.randomUUID())).toBe(false);
    expect(await updatePassword(password.client, newPassword, undefined)).toEqual({
      ok: false,
      error: "invalid_link",
    });
    expect(
      await signInWithPassword(createTestClient().client, { email, password: PASSWORD }),
    ).toEqual({ ok: true });

    const recovery = createTestClient();
    const before = (await findEmails(email)).length;
    await new Promise((r) => setTimeout(r, 1200));
    await requestPasswordReset(recovery.client, email);
    await expect.poll(async () => (await findEmails(email)).length).toBe(before + 1);
    const link = extractLink(first(await findEmails(email)).html);
    expect(link.type).toBe("recovery");
    expect(
      await verifyEmailLink(recovery.client, { tokenHash: link.tokenHash, type: "recovery" }),
    ).toEqual({ ok: true });

    const session = await getSessionUser(recovery.client);
    expect(isRecoverySession(session, session?.sessionId)).toBe(true);
    expect(await updatePassword(recovery.client, PASSWORD, session?.sessionId)).toEqual({
      ok: false,
      error: "same_password",
    });
    expect(await updatePassword(recovery.client, newPassword, session?.sessionId)).toEqual({
      ok: true,
    });

    expect(
      await signInWithPassword(createTestClient().client, { email, password: PASSWORD }),
    ).toEqual({ ok: false, error: "invalid_credentials" });
    expect(
      await signInWithPassword(createTestClient().client, { email, password: newPassword }),
    ).toEqual({ ok: true });
  });
});

describe("email link verification", () => {
  it("leaves the token valid until it is verified, and accepts it once", async () => {
    const email = uniqueEmail("once");
    await signUp(createTestClient().client, { email, password: PASSWORD });
    const { url, tokenHash } = extractLink((await waitForEmail(email)).html);

    const page = parseEmailLink({
      token_hash: url.searchParams.get("token_hash") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    expect(page).toEqual({ tokenHash, type: "signup" });

    expect(await verifyEmailLink(createTestClient().client, { tokenHash, type: "signup" })).toEqual(
      { ok: true },
    );
    expect(await verifyEmailLink(createTestClient().client, { tokenHash, type: "signup" })).toEqual(
      { ok: false, error: "invalid_link" },
    );
  });

  it("rejects a made-up token", async () => {
    const { client } = createTestClient();
    expect(await verifyEmailLink(client, { tokenHash: "nope", type: "magiclink" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});

describe("session check", () => {
  it("returns null with no cookies", async () => {
    expect(await getSessionUser(createTestClient().client)).toBeNull();
  });

  async function sessionCookies() {
    const email = await confirmedUser("forge");
    const { client, jar } = createTestClient();
    await signInWithPassword(client, { email, password: PASSWORD });
    return [...jar.cookies.values()].map(({ name, value }) => ({ name, value }));
  }

  async function withAccessToken(transform: (token: string) => string) {
    const { baseName, session } = sessionFromCookies(await sessionCookies());
    const forged = {
      ...session,
      access_token: transform(session.access_token),
      refresh_token: "forged",
    };
    const jar = createJar([sessionCookie(baseName, forged)]);
    return getSessionUser(createTestClient(jar).client);
  }

  function parts(token: string) {
    const [header = "", payload = "", signature = ""] = token.split(".");
    return { header, payload, signature };
  }

  it("returns null for a token signed with another key", async () => {
    const user = await withAccessToken((token) => {
      const { header, payload } = parts(token);
      const signature = createHmac("sha256", "a-different-secret")
        .update(`${header}.${payload}`)
        .digest("base64url");
      return [header, payload, signature].join(".");
    });
    expect(user).toBeNull();
  });

  it("returns null for a tampered payload", async () => {
    const user = await withAccessToken((token) => {
      const { header, payload, signature } = parts(token);
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string };
      claims.sub = crypto.randomUUID();
      return [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(
        ".",
      );
    });
    expect(user).toBeNull();
  });

  it("returns the user for the genuine session", async () => {
    const cookies = await sessionCookies();
    const user = await getSessionUser(createTestClient(createJar(cookies)).client);
    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Google sign-in", () => {
  it("returns an authorize URL that redirects to the callback and sets the PKCE verifier", async () => {
    const { client, jar } = createTestClient();
    const result = await startGoogleSignIn(client, "http://localhost:3000/auth/callback");
    if (!result.ok) throw new Error(result.error);

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(`${env.url}/auth/v1/authorize`);
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
    expect([...jar.cookies.keys()].some((name) => name.endsWith("-code-verifier"))).toBe(true);
  });
});
