import { describe, expect, it, vi } from "vitest";

const set = vi.fn();
const del = vi.fn();

vi.mock("@/server/supabase/client", () => ({
  getSupabase: () => Promise.resolve({ auth: { signOut: () => Promise.resolve({ error: null }) } }),
  getSessionlessSupabase: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ set, delete: del, get: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import "./env";

const { signOutAction } = await import("../src/app/(auth)/actions");

describe("signOutAction", () => {
  it("forgets the last organization", async () => {
    await expect(signOutAction()).rejects.toThrow("redirect:/sign-in");
    expect(set).toHaveBeenCalledWith("last_org", "", expect.objectContaining({ maxAge: 0 }));
  });
});
