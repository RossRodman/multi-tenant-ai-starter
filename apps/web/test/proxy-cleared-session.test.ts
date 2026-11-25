import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const SESSION_COOKIE = "sb-127-auth-token";

vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createServerClient: (options: {
    cookies: {
      setAll: (
        cookies: { name: string; value: string; options: object }[],
        headers: Record<string, string>,
      ) => void;
    };
  }) => ({
    auth: {
      getClaims: () => {
        options.cookies.setAll([{ name: SESSION_COOKIE, value: "", options: { maxAge: 0 } }], {
          "cache-control": "no-store",
        });
        return Promise.resolve({ data: null, error: new Error("session revoked") });
      },
    },
  }),
}));

import "./env";

const { refreshSession } = await import("../src/server/supabase/proxy");

describe("sign-in redirect", () => {
  it("carries the cookies cleared for a revoked session", async () => {
    const response = await refreshSession(
      new NextRequest("http://localhost:3000/o/acme", {
        headers: { cookie: `${SESSION_COOKIE}=stale` },
      }),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/sign-in");
    expect(response.cookies.get(SESSION_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
