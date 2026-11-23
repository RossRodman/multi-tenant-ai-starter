import { describe, expect, it } from "vitest";

import {
  clientIp,
  createAuthLimiter,
  createRateLimiter,
  IP_EMAIL_LIMIT,
  IP_LIMIT,
  WINDOW_MS,
} from "../src/server/rate-limit";

function clock(start = 0) {
  const state = { now: start };
  return { state, now: () => state.now };
}

describe("createRateLimiter", () => {
  it("allows up to the limit and blocks the rest of the window", () => {
    const { now } = clock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now });
    expect([1, 2, 3, 4, 5].map(() => limiter.hit("k").ok)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("counts keys separately", () => {
    const { now } = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now });
    expect(limiter.hit("a").ok).toBe(true);
    expect(limiter.hit("b").ok).toBe(true);
    expect(limiter.hit("a").ok).toBe(false);
  });

  it("starts a new window once the old one has passed", () => {
    const { state, now } = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now });
    expect(limiter.hit("k").ok).toBe(true);
    state.now = 999;
    expect(limiter.hit("k").ok).toBe(false);
    state.now = 1000;
    expect(limiter.hit("k").ok).toBe(true);
  });

  it("does not extend the window while blocked", () => {
    const { state, now } = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now });
    limiter.hit("k");
    state.now = 900;
    limiter.hit("k");
    state.now = 1000;
    expect(limiter.hit("k").ok).toBe(true);
  });
});

describe("createAuthLimiter", () => {
  it("limits one email from one address", () => {
    const { now } = clock();
    const limiter = createAuthLimiter(now);
    const results = Array.from({ length: IP_EMAIL_LIMIT + 1 }, () =>
      limiter.allow("1.1.1.1", "a@example.com"),
    );
    expect(results.slice(0, IP_EMAIL_LIMIT).every(Boolean)).toBe(true);
    expect(results.at(-1)).toBe(false);
    expect(limiter.allow("1.1.1.1", "b@example.com")).toBe(true);
    expect(limiter.allow("2.2.2.2", "a@example.com")).toBe(true);
  });

  it("limits one address across emails", () => {
    const { now } = clock();
    const limiter = createAuthLimiter(now);
    for (let i = 0; i < IP_LIMIT; i++) {
      expect(limiter.allow("1.1.1.1", `user${String(i)}@example.com`)).toBe(true);
    }
    expect(limiter.allow("1.1.1.1", "another@example.com")).toBe(false);
    expect(limiter.allow("1.1.1.1")).toBe(false);
    expect(limiter.allow("2.2.2.2")).toBe(true);
  });

  it("allows again after the window", () => {
    const { state, now } = clock();
    const limiter = createAuthLimiter(now);
    for (let i = 0; i < IP_EMAIL_LIMIT; i++) limiter.allow("1.1.1.1", "a@example.com");
    expect(limiter.allow("1.1.1.1", "a@example.com")).toBe(false);
    state.now = WINDOW_MS;
    expect(limiter.allow("1.1.1.1", "a@example.com")).toBe(true);
  });
});

describe("clientIp", () => {
  const forwarded = (value: string) => new Headers({ "x-forwarded-for": value });

  it("takes the address the trusted proxy appended, not one the client sent", () => {
    expect(clientIp(forwarded("6.6.6.6, 1.1.1.1"), 1)).toBe("1.1.1.1");
    expect(clientIp(forwarded(" 6.6.6.6 , 1.1.1.1 , 10.0.0.2 "), 2)).toBe("1.1.1.1");
  });

  it("uses the only address when there is no proxy chain", () => {
    expect(clientIp(forwarded("1.1.1.1"), 1)).toBe("1.1.1.1");
    expect(clientIp(forwarded("1.1.1.1"), 2)).toBe("1.1.1.1");
  });

  it("ignores x-real-ip and falls back to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }), 1)).toBe("unknown");
    expect(clientIp(forwarded(" , "), 1)).toBe("unknown");
  });
});
