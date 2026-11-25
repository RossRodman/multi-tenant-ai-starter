import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { LAST_ORG_COOKIE } from "../src/server/organizations";
import { refreshSession } from "../src/server/supabase/proxy";
import "./env";
import {
  createAdminClient,
  createTestClient,
  PASSWORD,
  sessionCookie,
  sessionFromCookies,
} from "./harness";

const ORIGIN = "http://localhost:3000";

function request(
  path: string,
  cookies: { name: string; value: string }[] = [],
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  return new NextRequest(new URL(path, ORIGIN), {
    method: init.method,
    headers: { ...(cookies.length ? { cookie } : {}), ...init.headers },
  });
}

async function signedInCookies() {
  const { jar, client } = createTestClient();
  const email = `proxy-${crypto.randomUUID()}@example.com`;
  const created = await createAdminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { baseName, session } = sessionFromCookies(
    [...jar.cookies.values()].map(({ name, value }) => ({ name, value })),
  );
  return { cookies: [sessionCookie(baseName, session)], userId: created.data.user.id };
}

describe("protected routes without a session", () => {
  it.each([
    ["/app", "/app"],
    ["/app?invitation=abc", "/app?invitation=abc"],
    ["/app/new", "/app/new"],
    ["/o/acme", "/o/acme"],
    ["/o/acme/members", "/o/acme/members"],
    ["/o/acme/members?status=resent", "/o/acme/members?status=resent"],
  ])("redirects %s to sign-in and back", async (path, next) => {
    const response = await refreshSession(request(path));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe(next);
  });

  it("lets Server Action POSTs through for requireUser to handle", async () => {
    const response = await refreshSession(request("/o/acme/members", [], { method: "POST" }));
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/", "/sign-in", "/sign-up", "/auth/confirm", "/application", "/org/acme"])(
    "leaves %s alone",
    async (path) => {
      const response = await refreshSession(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.cookies.get(LAST_ORG_COOKIE)).toBeUndefined();
    },
  );
});

describe("last organization cookie", () => {
  it("is set for a valid slug under /o/ with a session, with hardened options", async () => {
    const { cookies, userId } = await signedInCookies();
    try {
      const response = await refreshSession(request("/o/acme-inc/members", cookies));
      expect(response.headers.get("location")).toBeNull();
      expect(response.cookies.get(LAST_ORG_COOKIE)).toMatchObject({
        value: "acme-inc",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    } finally {
      await createAdminClient().auth.admin.deleteUser(userId);
    }
  });

  it.each([
    ["next-router-prefetch", "1"],
    ["purpose", "prefetch"],
    ["sec-purpose", "prefetch;prerender"],
  ])("is not set for a prefetch (%s)", async (name, value) => {
    const { cookies, userId } = await signedInCookies();
    try {
      const response = await refreshSession(
        request("/o/acme-inc", cookies, { headers: { [name]: value } }),
      );
      expect(response.cookies.get(LAST_ORG_COOKIE)).toBeUndefined();
    } finally {
      await createAdminClient().auth.admin.deleteUser(userId);
    }
  });

  it.each([
    "/o/UPPER",
    "/o/ab",
    "/o/-bad",
    "/o/a--b",
    "/o/with_underscore",
    `/o/${"a".repeat(49)}`,
    "/app",
  ])("is not set for %s", async (path) => {
    const { cookies, userId } = await signedInCookies();
    try {
      const response = await refreshSession(request(path, cookies));
      expect(response.cookies.get(LAST_ORG_COOKIE)).toBeUndefined();
    } finally {
      await createAdminClient().auth.admin.deleteUser(userId);
    }
  });
});
