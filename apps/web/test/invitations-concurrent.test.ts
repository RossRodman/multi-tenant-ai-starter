import { describe, expect, it, vi } from "vitest";

vi.mock("../src/server/mail/send", () => ({ sendMail: () => Promise.resolve({ ok: true }) }));
vi.mock("../src/server/env", () => ({ getServerEnv: () => ({ appUrl: "http://localhost:3000" }) }));
vi.mock("../src/server/members", () => ({ listMembers: () => Promise.resolve([]) }));

const { inviteMembers } = await import("../src/server/invitations");

function clientRefusingEveryInsert() {
  const insertChain = {
    select: () => ({
      single: () =>
        Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } }),
    }),
  };
  const deleteChain: Record<string, unknown> = {
    eq: () => deleteChain,
    is: () => deleteChain,
    select: () => Promise.resolve({ data: [{ id: "old" }], error: null }),
  };
  return { from: () => ({ insert: () => insertChain, delete: () => deleteChain }) };
}

describe("inviteMembers racing another invitation for the same address", () => {
  it("treats a second unique violation as already invited without logging an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const results = await inviteMembers(
      clientRefusingEveryInsert() as never,
      { id: "org-1", name: "Acme" },
      { email: "owner@example.com" },
      [{ email: "new@example.com", role: "member" }],
    );
    expect(results).toEqual([{ email: "new@example.com", result: "sent" }]);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
