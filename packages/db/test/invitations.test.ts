import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSessionlessClient } from "../src";
import { env } from "./env";
import { anonClient, createUser, deleteUser, unique } from "./users";

type User = Awaited<ReturnType<typeof createUser>>;
type Role = "owner" | "admin" | "member";

const db = new pg.Client({ connectionString: env.dbUrl });
const orgIds: string[] = [];
const users: User[] = [];

async function newUser(label: string, name?: string) {
  const user = await createUser(label, name);
  users.push(user);
  return user;
}

async function createOrg(creator: User) {
  const slug = unique("inv");
  const { error } = await creator.client
    .from("organizations")
    .insert({ name: `Org ${slug}`, slug });
  if (error) throw error;
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("organization not created");
  orgIds.push(id);
  await db.query(
    "insert into public.subscriptions (id, organization_id, plan, interval, status) values ($1, $2, 'team', 'month', 'active')",
    [`sub_${id}`, id],
  );
  return { id, slug };
}

function addMember(orgId: string, user: User, role: Role) {
  return db.query("insert into public.memberships values ($1, $2, $3)", [orgId, user.id, role]);
}

const emailFor = (label: string) => `${unique(label)}@example.com`;

async function invite(inviter: User, organizationId: string, email: string, role: Role = "member") {
  return inviter.client
    .from("invitations")
    .insert({ organization_id: organizationId, email, role })
    .select("id, invited_by, invited_by_email, expires_at, accepted_at")
    .single();
}

async function inviteOk(
  inviter: User,
  organizationId: string,
  email: string,
  role: Role = "member",
) {
  const { data, error } = await invite(inviter, organizationId, email, role);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const user of users) await deleteUser(user.id);
  await db.end();
});

describe("inserting invitations", () => {
  let owner: User;
  let admin: User;
  let member: User;
  let org: { id: string; slug: string };

  beforeAll(async () => {
    [owner, admin, member] = await Promise.all([
      newUser("inv-owner"),
      newUser("inv-admin"),
      newUser("inv-member"),
    ]);
    org = await createOrg(owner);
    await addMember(org.id, admin, "admin");
    await addMember(org.id, member, "member");
  });

  it("lets an owner invite every role and records the inviter", async () => {
    for (const role of ["owner", "admin", "member"] as const) {
      const row = await inviteOk(owner, org.id, emailFor(`o-${role}`), role);
      expect(row.invited_by).toBe(owner.id);
      expect(row.invited_by_email).toBe(owner.email);
      expect(row.accepted_at).toBeNull();
      expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    }
  });

  it("lets an admin invite admins and members, not owners", async () => {
    for (const role of ["admin", "member"] as const) {
      const row = await inviteOk(admin, org.id, emailFor(`a-${role}`), role);
      expect(row.invited_by_email).toBe(admin.email);
    }
    const { error } = await invite(admin, org.id, emailFor("a-owner"), "owner");
    expect(error?.code).toBe("42501");
  });

  it("refuses a member", async () => {
    const { error } = await invite(member, org.id, emailFor("m"));
    expect(error?.code).toBe("42501");
  });

  it("refuses an outsider", async () => {
    const outsider = await newUser("inv-outsider");
    const { error } = await invite(outsider, org.id, emailFor("x"));
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["invited_by", () => ({ invited_by: member.id })],
    ["invited_by_email", () => ({ invited_by_email: "ceo@example.com" })],
    ["expires_at", () => ({ expires_at: "2099-01-01T00:00:00Z" })],
    ["accepted_at", () => ({ accepted_at: "2026-01-01T00:00:00Z" })],
    ["id", () => ({ id: crypto.randomUUID() })],
    ["created_at", () => ({ created_at: "2000-01-01T00:00:00Z" })],
  ])("refuses an explicit %s on insert", async (_column, extra) => {
    const { error } = await owner.client
      .from("invitations")
      .insert({ organization_id: org.id, email: emailFor("col"), role: "member", ...extra() });
    expect(error?.code).toBe("42501");
  });

  it("refuses updates of any column", async () => {
    const row = await inviteOk(owner, org.id, emailFor("upd"));
    const result = await owner.client
      .from("invitations")
      .update({ role: "owner" })
      .eq("id", row.id);
    expect(result.error?.code).toBe("42501");
    const accepted = await owner.client
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", row.id);
    expect(accepted.error?.code).toBe("42501");
  });

  it("allows one pending invitation per email and organization", async () => {
    const email = emailFor("dup");
    await inviteOk(owner, org.id, email);
    const { error } = await invite(admin, org.id, email, "admin");
    expect(error?.code).toBe("23505");
  });

  it("allows a new invitation after the old one is deleted", async () => {
    const email = emailFor("again");
    const first = await inviteOk(owner, org.id, email);
    const removed = await owner.client.from("invitations").delete().eq("id", first.id).select();
    expect(removed.data).toHaveLength(1);
    const second = await inviteOk(owner, org.id, email);
    expect(second.id).not.toBe(first.id);
  });

  it.each([
    ["uppercase", "Someone@Example.com"],
    ["no at sign", "someone.example.com"],
    ["whitespace", "some one@example.com"],
    ["empty local part", "@example.com"],
    ["two at signs", "a@b@example.com"],
    ["too long", `${"a".repeat(310)}@example.com`],
  ])("rejects a %s email", async (_label, email) => {
    const { error } = await invite(owner, org.id, email);
    expect(error?.code).toBe("23514");
  });

  it("denies anon", async () => {
    const { error } = await anonClient().from("invitations").select();
    expect(error?.code).toBe("42501");
    const inserted = await anonClient()
      .from("invitations")
      .insert({ organization_id: org.id, email: emailFor("anon"), role: "member" });
    expect(inserted.error?.code).toBe("42501");
  });
});

