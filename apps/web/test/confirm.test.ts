import { describe, expect, it } from "vitest";

import { getSessionUser, parseEmailLink, verifyEmailLink } from "../src/server/auth";
import {
  createAdminClient,
  createTestClient,
  extractLink,
  findEmails,
  PASSWORD,
  first,
  uniqueEmail,
  waitForEmail,
} from "./harness";

async function magicLink(email: string) {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  return data.properties.hashed_token;
}

describe("verifyEmailLink with the email parameter", () => {
  it("signs in when the session email matches, ignoring case", async () => {
    const email = uniqueEmail("match");
    const tokenHash = await magicLink(email);
    const { client } = createTestClient();

    expect(
      await verifyEmailLink(client, { tokenHash, type: "magiclink", email: email.toLowerCase() }),
    ).toEqual({ ok: true });
    expect((await getSessionUser(client))?.email).toBe(email);
  });

  it("signs out and reports an invalid link when the email differs", async () => {
    const tokenHash = await magicLink(uniqueEmail("victim"));
    const { client } = createTestClient();

    expect(
      await verifyEmailLink(client, {
        tokenHash,
        type: "magiclink",
        email: uniqueEmail("attacker"),
      }),
    ).toEqual({ ok: false, error: "invalid_link" });
    expect(await getSessionUser(client)).toBeNull();
  });
});

describe("parseEmailLink", () => {
  const base = { token_hash: "abc", type: "signup" };

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not an email", "nobody"],
    ["a list", ["a@example.com"]],
  ])("rejects a %s email", (_label, email) => {
    expect(parseEmailLink({ ...base, email })).toBeNull();
  });

  it("normalises a valid email", () => {
    expect(parseEmailLink({ ...base, email: " Someone@Example.com " })).toEqual({
      tokenHash: "abc",
      type: "signup",
      email: "someone@example.com",
    });
  });
});

describe("email links", () => {
  it("carry the address, also when it contains a plus sign", async () => {
    const email = `plus+${crypto.randomUUID().slice(0, 8)}@example.com`;
    const { client } = createTestClient();
    await client.auth.signUp({ email, password: PASSWORD });
    await waitForEmail(email);

    const link = extractLink(first(await findEmails(email)).html);
    expect(link.email).toBe(email);
    expect(
      parseEmailLink({ token_hash: link.tokenHash, type: link.type, email: link.email }),
    ).toMatchObject({
      email,
    });
  });
});
