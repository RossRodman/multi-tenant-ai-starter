import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn(() =>
  Promise.resolve({ error: { code: "invalid_credentials", message: "nope" } }),
);
const verifyOtp = vi.fn(() =>
  Promise.resolve({ error: { code: "otp_expired", message: "expired" } }),
);
const getSupabase = vi.fn(() => Promise.resolve({ auth: { signInWithPassword, verifyOtp } }));
const requestHeaders = new Headers();

vi.mock("@/server/supabase/client", () => ({ getSupabase }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(requestHeaders) }));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ trustedProxyHops: 1 }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { signInAction, confirmEmailAction } = await import("../src/app/(auth)/actions");
const { IP_EMAIL_LIMIT, IP_LIMIT } = await import("../src/server/rate-limit");

function signInForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", "whatever-1");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sign-in rate limit", () => {
  it("answers rate_limited without calling Supabase once the limit is reached", async () => {
    requestHeaders.set("x-forwarded-for", "10.0.0.1");
    const email = "limited@example.com";

    for (let i = 0; i < IP_EMAIL_LIMIT; i++) {
      expect(await signInAction({}, signInForm(email))).toMatchObject({
        error: "invalid_credentials",
      });
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(IP_EMAIL_LIMIT);

    expect(await signInAction({}, signInForm(email))).toMatchObject({ error: "rate_limited" });
    expect(signInWithPassword).toHaveBeenCalledTimes(IP_EMAIL_LIMIT);
    expect(getSupabase).toHaveBeenCalledTimes(IP_EMAIL_LIMIT);
  });

  it("limits an address across different emails", async () => {
    requestHeaders.set("x-forwarded-for", "10.0.0.2");
    for (let i = 0; i < IP_LIMIT; i++) {
      await signInAction({}, signInForm(`user${String(i)}@example.com`));
    }
    signInWithPassword.mockClear();

    expect(await signInAction({}, signInForm("fresh@example.com"))).toMatchObject({
      error: "rate_limited",
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("confirm rate limit", () => {
  it("redirects with rate_limited without calling Supabase", async () => {
    requestHeaders.set("x-forwarded-for", "10.0.0.3");
    const form = new FormData();
    form.set("token_hash", "abc");
    form.set("type", "signup");
    form.set("email", "someone@example.com");

    for (let i = 0; i < IP_LIMIT; i++) {
      await expect(confirmEmailAction(form)).rejects.toThrow(/^redirect:/);
    }
    getSupabase.mockClear();

    await expect(confirmEmailAction(form)).rejects.toThrow(
      "redirect:/auth/confirm?error=rate_limited",
    );
    expect(getSupabase).not.toHaveBeenCalled();
  });
});