describe("deleting invitations", () => {
  it("lets owners and admins revoke, within the role matrix, and refuses members", async () => {
    const owner = await newUser("rev-owner");
    const admin = await newUser("rev-admin");
    const member = await newUser("rev-member");
    const org = await createOrg(owner);
    await addMember(org.id, admin, "admin");
    await addMember(org.id, member, "member");

    const ownerInvite = await inviteOk(owner, org.id, emailFor("rev-o"), "owner");
    const adminInvite = await inviteOk(owner, org.id, emailFor("rev-a"), "admin");

    const byMember = await member.client
      .from("invitations")
      .delete()
      .eq("id", adminInvite.id)
      .select();
    expect(byMember.data).toEqual([]);
    const adminOnOwner = await admin.client
      .from("invitations")
      .delete()
      .eq("id", ownerInvite.id)
      .select();
    expect(adminOnOwner.data).toEqual([]);
    const adminOnAdmin = await admin.client
      .from("invitations")
      .delete()
      .eq("id", adminInvite.id)
      .select();
    expect(adminOnAdmin.data).toHaveLength(1);
    const ownerOnOwner = await owner.client
      .from("invitations")
      .delete()
      .eq("id", ownerInvite.id)
      .select();
    expect(ownerOnOwner.data).toHaveLength(1);
  });
});

describe("seeing invitations", () => {
  it("shows them to owners and admins of the organization only, and the invitee their own", async () => {
    const owner = await newUser("see-owner");
    const admin = await newUser("see-admin");
    const member = await newUser("see-member");
    const stranger = await newUser("see-stranger");
    const invitee = await newUser("see-invitee");
    const org = await createOrg(owner);
    const other = await createOrg(stranger);
    await addMember(org.id, admin, "admin");
    await addMember(org.id, member, "member");

    const mine = await inviteOk(owner, org.id, invitee.email);
    await inviteOk(owner, org.id, emailFor("see-other"));
    await inviteOk(stranger, other.id, emailFor("see-foreign"));

    const ids = async (user: User) =>
      ((await user.client.from("invitations").select("id, organization_id")).data ?? []).filter(
        (row) => row.organization_id === org.id,
      );

    expect(await ids(owner)).toHaveLength(2);
    expect(await ids(admin)).toHaveLength(2);
    expect(await ids(member)).toEqual([]);
    expect(await ids(stranger)).toEqual([]);

    const seenByInvitee = await invitee.client.from("invitations").select("id, email");
    expect(seenByInvitee.data).toEqual([{ id: mine.id, email: invitee.email }]);
  });

  it("lets the invitee read the invited organization but not its memberships", async () => {
    const owner = await newUser("org-owner");
    const invitee = await newUser("org-invitee");
    const org = await createOrg(owner);
    await inviteOk(owner, org.id, invitee.email);

    const orgs = await invitee.client
      .from("organizations")
      .select("id, name, slug")
      .eq("id", org.id);
    expect(orgs.data).toHaveLength(1);
    const members = await invitee.client.from("memberships").select().eq("organization_id", org.id);
    expect(members.data).toEqual([]);
    const people = await invitee.client.rpc("organization_members", { organization_id: org.id });
    expect(people.data).toEqual([]);
  });

  it("hides an expired or accepted invitation from the invitee and its organization", async () => {
    const owner = await newUser("exp-owner");
    const invitee = await newUser("exp-invitee");
    const org = await createOrg(owner);
    const row = await inviteOk(owner, org.id, invitee.email);

    await db.query(
      "update public.invitations set expires_at = now() - interval '1 minute' where id = $1",
      [row.id],
    );
    expect((await invitee.client.from("invitations").select()).data).toEqual([]);
    expect((await invitee.client.from("organizations").select().eq("id", org.id)).data).toEqual([]);
  });
});

