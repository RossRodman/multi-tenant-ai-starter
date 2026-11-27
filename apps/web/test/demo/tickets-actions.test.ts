import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = { client: {}, organizationId: "org-1", userId: "user-1", role: "member" };
const ticketScope = vi.fn();
const createTicket = vi.fn();
const updateTicket = vi.fn();
const deleteTicket = vi.fn();

vi.mock("@/demo/tickets", () => ({ ticketScope, createTicket, updateTicket, deleteTicket }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));

const { createTicketAction, deleteTicketAction, setTicketStatusAction, updateTicketAction } =
  await import("../../src/app/o/[slug]/(demo)/tickets/actions");
const { ticketFieldMessages } = await import("../../src/demo/tickets/form-state");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ slug: "acme", ...values })) data.set(name, value);
  return data;
}

const id = crypto.randomUUID();

beforeEach(() => {
  vi.clearAllMocks();
  ticketScope.mockResolvedValue({ scope, organization: { id: "org-1", name: "Acme" } });
  createTicket.mockResolvedValue({ ok: true, id });
  updateTicket.mockResolvedValue({ ok: true });
  deleteTicket.mockResolvedValue({ ok: true });
});

describe("ticket actions", () => {
  it("creates a ticket in the member's organization, ignoring a posted organization", async () => {
    await expect(
      createTicketAction({}, form({ title: " Printer ", body: "Down", organization_id: "evil" })),
    ).rejects.toThrow("redirect:/o/acme/tickets");
    expect(ticketScope).toHaveBeenCalledWith("acme");
    expect(createTicket).toHaveBeenCalledWith(scope, { title: "Printer", body: "Down" });
  });

  it("returns field errors and keeps the values", async () => {
    expect(await createTicketAction({}, form({ title: "  ", body: "x".repeat(10_001) }))).toEqual({
      fieldErrors: { title: ticketFieldMessages.title, body: ticketFieldMessages.body },
      values: { title: "  ", body: "x".repeat(10_001) },
    });
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("sends non-members and unknown organizations to 404", async () => {
    ticketScope.mockResolvedValue(null);
    await expect(createTicketAction({}, form({ title: "Hi", body: "" }))).rejects.toThrow(
      "not-found",
    );
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("refuses an invalid slug", async () => {
    await expect(
      createTicketAction({}, form({ slug: "../x", title: "Hi", body: "" })),
    ).rejects.toThrow("redirect:/app");
    expect(ticketScope).not.toHaveBeenCalled();
  });

  it("updates and returns to the list with the same filter", async () => {
    await expect(
      updateTicketAction(
        {},
        form({ id, title: "Fixed", body: "", status: "closed", query: "q=vat&status=all&x=1" }),
      ),
    ).rejects.toThrow("redirect:/o/acme/tickets?q=vat&status=all");
    expect(updateTicket).toHaveBeenCalledWith(scope, id, {
      title: "Fixed",
      body: "",
      status: "closed",
    });
  });

  it("keeps the chosen status after a failed save", async () => {
    expect(
      await updateTicketAction({}, form({ id, title: " ", body: "", status: "closed" })),
    ).toMatchObject({ values: { title: " ", body: "", status: "closed" } });
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("returns to the list with the same filter after creating", async () => {
    await expect(
      createTicketAction({}, form({ title: "Hi", body: "", query: "status=closed&page=2" })),
    ).rejects.toThrow("redirect:/o/acme/tickets?status=closed&page=2");
  });

  it("rejects an unknown status", async () => {
    await expect(setTicketStatusAction(form({ id, status: "archived" }))).rejects.toThrow(
      "not-found",
    );
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it.each([
    ["status change", () => setTicketStatusAction(form({ id, status: "closed" })), updateTicket],
    ["delete", () => deleteTicketAction(form({ id })), deleteTicket],
  ])("answers 404 when the %s touches no ticket", async (_label, run, fn) => {
    fn.mockResolvedValue({ ok: false, error: "not_found" });
    await expect(run()).rejects.toThrow("not-found");
  });
});
