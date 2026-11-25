import { beforeEach, describe, expect, it, vi } from "vitest";

const ok = () => Promise.resolve({ error: null });
const sessionless = {
  auth: {
    signUp: vi.fn(ok),
    signInWithOtp: vi.fn(ok),
    resend: vi.fn(ok),
    resetPasswordForEmail: vi.fn(ok),
  },
};
const getSupabase = vi.fn();
const getSessionlessSupabase = vi.fn(() => sessionless);

vi.mock("@/server/supabase/client", () => ({ getSupabase, getSessionlessSupabase }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ trustedProxyHops: 1 }) }));

const { requestPasswordResetAction, signInAction, signUpAction } =
  await import("../src/app/(auth)/actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("actions that send email", () => {
  it.each([
    [
      "sign-up",
      () =>
        signUpAction({}, form({ name: "Alex", email: "a@example.com", password: "long-enough-1" })),
    ],
    ["magic link", () => signInAction({}, form({ email: "b@example.com", intent: "magic-link" }))],
    ["resend", () => signInAction({}, form({ email: "c@example.com", intent: "resend" }))],
    ["password reset", () => requestPasswordResetAction({}, form({ email: "d@example.com" }))],
  ])("%s uses the sessionless client", async (_name, run) => {
    expect((await run()).notice).toBeDefined();
    expect(getSessionlessSupabase).toHaveBeenCalledOnce();
    expect(getSupabase).not.toHaveBeenCalled();
  });
});

describe("signUpAction name", () => {
  it.each(["", "   ", "\u200b", "a\u202eb"])(
    "rejects the name %j without a Supabase call",
    async (name) => {
      const state = await signUpAction(
        {},
        form({ name, email: "a@example.com", password: "long-enough-1" }),
      );
      expect(state.fieldErrors?.name).toBeDefined();
      expect(sessionless.auth.signUp).not.toHaveBeenCalled();
    },
  );

  it("sends the trimmed name as user metadata", async () => {
    await signUpAction(
      {},
      form({ name: "  Alex Morgan ", email: "a@example.com", password: "long-enough-1" }),
    );
    expect(sessionless.auth.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "long-enough-1",
      options: { data: { name: "Alex Morgan" } },
    });
  });
});
