import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const getSupabase = vi.fn(() => Promise.resolve({ from: () => ({ insert }) }));
const revalidatePath = vi.fn();
const requireUser = vi.fn(() => Promise.resolve({ id: "user-1", email: null, sessionId: "s" }));

vi.mock("@/server/session", () => ({ requireUser }));
vi.mock("@/server/supabase/client", () => ({ getSupabase }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { createOrganizationAction } = await import("../src/app/app/actions");
const { fieldMessages } = await import("../src/app/app/form-state");
const { ORG_CREATE_LIMIT } = await import("../src/server/rate-limit");

function form(name: string, slug: string) {
  const data = new FormData();
  data.set("name", name);
  data.set("slug", slug);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: crypto.randomUUID(), email: null, sessionId: "s" });
});

describe("createOrganizationAction", () => {
  it("requires a user first", async () => {
    requireUser.mockRejectedValueOnce(new Error("redirect:/sign-in"));
    await expect(createOrganizationAction({}, form("Acme", "acme"))).rejects.toThrow(
      "redirect:/sign-in",
    );
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it("revalidates and redirects to /app on success", async () => {
    insert.mockResolvedValue({ error: null });
    await expect(createOrganizationAction({}, form("Acme", "acme"))).rejects.toThrow(
      "redirect:/app",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it.each([
    ["name", { name: "  ", slug: "acme" }, { fieldErrors: { name: fieldMessages.invalid_name } }],
    [
      "bad slug",
      { name: "Acme", slug: "A_B" },
      { fieldErrors: { slug: fieldMessages.invalid_slug } },
    ],
  ])("maps an invalid %s to its field and keeps the values", async (_label, values, expected) => {
    expect(await createOrganizationAction({}, form(values.name, values.slug))).toEqual({
      ...expected,
      values,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("maps a unique violation to the slug field", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    expect(await createOrganizationAction({}, form("Acme", "acme"))).toEqual({
      fieldErrors: { slug: fieldMessages.slug_taken },
      values: { name: "Acme", slug: "acme" },
    });
  });

  it("maps any other error to the generic one", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    insert.mockResolvedValue({ error: { code: "23503", message: "fk" } });
    try {
      expect(await createOrganizationAction({}, form("Acme", "acme"))).toEqual({
        error: "unknown",
        values: { name: "Acme", slug: "acme" },
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("limits each user and makes no request once limited", async () => {
    const user = { id: crypto.randomUUID(), email: null, sessionId: "s" };
    requireUser.mockResolvedValue(user);
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });

    for (let i = 0; i < ORG_CREATE_LIMIT; i++) {
      await createOrganizationAction({}, form("Acme", "acme"));
    }
    getSupabase.mockClear();
    insert.mockClear();

    expect(await createOrganizationAction({}, form("Acme", "acme"))).toEqual({
      error: "rate_limited",
      values: { name: "Acme", slug: "acme" },
    });
    expect(getSupabase).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    requireUser.mockResolvedValue({ id: crypto.randomUUID(), email: null, sessionId: "s" });
    await createOrganizationAction({}, form("Acme", "acme"));
    expect(getSupabase).toHaveBeenCalled();
  });
});
