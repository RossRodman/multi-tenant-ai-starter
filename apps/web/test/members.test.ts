import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { changeRole, listMembers, removeMember } from "../src/server/members";
import { createOrganization } from "../src/server/organizations";
import { env } from "./env";
import { createAdminClient, createUser } from "./harness";

const db = new pg.Client({ connectionString: env.dbUrl });
await db.connect();

const users: { id: string }[] = [];
const orgIds: string[] = [];

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const { id } of users) await createAdminClient().auth.admin.deleteUser(id);
  await db.end();
});

async function newUser(label: string, name?: string) {
  const user = await createUser(label, name);
  users.push(user);
  return user;
}

async function setup() {
  const [owner, admin, member] = await Promise.all([
    newUser("mem-owner", "Olivia Owner"),
    newUser("mem-admin", "a\u202eb"),
    newUser("mem-member"),
  ]);
  const slug = `members-${crypto.randomUUID().slice(0, 8)}`;
  await createOrganization(owner.client, { name: "Members", slug });
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  const id = rows[0]?.id ?? "";
  orgIds.push(id);
  await db.query("insert into public.memberships values ($1, $2, 'admin'), ($1, $3, 'member')", [
    id,
    admin.id,
    member.id,
  ]);
  return { owner, admin, member, id };
}

describe("members", () => {
  it("lists members with their emails to a member", async () => {
    const { member, id, owner } = await setup();
    const listed = await listMembers(member.client, id);
    expect(listed.map((m) => m.role)).toEqual(["owner", "admin", "member"]);
    expect(listed[0]?.userId).toBe(owner.id);
  });

  it("maps the sign-up name and drops names that fail validation", async () => {
    const { member, id } = await setup();
    const listed = await listMembers(member.client, id);
    expect(listed.map((m) => m.name)).toEqual(["Olivia Owner", null, null]);
  });

  it("changes a role and removes a member as an owner", async () => {
    const { owner, member, id } = await setup();
    expect(await changeRole(owner.client, id, member.id, "admin")).toEqual({ ok: true });
    expect(await removeMember(owner.client, id, member.id)).toEqual({ ok: true });
    expect((await listMembers(owner.client, id)).map((m) => m.userId)).not.toContain(member.id);
  });

  it("maps the last-owner trigger to last_owner", async () => {
    const { owner, id } = await setup();
    expect(await changeRole(owner.client, id, owner.id, "admin")).toEqual({
      ok: false,
      error: "last_owner",
    });
    expect(await removeMember(owner.client, id, owner.id)).toEqual({
      ok: false,
      error: "last_owner",
    });
  });

  it("maps a row hidden by RLS to forbidden", async () => {
    const { owner, admin, member, id } = await setup();
    expect(await changeRole(member.client, id, admin.id, "member")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await removeMember(member.client, id, admin.id)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await removeMember(admin.client, id, owner.id)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("maps a rejected new value to forbidden", async () => {
    const { admin, member, id } = await setup();
    expect(await changeRole(admin.client, id, member.id, "owner")).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("lets anyone leave while another owner remains", async () => {
    const { member, id } = await setup();
    expect(await removeMember(member.client, id, member.id)).toEqual({ ok: true });
  });
});
