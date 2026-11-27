import { beforeAll, describe, expect, it } from "vitest";

import type { MembershipRole } from "@repo/db";

import {
  PAGE_SIZE,
  createTicket,
  deleteTicket,
  getTicket,
  listTickets,
  updateTicket,
} from "../../src/demo/tickets";
import type { TicketScope } from "../../src/demo/tickets";
import { parseFilter } from "../../src/demo/tickets/paths";
import { ticketFixtures } from "./setup";
import type { User } from "./setup";

const { newUser, newOrg, leave } = ticketFixtures();

let owner: User;
let admin: User;
let member: User;
let orgId: string;

function scopeOf(user: User, role: MembershipRole, organizationId = orgId): TicketScope {
  return { client: user.client, organizationId, userId: user.id, role };
}

async function created(scope: TicketScope, input: { title: string; body: string }) {
  const result = await createTicket(scope, input);
  if (!result.ok) throw new Error("ticket not created");
  return result;
}

const filter = (params: Record<string, string> = {}) => parseFilter(params);

beforeAll(async () => {
  [owner, admin, member] = await Promise.all([
    newUser("tm-owner", "Olivia Owner"),
    newUser("tm-admin"),
    newUser("tm-member", "Maria Member"),
  ]);
  orgId = await newOrg(owner, [
    [admin, "admin"],
    [member, "member"],
  ]);
});

describe("tickets module", () => {
  it("creates an open ticket and returns it with the author and permissions", async () => {
    const { id } = await created(scopeOf(member, "member"), {
      title: "Invoice PDF is blank",
      body: "Empty file.",
    });

    const own = await getTicket(scopeOf(member, "member"), id);
    expect(own).toMatchObject({
      id,
      title: "Invoice PDF is blank",
      status: "open",
      closedAt: null,
      author: { name: "Maria Member", email: member.email },
      canManage: true,
    });

    expect((await getTicket(scopeOf(admin, "admin"), id))?.canManage).toBe(true);
    expect((await getTicket(scopeOf(owner, "owner"), id))?.canManage).toBe(true);
  });

  it("returns null for missing, foreign and malformed ids", async () => {
    const outsider = await newUser("tm-outsider");
    const foreignOrg = await newOrg(outsider);
    const { id } = await created(scopeOf(outsider, "owner", foreignOrg), {
      title: "Foreign",
      body: "",
    });

    expect(await getTicket(scopeOf(owner, "owner"), id)).toBeNull();
    expect(await getTicket(scopeOf(owner, "owner"), crypto.randomUUID())).toBeNull();
    expect(await getTicket(scopeOf(owner, "owner"), "not-a-uuid")).toBeNull();
  });

  it("closes and reopens through updateTicket", async () => {
    const scope = scopeOf(member, "member");
    const { id } = await created(scope, { title: "Close me", body: "" });

    expect(await updateTicket(scope, id, { status: "closed" })).toEqual({ ok: true });
    expect((await getTicket(scope, id))?.closedAt).not.toBeNull();
    expect(await updateTicket(scope, id, { status: "open", title: "Reopened" })).toEqual({
      ok: true,
    });
    expect(await getTicket(scope, id)).toMatchObject({
      status: "open",
      closedAt: null,
      title: "Reopened",
    });
  });

  it("answers not_found for someone else's, foreign and malformed tickets", async () => {
    const { id } = await created(scopeOf(admin, "admin"), { title: "Not yours", body: "" });
    const notFound = { ok: false, error: "not_found" };

    expect((await getTicket(scopeOf(member, "member"), id))?.canManage).toBe(false);

    expect(await updateTicket(scopeOf(member, "member"), id, { status: "closed" })).toEqual(
      notFound,
    );
    expect(await deleteTicket(scopeOf(member, "member"), id)).toEqual(notFound);
    expect(
      await updateTicket(scopeOf(member, "member"), crypto.randomUUID(), { title: "x" }),
    ).toEqual(notFound);
    expect(await deleteTicket(scopeOf(member, "member"), "nope")).toEqual(notFound);
    expect(await deleteTicket(scopeOf(admin, "admin"), id)).toEqual({ ok: true });
  });

  it("filters by status, searches with stemming and paginates", async () => {
    const searcher = await newUser("tm-search");
    const org = await newOrg(searcher);
    const scope = scopeOf(searcher, "owner", org);
    const { id: closedId } = await created(scope, {
      title: "Wrong VAT on invoices",
      body: "Charged twice.",
    });
    await updateTicket(scope, closedId, { status: "closed" });
    await createTicket(scope, { title: "Login is slow", body: "The invoice page too." });
    for (let i = 0; i < PAGE_SIZE; i++) {
      await createTicket(scope, { title: `Filler ${String(i)}`, body: "" });
    }

    const open = await listTickets(scope, filter());
    expect(open.total).toBe(PAGE_SIZE + 1);
    expect(open.tickets).toHaveLength(PAGE_SIZE);
    expect(open.pageCount).toBe(2);
    expect(open.tickets[0]?.title).toBe(`Filler ${String(PAGE_SIZE - 1)}`);

    const second = await listTickets(scope, filter({ page: "2" }));
    expect(second.tickets.map((t) => t.title)).toEqual(["Login is slow"]);

    const beyond = await listTickets(scope, filter({ page: "9" }));
    expect(beyond).toMatchObject({ tickets: [], total: PAGE_SIZE + 1 });

    const found = await listTickets(scope, filter({ q: "invoice", status: "all" }));
    expect(found.tickets.map((t) => t.title).sort()).toEqual([
      "Login is slow",
      "Wrong VAT on invoices",
    ]);
    const closed = await listTickets(scope, filter({ q: "invoice", status: "closed" }));
    expect(closed.tickets.map((t) => t.id)).toEqual([closedId]);

    const syntax = await listTickets(scope, filter({ q: '"unbalanced -( or' }));
    expect(syntax.total).toBe(0);
  });

  it("shows a member who left as a former member", async () => {
    const leaver = await newUser("tm-leaver", "Lee Leaver");
    const leftOrg = await newOrg(owner, [[leaver, "member"]]);
    const { id } = await created(scopeOf(leaver, "member", leftOrg), {
      title: "Left",
      body: "",
    });
    await leave(leftOrg, leaver);

    expect((await getTicket(scopeOf(owner, "owner", leftOrg), id))?.author).toBeNull();
  });
});
