import { describe, expect, it } from "vitest";

import { parseServerEnv } from "../src/server/env";

const DEMO_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const local = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DEMO_KEY,
};

const hosted = {
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_hosted",
};

describe("parseServerEnv", () => {
  it("names every missing value", () => {
    expect(() => parseServerEnv({}, "development")).toThrow(
      /NEXT_PUBLIC_APP_URL.*NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/s,
    );
  });

  it("rejects a secret key in any NEXT_PUBLIC_ value", () => {
    expect(() =>
      parseServerEnv(
        { ...local, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" },
        "development",
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.*secret key/);
  });

  it("defaults AUTH_GOOGLE_ENABLED to false", () => {
    expect(parseServerEnv(local, "development").googleEnabled).toBe(false);
    expect(
      parseServerEnv({ ...local, AUTH_GOOGLE_ENABLED: "true" }, "development").googleEnabled,
    ).toBe(true);
  });

  it("rejects a non-boolean AUTH_GOOGLE_ENABLED", () => {
    expect(() => parseServerEnv({ ...local, AUTH_GOOGLE_ENABLED: "yes" }, "development")).toThrow(
      /AUTH_GOOGLE_ENABLED/,
    );
  });

  it("defaults TRUSTED_PROXY_HOPS to 1 and accepts a positive integer", () => {
    expect(parseServerEnv(local, "development").trustedProxyHops).toBe(1);
    expect(
      parseServerEnv({ ...local, TRUSTED_PROXY_HOPS: "2" }, "development").trustedProxyHops,
    ).toBe(2);
  });

  it.each(["0", "-1", "1.5", "two", ""])("rejects TRUSTED_PROXY_HOPS=%j", (value) => {
    expect(() => parseServerEnv({ ...local, TRUSTED_PROXY_HOPS: value }, "development")).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
  });

  describe("production guard", () => {
    it("lets a loopback app use a local Supabase", () => {
      expect(() => parseServerEnv(local, "production")).not.toThrow();
    });

    it("accepts a public app with a hosted Supabase", () => {
      expect(() => parseServerEnv(hosted, "production")).not.toThrow();
    });

    it("rejects a public app with a loopback Supabase URL", () => {
      expect(() =>
        parseServerEnv(
          { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
          "production",
        ),
      ).toThrow(/local Supabase/);
    });

    it("rejects a public app with the Supabase CLI demo key", () => {
      expect(() =>
        parseServerEnv({ ...hosted, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DEMO_KEY }, "production"),
      ).toThrow(/demo key/);
    });

    it("does not apply outside production", () => {
      expect(() =>
        parseServerEnv({ ...local, NEXT_PUBLIC_APP_URL: "https://app.example.com" }, "development"),
      ).not.toThrow();
    });
  });
});
