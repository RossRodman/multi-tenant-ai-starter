import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";

import { env } from "./env";
import { anonClient, createUser, deleteUser, unique } from "./users";

type User = Awaited<ReturnType<typeof createUser>>;

describe("organizations and memberships", () => {
  const db = new pg.Client({ connectionString: env.dbUrl });
  let a: User;
  let b: User;
  let orgId: string;
  let slug: string;

  async function createOrg(user: User, name = unique("Acme")) {
    const orgSlug = unique("acme");
    const { error } = await user.client.from("organizations").insert({ name, slug: orgSlug });
    if (error) throw error;
    const { rows } = await db.query<{ id: string }>(
      "select id from public.organizations where slug = $1",
      [orgSlug],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("organization not created");
    return { id, slug: orgSlug };
  }

  beforeAll(async () => {
    await db.connect();
    [a, b] = await Promise.all([createUser("org-a"), createUser("org-b")]);
    ({ id: orgId, slug } = await createOrg(a));
  });

  afterAll(async () => {
    await db.query("delete from public.organizations where id = $1", [orgId]);
    await deleteUser(a.id);
    await deleteUser(b.id);
    await db.end();
  });

  it("makes the creator the only owner, in the same statement", async () => {
    const { rows } = await db.query<{ user_id: string; role: string }>(
      "select user_id, role from public.memberships where organization_id = $1",
      [orgId],
    );
    expect(rows).toEqual([{ user_id: a.id, role: "owner" }]);
  });

  it.each(["organizations", "memberships"] as const)("denies anon on %s", async (table) => {
    const { data, error } = await anonClient().from(table).select();
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("hides the organization and its memberships from non-members", async () => {
    const orgs = await b.client.from("organizations").select();
    expect(orgs).toMatchObject({ data: [], error: null });
    const byId = await b.client.from("organizations").select().eq("id", orgId);
    expect(byId).toMatchObject({ data: [], error: null });
    const members = await b.client.from("memberships").select().eq("organization_id", orgId);
    expect(members).toMatchObject({ data: [], error: null });
    const allMembers = await b.client.from("memberships").select();
    expect(allMembers.error).toBeNull();
    expect(allMembers.data?.filter((m) => m.organization_id === orgId)).toEqual([]);
  });

  it("shows members the organization and all its memberships, and stops after removal", async () => {
    await db.query("insert into public.memberships values ($1, $2, 'member')", [orgId, b.id]);

    const orgs = await b.client.from("organizations").select().eq("id", orgId);
    expect(orgs.data).toHaveLength(1);
    const members = await b.client.from("memberships").select().eq("organization_id", orgId);
    expect(members.data?.map((m) => m.user_id).sort()).toEqual([a.id, b.id].sort());

    await db.query("delete from public.memberships where organization_id = $1 and user_id = $2", [
      orgId,
      b.id,
    ]);
    expect((await b.client.from("organizations").select().eq("id", orgId)).data).toEqual([]);
    expect((await b.client.from("memberships").select().eq("organization_id", orgId)).data).toEqual(
      [],
    );
  });

  describe.each([
    ["owner", () => a],
    ["outsider", () => b],
  ])("writes by an %s through the Data API", (_label, user) => {
    const denied = (result: { error: { code: string } | null }) => {
      expect(result.error?.code).toBe("42501");
    };

    it("cannot write memberships", async () => {
      const { client, id } = user();
      denied(
        await client
          .from("memberships")
          .insert({ organization_id: orgId, user_id: id, role: "owner" }),
      );
      denied(
        await client.from("memberships").update({ role: "owner" }).eq("organization_id", orgId),
      );
      denied(await client.from("memberships").delete().eq("organization_id", orgId));
    });

    it("cannot update or delete organizations", async () => {
      const { client } = user();
      denied(
        await client
          .from("organizations")
          .update({ slug: unique("x") })
          .eq("id", orgId),
      );
      denied(await client.from("organizations").update({ name: "Renamed" }).eq("id", orgId));
      denied(await client.from("organizations").delete().eq("id", orgId));
    });

    it("cannot set id or created_at on insert, or upsert", async () => {
      const { client } = user();
      denied(
        await client
          .from("organizations")
          .insert({ id: crypto.randomUUID(), name: "Forged", slug: unique("forged") }),
      );
      denied(
        await client.from("organizations").insert({
          created_at: "2000-01-01T00:00:00Z",
          name: "Forged",
          slug: unique("forged"),
        }),
      );
      denied(
        await client
          .from("organizations")
          .upsert({ name: "Takeover", slug }, { onConflict: "slug" }),
      );
    });
  });

  it("keeps the helper and the trigger function out of the Data API", async () => {
    const helper = await a.client.rpc("member_organization_ids" as never);
    expect(helper.error?.code).toBe("PGRST202");
    const trigger = await a.client.rpc("add_creator_as_owner" as never);
    expect(trigger.error?.code).toBe("PGRST202");
  });

  it("grants execute on the helper only, and no usage on private", async () => {
    const { rows } = await db.query<{ helper: boolean; trigger: boolean; usage: boolean }>(
      `select
         has_function_privilege('authenticated', 'private.member_organization_ids()', 'execute') as helper,
         has_function_privilege('authenticated', 'private.add_creator_as_owner()', 'execute') as trigger,
         has_schema_privilege('authenticated', 'private', 'usage') as usage`,
    );
    expect(rows[0]).toEqual({ helper: true, trigger: false, usage: false });
  });

  it("rejects an organization created without a user", async () => {
    const name = unique("Ownerless");
    await expect(
      db.query("insert into public.organizations (name, slug) values ($1, $2)", [
        name,
        unique("o"),
      ]),
    ).rejects.toThrow();
    const { rowCount } = await db.query("select 1 from public.organizations where name = $1", [
      name,
    ]);
    expect(rowCount).toBe(0);
  });

  it.each([
    ["blank", ""],
    ["whitespace only", "   "],
    ["tab only", "\t"],
    ["newline only", "\n"],
    ["leading space", " Acme"],
    ["trailing tab", "Acme\t"],
    ["control character", "Ac\u0007me"],
    ["81 characters", "a".repeat(81)],
  ])("rejects a %s name", async (_label, name) => {
    const { error } = await a.client.from("organizations").insert({ name, slug: unique("n") });
    expect(error?.code).toBe("23514");
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(49)],
    ["uppercase", "Acme-Inc"],
    ["leading dash", "-acme"],
    ["trailing dash", "acme-"],
    ["double dash", "ac--me"],
    ["underscore", "ac_me"],
    ["space", "ac me"],
  ])("rejects a %s slug", async (_label, badSlug) => {
    const { error } = await a.client.from("organizations").insert({ name: "Acme", slug: badSlug });
    expect(error?.code).toBe("23514");
  });

  it("rejects a taken slug with a unique violation", async () => {
    const { error } = await b.client.from("organizations").insert({ name: "Other", slug });
    expect(error?.code).toBe("23505");
  });

  it("removes memberships when the organization is deleted", async () => {
    const org = await createOrg(a);
    await db.query("delete from public.organizations where id = $1", [org.id]);
    const { rowCount } = await db.query(
      "select 1 from public.memberships where organization_id = $1",
      [org.id],
    );
    expect(rowCount).toBe(0);
  });

  it("removes memberships when the user is deleted", async () => {
    const c = await createUser("org-c");
    const cOrgIds: string[] = [];
    onTestFinished(async () => {
      await db.query(
        `delete from public.organizations
         where id = any ($1) or id in (select organization_id from public.memberships where user_id = $2 and role = 'owner')`,
        [cOrgIds, c.id],
      );
      await deleteUser(c.id);
    });
    const org = await createOrg(c);
    cOrgIds.push(org.id);
    await db.query("insert into public.memberships values ($1, $2, 'member')", [orgId, c.id]);

    await deleteUser(c.id);

    const { rowCount } = await db.query("select 1 from public.memberships where user_id = $1", [
      c.id,
    ]);
    expect(rowCount).toBe(0);
  });
});