describe("accepting invitations", () => {
  const accept = (user: User, id: string) =>
    user.client.rpc("accept_invitation", { invitation_id: id });

  async function setup(role: Role = "admin") {
    const owner = await newUser("acc-owner");
    const invitee = await newUser("acc-invitee");
    const org = await createOrg(owner);
    const row = await inviteOk(owner, org.id, invitee.email, role);
    return { owner, invitee, org, row };
  }

  async function membershipRole(orgId: string, user: User) {
    const { rows } = await db.query<{ role: Role }>(
      "select role from public.memberships where organization_id = $1 and user_id = $2",
      [orgId, user.id],
    );
    return rows[0]?.role ?? null;
  }

  it("adds the invitee with the invited role, marks it accepted and returns the slug", async () => {
    const { invitee, org, row } = await setup("admin");
    const result = await accept(invitee, row.id);
    expect(result).toMatchObject({ data: org.slug, error: null });
    expect(await membershipRole(org.id, invitee)).toBe("admin");
    const { rows } = await db.query<{ accepted_at: Date | null }>(
      "select accepted_at from public.invitations where id = $1",
      [row.id],
    );
    expect(rows[0]?.accepted_at).not.toBeNull();
  });

  it("fails the same way for another user, an expired, accepted or deleted invitation", async () => {
    const { owner, invitee, org, row } = await setup();
    const stranger = await newUser("acc-stranger");
    const messages = new Set<string>();

    const wrongUser = await accept(stranger, row.id);
    expect(wrongUser.error?.code).toBe("IV001");
    messages.add(wrongUser.error?.message ?? "");

    await db.query(
      "update public.invitations set expires_at = now() - interval '1 minute' where id = $1",
      [row.id],
    );
    const expired = await accept(invitee, row.id);
    expect(expired.error?.code).toBe("IV001");
    messages.add(expired.error?.message ?? "");

    const second = await setup();
    expect((await accept(second.invitee, second.row.id)).error).toBeNull();
    const again = await accept(second.invitee, second.row.id);
    expect(again.error?.code).toBe("IV001");
    messages.add(again.error?.message ?? "");

    const third = await setup();
    await third.owner.client.from("invitations").delete().eq("id", third.row.id);
    const revoked = await accept(third.invitee, third.row.id);
    expect(revoked.error?.code).toBe("IV001");
    messages.add(revoked.error?.message ?? "");

    const unknown = await accept(invitee, crypto.randomUUID());
    expect(unknown.error?.code).toBe("IV001");
    messages.add(unknown.error?.message ?? "");

    expect(messages.size).toBe(1);
    expect(await membershipRole(org.id, stranger)).toBeNull();
    expect(owner.id).toBeDefined();
  });

  it("matches the invited email case-insensitively", async () => {
    const owner = await newUser("case-owner");
    const org = await createOrg(owner);
    const invitee = await newUser("Case-Invitee");
    const row = await inviteOk(owner, org.id, invitee.email.toLowerCase());
    expect((await accept(invitee, row.id)).error).toBeNull();
  });

  it("keeps the role of an existing member", async () => {
    const { owner, invitee, org, row } = await setup("member");
    await addMember(org.id, invitee, "admin");
    expect((await accept(invitee, row.id)).error).toBeNull();
    expect(await membershipRole(org.id, invitee)).toBe("admin");
    expect(owner.id).toBeDefined();
  });

  it("requires a confirmed email", async () => {
    const { invitee, org, row } = await setup();
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [invitee.id]);
    const result = await accept(invitee, row.id);
    expect(result.error?.code).toBe("IV001");
    expect(await membershipRole(org.id, invitee)).toBeNull();
  });

  it("is not available to anon", async () => {
    const { row } = await setup();
    const result = await anonClient().rpc("accept_invitation", { invitation_id: row.id });
    expect(result.error?.code).toBe("42501");
  });

  it("cannot be signed in to with an unconfirmed email", async () => {
    const admin = createSessionlessClient({ url: env.url, key: env.secretKey });
    const email = emailFor("unconfirmed");
    const created = await admin.auth.admin.createUser({ email, password: "correct-horse-battery" });
    if (created.error) throw created.error;
    try {
      const signedIn = await anonClient().auth.signInWithPassword({
        email,
        password: "correct-horse-battery",
      });
      expect(signedIn.data.session).toBeNull();
      expect(signedIn.error?.code).toBe("email_not_confirmed");
    } finally {
      await deleteUser(created.data.user.id);
    }
  });
});

