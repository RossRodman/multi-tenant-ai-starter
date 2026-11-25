import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "./env";
import { createUser, deleteUser, unique } from "./users";

type User = Awaited<ReturnType<typeof createUser>>;
type Role = "owner" | "admin" | "member";
type Outcome = "updated" | "none" | "denied";

const ROLES: Role[] = ["owner", "admin", "member"];

const db = new pg.Client({ connectionString: env.dbUrl });
const orgIds: string[] = [];
const users: User[] = [];

async function newUser(label: string) {
  const user = await createUser(label);
  users.push(user);
  return user;
}

async function createOrg(creator: User) {
  const slug = unique("roles");
  const { error } = await creator.client.from("organizations").insert({ name: "Roles", slug });
  if (error) throw error;
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("organization not created");
  orgIds.push(id);
  return { id, slug };
}

async function roleOf(orgId: string, user: User) {
  const { rows } = await db.query<{ role: Role }>(
    "select role from public.memberships where organization_id = $1 and user_id = $2",
    [orgId, user.id],
  );
  return rows[0]?.role ?? null;
}

async function setRoles(orgId: string, roles: [User, Role][]) {
  for (const [user, role] of [...roles].sort(([, a]) => (a === "owner" ? -1 : 1))) {
    await db.query(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, $3)
       on conflict (organization_id, user_id) do update set role = excluded.role`,
      [orgId, user.id, role],
    );
  }
}

function outcome(result: { data: unknown[] | null; error: { code: string } | null }): Outcome {
  if (result.error?.code === "42501") return "denied";
  if (result.error) throw new Error(`unexpected error ${result.error.code}`);
  return result.data?.length ? "updated" : "none";
}

function expectedUpdate(actor: Role, target: Role, to: Role): Outcome {
  if (actor === "owner") return "updated";
  if (actor === "member" || target === "owner") return "none";
  return to === "owner" ? "denied" : "updated";
}

function expectedDelete(actor: Role, target: Role): Outcome {
  if (actor === "owner") return "updated";
  if (actor === "member" || target === "owner") return "none";
  return "updated";
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const user of users) await deleteUser(user.id);
  await db.end();
});

describe("role matrix on memberships", () => {
  let org: { id: string; slug: string };
  const actors = {} as Record<Role, User>;
  const targets = {} as Record<Role, User>;

  beforeAll(async () => {
    for (const role of ROLES) {
      actors[role] = await newUser(`act-${role}`);
      targets[role] = await newUser(`tgt-${role}`);
    }
    org = await createOrg(actors.owner);
  });

  const reset = () =>
    setRoles(org.id, [
      ...ROLES.map((role): [User, Role] => [actors[role], role]),
      ...ROLES.map((role): [User, Role] => [targets[role], role]),
    ]);

  const cases = ROLES.flatMap((actor) =>
    ROLES.flatMap((target) => ROLES.map((to) => ({ actor, target, to }))),
  );

  it.each(cases)("$actor sets a $target to $to", async ({ actor, target, to }) => {
    await reset();
    const result = await actors[actor].client
      .from("memberships")
      .update({ role: to })
      .eq("organization_id", org.id)
      .eq("user_id", targets[target].id)
      .select();
    const expected = expectedUpdate(actor, target, to);
    expect(outcome(result)).toBe(expected);
    expect(await roleOf(org.id, targets[target])).toBe(expected === "updated" ? to : target);
  });

  const removals = ROLES.flatMap((actor) => ROLES.map((target) => ({ actor, target })));

  it.each(removals)("$actor removes a $target", async ({ actor, target }) => {
    await reset();
    const result = await actors[actor].client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", targets[target].id)
      .select();
    const expected = expectedDelete(actor, target);
    expect(outcome(result)).toBe(expected);
    expect(await roleOf(org.id, targets[target])).toBe(expected === "updated" ? null : target);
  });

  it.each(ROLES)("lets a %s leave", async (role) => {
    await reset();
    const result = await actors[role].client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", actors[role].id)
      .select();
    expect(outcome(result)).toBe("updated");
    expect(await roleOf(org.id, actors[role])).toBeNull();
  });

  it.each([
    ["member", "admin", "none"],
    ["member", "owner", "none"],
    ["admin", "owner", "denied"],
    ["admin", "member", "updated"],
  ] as [Role, Role, Outcome][])(
    "a %s changing their own role to %s: %s",
    async (actor, to, expected) => {
      await reset();
      const result = await actors[actor].client
        .from("memberships")
        .update({ role: to })
        .eq("organization_id", org.id)
        .eq("user_id", actors[actor].id)
        .select();
      expect(outcome(result)).toBe(expected);
      expect(await roleOf(org.id, actors[actor])).toBe(expected === "updated" ? to : actor);
    },
  );

  it("cannot insert memberships", async () => {
    await reset();
    const outsider = await newUser("outsider");
    for (const role of ROLES) {
      const result = await actors[role].client
        .from("memberships")
        .insert({ organization_id: org.id, user_id: outsider.id, role: "member" });
      expect(result.error?.code).toBe("42501");
    }
    expect(await roleOf(org.id, outsider)).toBeNull();
  });

  it.each(["organization_id", "user_id", "created_at"] as const)(
    "cannot update %s",
    async (column) => {
      await reset();
      const value =
        column === "created_at"
          ? "2000-01-01T00:00:00Z"
          : column === "user_id"
            ? targets.admin.id
            : crypto.randomUUID();
      const result = await actors.owner.client
        .from("memberships")
        .update({ [column]: value } as { created_at: string })
        .eq("organization_id", org.id)
        .eq("user_id", targets.member.id);
      expect(result.error?.code).toBe("42501");
    },
  );
});

describe("organization writes", () => {
  let org: { id: string; slug: string };
  const actors = {} as Record<Role, User>;

  beforeAll(async () => {
    for (const role of ROLES) actors[role] = await newUser(`org-${role}`);
    org = await createOrg(actors.owner);
    await setRoles(
      org.id,
      ROLES.map((role): [User, Role] => [actors[role], role]),
    );
  });

  it.each(ROLES)("a %s updating name and slug", async (role) => {
    const name = `Renamed ${role}`;
    const slug = unique(`renamed-${role}`);
    const result = await actors[role].client
      .from("organizations")
      .update({ name, slug })
      .eq("id", org.id)
      .select();
    const allowed = role !== "member";
    expect(outcome(result)).toBe(allowed ? "updated" : "none");
    const { rows } = await db.query<{ name: string; slug: string }>(
      "select name, slug from public.organizations where id = $1",
      [org.id],
    );
    if (allowed) {
      expect(rows[0]).toEqual({ name, slug });
      org.slug = slug;
    } else {
      expect(rows[0]?.name).not.toBe(name);
    }
  });

  it.each(ROLES)("a %s cannot update id, created_at or delete", async (role) => {
    const { client } = actors[role];
    const id = await client
      .from("organizations")
      .update({ id: crypto.randomUUID() })
      .eq("id", org.id);
    expect(id.error?.code).toBe("42501");
    const created = await client
      .from("organizations")
      .update({ created_at: "2000-01-01T00:00:00Z" })
      .eq("id", org.id);
    expect(created.error?.code).toBe("42501");
    const removed = await client.from("organizations").delete().eq("id", org.id);
    expect(removed.error?.code).toBe("42501");
  });
});

describe("writes by an outsider and an invitee", () => {
  let org: { id: string; slug: string };
  let owner: User;
  const bystanders = {} as Record<"outsider" | "invitee", User>;

  beforeAll(async () => {
    owner = await newUser("bystander-owner");
    bystanders.outsider = await newUser("bystander-outsider");
    bystanders.invitee = await newUser("bystander-invitee");
    org = await createOrg(owner);
    const { error } = await owner.client.from("invitations").insert({
      organization_id: org.id,
      email: bystanders.invitee.email.toLowerCase(),
      role: "admin",
    });
    if (error) throw error;
  });

  it.each(["outsider", "invitee"] as const)(
    "a %s cannot change the name or slug of the organization",
    async (who) => {
      const { client } = bystanders[who];
      const renamed = await client
        .from("organizations")
        .update({ name: "Hijacked" })
        .eq("id", org.id)
        .select();
      expect(outcome(renamed)).toBe("none");
      const moved = await client
        .from("organizations")
        .update({ slug: unique("hijacked") })
        .eq("id", org.id)
        .select();
      expect(outcome(moved)).toBe("none");
      const { rows } = await db.query<{ name: string; slug: string }>(
        "select name, slug from public.organizations where id = $1",
        [org.id],
      );
      expect(rows[0]).toEqual({ name: "Roles", slug: org.slug });
    },
  );

  it.each(["outsider", "invitee"] as const)(
    "a %s cannot change or delete memberships",
    async (who) => {
      const { client } = bystanders[who];
      const updated = await client
        .from("memberships")
        .update({ role: "member" })
        .eq("organization_id", org.id)
        .select();
      expect(outcome(updated)).toBe("none");
      const removed = await client
        .from("memberships")
        .delete()
        .eq("organization_id", org.id)
        .select();
      expect(outcome(removed)).toBe("none");
      expect(await roleOf(org.id, owner)).toBe("owner");
    },
  );

  it("an invitee cannot delete the organization", async () => {
    await bystanders.invitee.client.from("organizations").delete().eq("id", org.id);
    const { rows } = await db.query("select 1 from public.organizations where id = $1", [org.id]);
    expect(rows).toHaveLength(1);
  });
});

describe("last owner", () => {
  async function soleOwnerOrg(label: string) {
    const owner = await newUser(label);
    const org = await createOrg(owner);
    return { owner, org };
  }

  it("cannot be demoted", async () => {
    const { owner, org } = await soleOwnerOrg("last-demote");
    const { error } = await owner.client
      .from("memberships")
      .update({ role: "admin" })
      .eq("organization_id", org.id)
      .eq("user_id", owner.id);
    expect(error?.code).toBe("OW001");
    expect(await roleOf(org.id, owner)).toBe("owner");
  });

  it("cannot leave", async () => {
    const { owner, org } = await soleOwnerOrg("last-leave");
    const { error } = await owner.client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", owner.id);
    expect(error?.code).toBe("OW001");
    expect(await roleOf(org.id, owner)).toBe("owner");
  });

  it("can leave when another owner remains, and then is the last one", async () => {
    const { owner, org } = await soleOwnerOrg("two-owners");
    const second = await newUser("two-owners-b");
    await setRoles(org.id, [[second, "owner"]]);

    const left = await owner.client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", owner.id);
    expect(left.error).toBeNull();
    expect(await roleOf(org.id, owner)).toBeNull();

    const blocked = await second.client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", second.id);
    expect(blocked.error?.code).toBe("OW001");
  });

  it("cannot be removed by an admin through a role change either", async () => {
    const { owner, org } = await soleOwnerOrg("admin-vs-owner");
    const admin = await newUser("admin-vs-owner-a");
    await setRoles(org.id, [[admin, "admin"]]);
    const result = await admin.client
      .from("memberships")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", owner.id)
      .select();
    expect(outcome(result)).toBe("none");
  });

  it("holds when two owners demote each other concurrently", async () => {
    const { owner: a, org } = await soleOwnerOrg("race-a");
    const b = await newUser("race-b");
    await setRoles(org.id, [[b, "owner"]]);

    const [first, second] = [
      new pg.Client({ connectionString: env.dbUrl }),
      new pg.Client({ connectionString: env.dbUrl }),
    ];
    await Promise.all([first.connect(), second.connect()]);

    async function begin(connection: pg.Client, user: User) {
      await connection.query("begin");
      await connection.query("set local role authenticated");
      await connection.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user.id, role: "authenticated", email: user.email }),
      ]);
    }
    const demote = (connection: pg.Client, target: User) =>
      connection.query(
        "update public.memberships set role = 'admin' where organization_id = $1 and user_id = $2",
        [org.id, target.id],
      );

    try {
      await begin(first, a);
      await begin(second, b);
      await demote(first, b);

      const blocked = demote(second, a).then(
        () => null,
        (error: unknown) => error as { code?: string },
      );
      for (let i = 0; i < 50; i++) {
        const { rowCount } = await db.query(
          "select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database() and pid <> pg_backend_pid()",
        );
        if (rowCount) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await first.query("commit");

      expect((await blocked)?.code).toBe("OW001");
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      await Promise.all([first.end(), second.end()]);
    }
    expect(await roleOf(org.id, a)).toBe("owner");
    expect(await roleOf(org.id, b)).toBe("admin");
  });

  it("blocks deleting the user of a sole owner, and lets an organization delete cascade", async () => {
    const { owner, org } = await soleOwnerOrg("last-user");
    const result = await deleteUser(owner.id);
    expect(result.error).not.toBeNull();
    expect(await roleOf(org.id, owner)).toBe("owner");

    const member = await newUser("cascade-member");
    await setRoles(org.id, [[member, "member"]]);
    await db.query(
      `insert into public.invitations (organization_id, email, role, invited_by_email)
       values ($1, $2, 'member', 'owner@example.com')`,
      [org.id, `${unique("cascade")}@example.com`],
    );
    await db.query("delete from public.organizations where id = $1", [org.id]);
    const left = await db.query("select 1 from public.memberships where organization_id = $1", [
      org.id,
    ]);
    const invited = await db.query("select 1 from public.invitations where organization_id = $1", [
      org.id,
    ]);
    expect([left.rowCount, invited.rowCount]).toEqual([0, 0]);
    expect((await deleteUser(owner.id)).error).toBeNull();
  });
});
