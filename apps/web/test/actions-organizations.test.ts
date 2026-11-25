import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const getSupabase = vi.fn(() => Promise.resolve({ from: () => ({ insert }) }));
const revalidatePath = vi.fn();
const acceptInvitation = vi.fn();
const rememberOrganization = vi.fn();
const requireUser = vi.fn(() => Promise.resolve({ id: "user-1", email: null, sessionId: "s" }));

vi.mock("@/server/session", () => ({ requireUser }));
vi.mock("@/server/supabase/client", () => ({ getSupabase }));
vi.mock("@/server/invitations", () => ({ acceptInvitation }));
vi.mock("@/server/organizations/remember", () => ({ rememberOrganization }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { acceptInvitationAction, createOrganizationAction } = await import("../src/app/app/actions");
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

describe("acceptInvitationAction", () => {
  const id = "5f0d5c9e-3a4b-4c1d-8e2f-7a6b5c4d3e2f";
  const data = () => {
    const formData = new FormData();
    formData.set("id", id);
    return formData;
  };

  it("remembers the joined organization before redirecting to it", async () => {
    acceptInvitation.mockResolvedValue({ ok: true, slug: "acme" });
    await expect(acceptInvitationAction(data())).rejects.toThrow("redirect:/o/acme");
    expect(rememberOrganization).toHaveBeenCalledWith("acme");
  });

  it("goes back to the chooser with the invitation and a failure marker", async () => {
    acceptInvitation.mockResolvedValue({ ok: false, error: "unknown" });
    await expect(acceptInvitationAction(data())).rejects.toThrow(
      `redirect:/app?invitation=${id}&error=unknown`,
    );
    expect(rememberOrganization).not.toHaveBeenCalled();
  });
});
