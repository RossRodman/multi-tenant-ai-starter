import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabase = vi.fn(() => Promise.resolve({}));
const getOrganization = vi.fn();
const inviteMembers = vi.fn();
const resendInvitation = vi.fn();
const requireUser = vi.fn();
const updateOrganization = vi.fn();
const rememberOrganization = vi.fn();

vi.mock("@/server/session", () => ({ requireUser }));
vi.mock("@/server/supabase/client", () => ({ getSupabase }));
vi.mock("@/server/organizations", () => ({
  getOrganization,
  updateOrganization,
  rememberOrganization,
}));
vi.mock("@/server/invitations", () => ({
  inviteMembers,
  resendInvitation,
  revokeInvitation: vi.fn(),
}));
vi.mock("@/server/members", () => ({ changeRole: vi.fn(), removeMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { changeSlugAction, inviteMembersAction, resendInvitationAction } =
  await import("../src/app/o/[slug]/actions");
const { INVITE_LIMIT } = await import("../src/server/rate-limit");

function form(emails: string[], role = "member") {
  const data = new FormData();
  data.set("slug", "acme");
  for (const email of emails) {
    data.append("email", email);
    data.append("role", role);
  }
  return data;
}

const organization = { id: "org-1", name: "Acme", slug: "acme", role: "owner" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({
    id: crypto.randomUUID(),
    email: "owner@example.com",
    sessionId: "s",
  });
  getOrganization.mockResolvedValue(organization);
  inviteMembers.mockImplementation((_c, _o, _i, rows: { email: string }[]) =>
    Promise.resolve(rows.map(({ email }) => ({ email, result: "sent" }))),
  );
});

describe("inviteMembersAction", () => {
  it("passes the non-empty rows to inviteMembers", async () => {
    const state = await inviteMembersAction({}, form(["a@example.com", "  ", "b@example.com"]));
    expect(inviteMembers).toHaveBeenCalledWith(
      expect.anything(),
      organization,
      { email: "owner@example.com" },
      [
        { email: "a@example.com", role: "member" },
        { email: "b@example.com", role: "member" },
      ],
    );
    expect(state.results).toHaveLength(2);
  });

  it("rejects an empty submission, too many rows and an unknown role without any request", async () => {
    expect((await inviteMembersAction({}, form(["", " "]))).error).toBe("empty");
    expect(
      (
        await inviteMembersAction(
          {},
          form(Array.from({ length: 11 }, (_, i) => `a${String(i)}@example.com`)),
        )
      ).error,
    ).toBe("too_many");
    expect((await inviteMembersAction({}, form(["a@example.com"], "superuser"))).error).toBe(
      "unknown",
    );
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    getOrganization.mockResolvedValue({ ...organization, role: "member" });
    expect((await inviteMembersAction({}, form(["a@example.com"]))).error).toBe("forbidden");
    expect(inviteMembers).not.toHaveBeenCalled();
  });

  it("counts every row against the hourly limit and then makes no request", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => `a${String(i)}@example.com`);
    for (let sent = 0; sent < INVITE_LIMIT; sent += rows.length) {
      expect((await inviteMembersAction({}, form(rows))).error).toBeUndefined();
    }
    getSupabase.mockClear();
    getOrganization.mockClear();
    inviteMembers.mockClear();

    const limited = await inviteMembersAction({}, form(["one@example.com"]));
    expect(limited.error).toBe("rate_limited");
    expect(getSupabase).not.toHaveBeenCalled();
    expect(getOrganization).not.toHaveBeenCalled();
    expect(inviteMembers).not.toHaveBeenCalled();

    requireUser.mockResolvedValue({
      id: crypto.randomUUID(),
      email: "x@example.com",
      sessionId: "s",
    });
    expect((await inviteMembersAction({}, form(["one@example.com"]))).error).toBeUndefined();
  });

  it("rejects a batch over the remainder without spending the budget", async () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `a${String(i)}@example.com`);
    for (const size of [10, 10, 10, 10, 4]) await inviteMembersAction({}, form(rows(size)));
    expect((await inviteMembersAction({}, form(rows(10)))).error).toBe("rate_limited");
    expect((await inviteMembersAction({}, form(rows(6)))).error).toBeUndefined();
    expect((await inviteMembersAction({}, form(rows(1)))).error).toBe("rate_limited");
  });
});

describe("resendInvitationAction", () => {
  function resendForm() {
    const data = new FormData();
    data.set("slug", "acme");
    data.set("id", crypto.randomUUID());
    return data;
  }

  it("redirects with a rate_limited status before any request", async () => {
    resendInvitation.mockResolvedValue("sent");
    for (let i = 0; i < INVITE_LIMIT; i++) {
      await expect(resendInvitationAction(resendForm())).rejects.toThrow("status=resent");
    }
    getSupabase.mockClear();
    getOrganization.mockClear();
    resendInvitation.mockClear();

    await expect(resendInvitationAction(resendForm())).rejects.toThrow("status=rate_limited");
    expect(getSupabase).not.toHaveBeenCalled();
    expect(getOrganization).not.toHaveBeenCalled();
    expect(resendInvitation).not.toHaveBeenCalled();
  });
});

describe("slug field", () => {
  it("sends a malformed slug to /app before any request", async () => {
    const data = new FormData();
    data.set("slug", "../evil?x=1");
    data.set("id", crypto.randomUUID());
    await expect(resendInvitationAction(data)).rejects.toThrow("redirect:/app");
    expect(getSupabase).not.toHaveBeenCalled();
    expect(getOrganization).not.toHaveBeenCalled();
  });
});

describe("resendInvitationAction statuses", () => {
  it("reports an address that already joined as already_member", async () => {
    resendInvitation.mockResolvedValue("already_member");
    const data = new FormData();
    data.set("slug", "acme");
    data.set("id", crypto.randomUUID());
    await expect(resendInvitationAction(data)).rejects.toThrow("status=already_member");
  });

  it("reports a full organization as seat_limit", async () => {
    resendInvitation.mockResolvedValue("seat_limit");
    const data = new FormData();
    data.set("slug", "acme");
    data.set("id", crypto.randomUUID());
    await expect(resendInvitationAction(data)).rejects.toThrow("status=seat_limit");
  });
});

describe("inviteMembersAction submissions", () => {
  it("numbers each successful submission", async () => {
    const first = await inviteMembersAction({}, form(["a@example.com"]));
    const second = await inviteMembersAction(first, form(["b@example.com"]));
    expect([first.submission, second.submission]).toEqual([1, 2]);
  });
});

describe("changeSlugAction", () => {
  it("remembers the new slug before redirecting to it", async () => {
    updateOrganization.mockResolvedValue({ ok: true, slug: "renamed" });
    const data = new FormData();
    data.set("slug", "acme");
    data.set("new_slug", "renamed");
    await expect(changeSlugAction({}, data)).rejects.toThrow("redirect:/o/renamed/settings");
    expect(rememberOrganization).toHaveBeenCalledWith("renamed");
  });

  it("does not touch the cookie when the change fails", async () => {
    updateOrganization.mockResolvedValue({ ok: false, error: "slug_taken" });
    const data = new FormData();
    data.set("slug", "acme");
    data.set("new_slug", "taken");
    await changeSlugAction({}, data);
    expect(rememberOrganization).not.toHaveBeenCalled();
  });
});