describe("organization_members", () => {
  it("lists members with their email and role, ordered, to members only", async () => {
    const owner = await newUser("mem-owner", "Olivia Owner");
    const admin = await newUser("mem-admin");
    const member = await newUser("mem-member");
    const outsider = await newUser("mem-outsider");
    const org = await createOrg(owner);
    await addMember(org.id, member, "member");
    await addMember(org.id, admin, "admin");

    const asMember = await member.client.rpc("organization_members", { organization_id: org.id });
    expect(asMember.error).toBeNull();
    expect(asMember.data?.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: owner.email, role: "owner" },
      { email: admin.email, role: "admin" },
      { email: member.email, role: "member" },
    ]);
    const first = asMember.data?.[0];
    expect(first).toMatchObject({
      user_id: owner.id,
      email: owner.email,
      name: "Olivia Owner",
      role: "owner",
    });
    expect(asMember.data?.slice(1).map(({ name }) => name)).toEqual([null, null]);
    expect(Date.parse(first?.joined_at ?? "")).not.toBeNaN();

    const asOutsider = await outsider.client.rpc("organization_members", {
      organization_id: org.id,
    });
    expect(asOutsider).toMatchObject({ data: [], error: null });

    const asAnon = await anonClient().rpc("organization_members", { organization_id: org.id });
    expect(asAnon.error?.code).toBe("42501");
  });
});

describe("function privileges", () => {
  const functions = [
    "private.organization_ids_with_role(public.membership_role[])",
    "private.invited_organization_ids()",
    "private.keep_an_owner()",
    "private.accept_invitation(uuid)",
    "private.organization_members(uuid)",
    "public.accept_invitation(uuid)",
    "public.organization_members(uuid)",
  ];

  it.each(functions)("%s is not executable by anon or PUBLIC", async (signature) => {
    const { rows } = await db.query<{ anon: boolean; public: boolean }>(
      `select has_function_privilege('anon', $1::regprocedure, 'execute') as anon,
              exists (
                select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = $1::regprocedure and a.grantee = 0
              ) as public`,
      [signature],
    );
    expect(rows[0]).toEqual({ anon: false, public: false });
  });

  it("keeps the private schema closed and the wrappers as invokers", async () => {
    const { rows } = await db.query<{ usage: boolean }>(
      "select has_schema_privilege('authenticated', 'private', 'usage') as usage",
    );
    expect(rows[0]?.usage).toBe(false);

    const { rows: invokers } = await db.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('accept_invitation', 'organization_members')`,
    );
    expect(invokers).toHaveLength(2);
    expect(invokers.every((fn) => !fn.prosecdef)).toBe(true);
  });
});
