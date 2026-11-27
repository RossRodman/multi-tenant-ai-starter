import { beforeAll, describe, expect, it } from "vitest";

import { createSessionlessClient } from "@repo/db";

import { env } from "../env";
import { createAdminClient } from "../harness";
import { ticketFixtures } from "./setup";
import type { User } from "./setup";

const { db, newUser, newOrg, leave } = ticketFixtures();

let owner: User;
let admin: User;
let member: User;
let outsider: User;
let orgId: string;
let foreignOrgId: string;

async function insertTicket(user: User, organizationId: string, title = "Printer is down") {
  const { data, error } = await user.client
    .from("tickets")
    .insert({ organization_id: organizationId, title, body: "It shows error 42." })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  [owner, admin, member, outsider] = await Promise.all([
    newUser("tk-owner"),
    newUser("tk-admin"),
    newUser("tk-member"),
    newUser("tk-outsider"),
  ]);
  orgId = await newOrg(owner, [
    [admin, "admin"],
    [member, "member"],
  ]);
  foreignOrgId = await newOrg(outsider);
});

describe("tickets RLS", () => {
  it("denies anon", async () => {
    const anon = createSessionlessClient({ url: env.url, key: env.publishableKey });
    const { data, error } = await anon.from("tickets").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("shows a ticket to every member and to nobody outside the organization", async () => {
    const id = await insertTicket(member, orgId);
    for (const user of [owner, admin, member]) {
      const { data } = await user.client.from("tickets").select("id").eq("id", id);
      expect(data).toEqual([{ id }]);
    }
    const { data } = await outsider.client.from("tickets").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("sets the author from the session and opens the ticket", async () => {
    const id = await insertTicket(member, orgId);
    const { rows } = await db.query<{ created_by: string; status: string; closed_at: Date | null }>(
      "select created_by, status, closed_at from public.tickets where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ created_by: member.id, status: "open", closed_at: null });
  });

  it("refuses inserts into another organization", async () => {
    const { error } = await member.client
      .from("tickets")
      .insert({ organization_id: foreignOrgId, title: "Hello" });
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["created_by", () => ({ created_by: admin.id })],
    ["status", () => ({ status: "closed" })],
    ["closed_at", () => ({ closed_at: new Date().toISOString() })],
    ["created_at", () => ({ created_at: new Date().toISOString() })],
  ])("refuses %s on insert", async (_column, extra) => {
    const { error } = await member.client
      .from("tickets")
      .insert({ organization_id: orgId, title: "Hello", ...extra() });
    expect(error?.code).toBe("42501");
  });

  it("lets the author edit, close and reopen their ticket", async () => {
    const id = await insertTicket(member, orgId);
    const closed = await member.client
      .from("tickets")
      .update({ title: "Printer fixed", status: "closed" })
      .eq("id", id)
      .select("title, status, closed_at, created_at, updated_at")
      .single();
    expect(closed.error).toBeNull();
    expect(closed.data?.status).toBe("closed");
    expect(closed.data?.closed_at).not.toBeNull();
    expect(closed.data?.updated_at).not.toBe(closed.data?.created_at);

    const reopened = await member.client
      .from("tickets")
      .update({ status: "open" })
      .eq("id", id)
      .select("status, closed_at")
      .single();
    expect(reopened.data).toEqual({ status: "open", closed_at: null });
  });

  it("keeps closed_at when a closed ticket is edited", async () => {
    const id = await insertTicket(member, orgId);
    const { data: closed } = await member.client
      .from("tickets")
      .update({ status: "closed" })
      .eq("id", id)
      .select("closed_at")
      .single();
    const { data: edited } = await member.client
      .from("tickets")
      .update({ body: "Still closed." })
      .eq("id", id)
      .select("closed_at")
      .single();
    expect(edited?.closed_at).toBe(closed?.closed_at);
  });

  it("refuses a member on someone else's ticket", async () => {
    const id = await insertTicket(admin, orgId);
    const updated = await member.client
      .from("tickets")
      .update({ status: "closed" })
      .eq("id", id)
      .select("id");
    expect(updated.data).toEqual([]);
    const deleted = await member.client.from("tickets").delete().eq("id", id).select("id");
    expect(deleted.data).toEqual([]);
    const { rows } = await db.query("select status from public.tickets where id = $1", [id]);
    expect(rows).toEqual([{ status: "open" }]);
  });

  it("lets the author delete their ticket", async () => {
    const id = await insertTicket(member, orgId);
    const { data } = await member.client.from("tickets").delete().eq("id", id).select("id");
    expect(data).toEqual([{ id }]);
  });

  it.each([
    ["admin", () => admin],
    ["owner", () => owner],
  ])("lets an %s change and delete any ticket", async (_role, user) => {
    const id = await insertTicket(member, orgId);
    const updated = await user()
      .client.from("tickets")
      .update({ title: "Triaged", status: "closed" })
      .eq("id", id)
      .select("title, status");
    expect(updated.data).toEqual([{ title: "Triaged", status: "closed" }]);
    const deleted = await user().client.from("tickets").delete().eq("id", id).select("id");
    expect(deleted.data).toEqual([{ id }]);
  });

  it("hides tickets of other organizations from updates and deletes", async () => {
    const id = await insertTicket(outsider, foreignOrgId);
    const updated = await owner.client
      .from("tickets")
      .update({ title: "Mine now" })
      .eq("id", id)
      .select("id");
    expect(updated.data).toEqual([]);
    const deleted = await owner.client.from("tickets").delete().eq("id", id).select("id");
    expect(deleted.data).toEqual([]);
  });

  it.each([
    ["organization_id", () => ({ organization_id: foreignOrgId })],
    ["created_by", () => ({ created_by: admin.id })],
    ["closed_at", () => ({ closed_at: null })],
    ["created_at", () => ({ created_at: new Date().toISOString() })],
    ["updated_at", () => ({ updated_at: new Date().toISOString() })],
  ])("refuses updates of %s", async (_column, patch) => {
    const id = await insertTicket(owner, orgId);
    const { error } = await owner.client.from("tickets").update(patch()).eq("id", id);
    expect(error?.code).toBe("42501");
  });

  it("enforces title and body limits", async () => {
    const tooLong = await member.client
      .from("tickets")
      .insert({ organization_id: orgId, title: "x".repeat(201) });
    expect(tooLong.error?.code).toBe("23514");
    const blank = await member.client.from("tickets").insert({ organization_id: orgId, title: "" });
    expect(blank.error?.code).toBe("23514");
    const padded = await member.client
      .from("tickets")
      .insert({ organization_id: orgId, title: " Printer " });
    expect(padded.error?.code).toBe("23514");
    const body = await member.client
      .from("tickets")
      .insert({ organization_id: orgId, title: "Long", body: "x".repeat(10_001) });
    expect(body.error?.code).toBe("23514");
  });

  it("keeps updated_at when the author's account is deleted", async () => {
    const author = await newUser("tk-gone");
    const org = await newOrg(owner, [[author, "member"]]);
    const id = await insertTicket(author, org);
    const before = await db.query<{ updated_at: Date }>(
      "select updated_at from public.tickets where id = $1",
      [id],
    );
    await createAdminClient().auth.admin.deleteUser(author.id);
    const { rows } = await db.query<{ created_by: string | null; updated_at: Date }>(
      "select created_by, updated_at from public.tickets where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ created_by: null, updated_at: before.rows[0]?.updated_at });
  });

  it("cuts off a member who leaves and keeps their tickets", async () => {
    const leaver = await newUser("tk-leaver");
    const leftOrg = await newOrg(owner, [[leaver, "member"]]);
    const id = await insertTicket(leaver, leftOrg);
    await leave(leftOrg, leaver);

    const { data } = await leaver.client.from("tickets").select("id").eq("id", id);
    expect(data).toEqual([]);
    const updated = await leaver.client
      .from("tickets")
      .update({ status: "closed" })
      .eq("id", id)
      .select("id");
    expect(updated.data).toEqual([]);
    const { rows } = await db.query("select id from public.tickets where id = $1", [id]);
    expect(rows).toEqual([{ id }]);
  });
});
