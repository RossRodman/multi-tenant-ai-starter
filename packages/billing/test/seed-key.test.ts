import { describe, expect, it } from "vitest";

import { seedKey } from "../src/seed-key";

describe("seedKey", () => {
  it("accepts a test key", () => {
    expect(seedKey("sk_test_abc123", false)).toBe("sk_test_abc123");
  });

  it("refuses a live key without --live", () => {
    expect(() => seedKey("sk_live_abc123", false)).toThrow(/Refusing to seed a live account/);
  });

  it("accepts a live key with --live", () => {
    expect(seedKey("sk_live_abc123", true)).toBe("sk_live_abc123");
  });

  it.each([undefined, "", "pk_test_abc123", "rk_live_abc123", "sk_test_"])(
    "refuses %j",
    (value) => {
      expect(() => seedKey(value, true)).toThrow(/STRIPE_SECRET_KEY/);
    },
  );
});
