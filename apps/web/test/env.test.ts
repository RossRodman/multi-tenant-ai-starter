import { describe, expect, it } from "vitest";

import { parseServerEnv } from "../src/server/env";

const DEMO_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const billing = {
  SUPABASE_SECRET_KEY: "sb_secret_hosted",
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
};

const mail = {
  SMTP_URL: "smtps://smtp.example.com:465",
  MAIL_FROM: "no-reply@example.com",
  ...billing,
};

const local = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DEMO_KEY,
};

const hosted = {
  ...mail,
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
      expect(() => parseServerEnv({ ...mail, ...local }, "production")).not.toThrow();
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

describe("mail settings", () => {
  it("default to the local Mailpit outside production", () => {
    expect(parseServerEnv(local, "development")).toMatchObject({
      smtpUrl: "smtp://127.0.0.1:54325",
      mailFrom: "Multi-tenant AI Starter <no-reply@localhost>",
    });
  });

  it("are required in production", () => {
    expect(() =>
      parseServerEnv({ ...hosted, SMTP_URL: undefined, MAIL_FROM: undefined }, "production"),
    ).toThrow(/SMTP_URL.*MAIL_FROM/s);
    expect(parseServerEnv(hosted, "production")).toMatchObject({
      smtpUrl: mail.SMTP_URL,
      mailFrom: mail.MAIL_FROM,
    });
  });

  it.each(["http://smtp.example.com", "smtp.example.com:25", "not a url"])(
    "reject SMTP_URL=%j",
    (value) => {
      expect(() => parseServerEnv({ ...local, SMTP_URL: value }, "development")).toThrow(
        /SMTP_URL/,
      );
    },
  );

  it.each(["Acme <hello@example.com>", "hello@example.com"])("accept MAIL_FROM=%j", (value) => {
    expect(parseServerEnv({ ...local, MAIL_FROM: value }, "development").mailFrom).toBe(value);
  });

  it.each([
    "nobody",
    "Acme <nobody>",
    "a@b.c\r\nBcc: x@y.z",
    "<a@b.c>",
    "x@y.z, q@r.s",
    "Acme, Inc <a@b.c>",
    "Acme; Inc <a@b.c>",
    "Acme: Inc <a@b.c>",
    "Acme (Inc) <a@b.c>",
    "a,b@c.d",
    "a;b@c.d",
    "a@b.c;d",
  ])("reject MAIL_FROM=%j", (value) => {
    expect(() => parseServerEnv({ ...local, MAIL_FROM: value }, "development")).toThrow(
      /MAIL_FROM/,
    );
  });
});

describe("billing settings", () => {
  it("may be missing outside production", () => {
    expect(parseServerEnv(local, "development")).toMatchObject({
      supabaseSecretKey: undefined,
      stripeSecretKey: undefined,
      stripeWebhookSecret: undefined,
    });
  });

  it("treat blank values as missing outside production", () => {
    const env = parseServerEnv(
      { ...local, SUPABASE_SECRET_KEY: "", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" },
      "development",
    );
    expect(env.stripeSecretKey).toBeUndefined();
  });

  it("are required in production", () => {
    expect(() =>
      parseServerEnv(
        {
          ...hosted,
          SUPABASE_SECRET_KEY: undefined,
          STRIPE_SECRET_KEY: undefined,
          STRIPE_WEBHOOK_SECRET: undefined,
        },
        "production",
      ),
    ).toThrow(/SUPABASE_SECRET_KEY.*STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET/s);
  });

  it("are read when present", () => {
    expect(parseServerEnv({ ...local, ...billing }, "development")).toMatchObject({
      supabaseSecretKey: "sb_secret_hosted",
      stripeSecretKey: "sk_test_abc",
      stripeWebhookSecret: "whsec_abc",
    });
  });

  it("reject a live key outside production", () => {
    expect(() =>
      parseServerEnv({ ...local, STRIPE_SECRET_KEY: "sk_live_abc" }, "development"),
    ).toThrow(/live Stripe key/);
    expect(() =>
      parseServerEnv({ ...hosted, STRIPE_SECRET_KEY: "sk_live_abc" }, "production"),
    ).not.toThrow();
  });

  it.each(["pk_test_abc", "rk_test_abc", "sk_abc", "not a key"])(
    "reject STRIPE_SECRET_KEY=%j",
    (value) => {
      expect(() => parseServerEnv({ ...local, STRIPE_SECRET_KEY: value }, "development")).toThrow(
        /STRIPE_SECRET_KEY/,
      );
    },
  );

  it("reject a webhook secret without the whsec_ prefix", () => {
    expect(() => parseServerEnv({ ...local, STRIPE_WEBHOOK_SECRET: "abc" }, "development")).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });
});
