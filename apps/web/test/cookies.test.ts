import { afterEach, describe, expect, it } from "vitest";

import { hardenCookies } from "../src/server/supabase/cookies";
import { signInWithPassword, signOut, signUp, verifyEmailLink } from "../src/server/auth";
import {
  appUrl,
  createTestClient,
  extractLink,
  NAME,
  PASSWORD,
  uniqueEmail,
  waitForEmail,
} from "./harness";

afterEach(() => {
  appUrl.current = "http://localhost:3000";
});

async function signedIn() {
  const email = uniqueEmail("cookies");
  const { client, jar } = createTestClient();
  await signUp(client, { email, password: PASSWORD, name: NAME });
  const link = extractLink((await waitForEmail(email)).html);
  await verifyEmailLink(client, { tokenHash: link.tokenHash, type: "signup", email: link.email });
  return { client, jar, email };
}

describe("session cookies", () => {
  it("are HttpOnly and SameSite=Lax, not Secure over http", async () => {
    const { jar } = await signedIn();
    expect(jar.written.length).toBeGreaterThan(0);
    for (const { name, options } of jar.written) {
      expect(name).toMatch(/^sb-/);
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    }
  });

  it("are Secure when the app URL is https", async () => {
    appUrl.current = "https://app.example.com";
    const { client, jar, email } = await signedIn();
    await signInWithPassword(client, { email, password: PASSWORD });
    expect(jar.written.length).toBeGreaterThan(0);
    for (const { options } of jar.written) {
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    }
  });

  it("cannot be downgraded by the options the client passes", () => {
    const [cookie] = hardenCookies("https://app.example.com", [
      {
        name: "sb-session",
        value: "v",
        options: { httpOnly: false, secure: false, sameSite: "none", maxAge: 60 },
      },
    ]);
    expect(cookie?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  });

  it("are cleared on sign-out", async () => {
    const { client, jar } = await signedIn();
    expect(jar.cookies.size).toBeGreaterThan(0);
    const result = await signOut(client);
    expect(result).toEqual({ ok: true });
    expect(jar.cookies.size).toBe(0);
  });
});
