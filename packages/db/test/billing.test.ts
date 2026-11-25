import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSessionlessClient } from "../src";
import { env } from "./env";
import { anonClient, createUser, deleteUser, unique } from "./users";

type User = Awaited<ReturnType<typeof createUser>>;
type Role = "owner" | "admin" | "member";
type Status =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

const SEAT_LIMIT = "SL001";

const db = new pg.Client({ connectionString: env.dbUrl });
const service = createSessionlessClient({ url: env.url, key: env.secretKey });
const orgIds: string[] = [];
const users: User[] = [];

async function newUser(label: string) {
  const user = await createUser(label);
  users.push(user);
  return user;
}

async function createOrg(creator: User) {
  const slug = unique("bill");
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
  return id;
}

function addMember(orgId: string, user: User, role: Role = "member") {
  return db.query("insert into public.memberships values ($1, $2, $3)", [orgId, user.id, role]);
}

async function addMembers(orgId: string, count: number) {
  for (let index = 0; index < count; index++) {
    await addMember(orgId, await newUser("bill-extra"));
  }
}

const emailFor = (label: string) => `${unique(label)}@example.com`;

function invite(inviter: User, organizationId: string, email: string, role: Role = "member") {
  return inviter.client
    .from("invitations")
    .insert({ organization_id: organizationId, email, role })
    .select("id")
    .single();
}

async function setSubscription(
  organizationId: string,
  plan: "pro" | "team",
  status: Status,
  id = `sub_${crypto.randomUUID().replaceAll("-", "")}`,
) {
  const { error } = await service
    .from("subscriptions")
    .upsert({ id, organization_id: organizationId, plan, interval: "month", status });
  if (error) throw error;
  return id;
}

async function planOf(organizationId: string) {
  const { rows } = await db.query<{ plan: string }>("select private.organization_plan($1) plan", [
    organizationId,
  ]);
  return rows[0]?.plan;
}

async function seatLimitOf(organizationId: string) {
  const { rows } = await db.query<{ seat_limit: number | null }>(
    "select private.organization_seat_limit($1) seat_limit",
    [organizationId],
  );
  return rows[0]?.seat_limit;
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const user of users) await deleteUser(user.id);
  await db.end();
});

describe("plan of an organization", () => {
  let owner: User;
  let orgId: string;

  beforeAll(async () => {
    owner = await newUser("plan-owner");
    orgId = await createOrg(owner);
  });

  it("is free without a subscription", async () => {
    expect(await planOf(orgId)).toBe("free");
    expect(await seatLimitOf(orgId)).toBe(3);
  });

  it.each(["active", "trialing", "past_due"] as const)("is paid while %s", async (status) => {
    const org = await createOrg(owner);
    await setSubscription(org, "pro", status);
    expect(await planOf(org)).toBe("pro");
    expect(await seatLimitOf(org)).toBe(10);
  });

  it.each(["incomplete", "incomplete_expired", "canceled", "unpaid", "paused"] as const)(
    "is free while %s",
    async (status) => {
      const org = await createOrg(owner);
      await setSubscription(org, "pro", status);
      expect(await planOf(org)).toBe("free");
    },
  );

  it("resolves several paid subscriptions to the best plan", async () => {
    const org = await createOrg(owner);
    await setSubscription(org, "team", "active");
    await setSubscription(org, "pro", "active");
    await setSubscription(org, "team", "canceled");
    expect(await planOf(org)).toBe("team");
    expect(await seatLimitOf(org)).toBeNull();
  });

  it("is free for an unknown organization", async () => {
    expect(await planOf(crypto.randomUUID())).toBe("free");
  });
});

describe("subscriptions through the Data API", () => {
  let owner: User;
  let member: User;
  let outsider: User;
  let orgId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    [owner, member, outsider] = await Promise.all([
      newUser("sub-owner"),
      newUser("sub-member"),
      newUser("sub-outsider"),
    ]);
    orgId = await createOrg(owner);
    await addMember(orgId, member);
    subscriptionId = await setSubscription(orgId, "pro", "active");
  });

  it.each(["owner", "member"] as const)("lets the %s of the organization read it", async (who) => {
    const user = who === "owner" ? owner : member;
    const { data, error } = await user.client.from("subscriptions").select("id, plan, status");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: subscriptionId, plan: "pro", status: "active" }]);
  });

  it("hides it from other users", async () => {
    const { data, error } = await outsider.client.from("subscriptions").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("denies anon every access", async () => {
    const { data, error } = await anonClient().from("subscriptions").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("denies a user inserting a subscription for their own organization", async () => {
    const { error } = await owner.client.from("subscriptions").insert({
      id: "sub_forged",
      organization_id: orgId,
      plan: "team",
      interval: "year",
      status: "active",
    });
    expect(error?.code).toBe("42501");
  });

  it("denies a user updating a subscription", async () => {
    const { error } = await owner.client
      .from("subscriptions")
      .update({ plan: "team" })
      .eq("id", subscriptionId);
    expect(error?.code).toBe("42501");
    const { rows } = await db.query<{ plan: string }>(
      "select plan from public.subscriptions where id = $1",
      [subscriptionId],
    );
    expect(rows[0]?.plan).toBe("pro");
  });

  it("denies a user deleting a subscription", async () => {
    const { error } = await owner.client.from("subscriptions").delete().eq("id", subscriptionId);
    expect(error?.code).toBe("42501");
    const { rowCount } = await db.query("select 1 from public.subscriptions where id = $1", [
      subscriptionId,
    ]);
    expect(rowCount).toBe(1);
  });

  it("rejects a plan that does not exist", async () => {
    const { error } = await service.from("subscriptions").insert({
      id: "sub_unknown_plan",
      organization_id: orgId,
      plan: "enterprise",
      interval: "month",
      status: "active",
    });
    expect(error?.code).toBe("23503");
  });

  it("removes subscriptions with their organization", async () => {
    const org = await createOrg(owner);
    const id = await setSubscription(org, "team", "active");
    await db.query("delete from public.organizations where id = $1", [org]);
    const { rowCount } = await db.query("select 1 from public.subscriptions where id = $1", [id]);
    expect(rowCount).toBe(0);
  });
});

describe("sync_subscription", () => {
  let orgId: string;
  const subscription = (id: string, status: Status) => ({
    id,
    organization_id: orgId,
    plan: "pro",
    interval: "month",
    status,
    current_period_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
  });
  const sync = (id: string, status: Status, fetchedAt: string) =>
    service.rpc("sync_subscription", {
      subscription: subscription(id, status),
      fetched_at: fetchedAt,
    });
  const statusOf = async (id: string) =>
    (
      await db.query<{ status: string }>("select status from public.subscriptions where id = $1", [
        id,
      ])
    ).rows[0]?.status;

  beforeAll(async () => {
    orgId = await createOrg(await newUser("sync-owner"));
  });

  it("inserts, then replaces with a newer read", async () => {
    const id = `sub_${crypto.randomUUID().replaceAll("-", "")}`;
    expect((await sync(id, "incomplete", "2026-11-25T10:00:00Z")).data).toBe(true);
    expect((await sync(id, "active", "2026-11-25T10:00:05Z")).data).toBe(true);
    expect(await statusOf(id)).toBe("active");
  });

  it("ignores a read that started before the stored one", async () => {
    const id = `sub_${crypto.randomUUID().replaceAll("-", "")}`;
    await sync(id, "past_due", "2026-11-25T10:00:10Z");

    expect((await sync(id, "active", "2026-11-25T10:00:00Z")).data).toBe(false);
    expect(await statusOf(id)).toBe("past_due");
  });

  it("never moves a subscription to another organization", async () => {
    const id = `sub_${crypto.randomUUID().replaceAll("-", "")}`;
    await sync(id, "active", "2026-11-25T10:00:00Z");
    const other = await createOrg(await newUser("sync-other"));
    await service.rpc("sync_subscription", {
      subscription: { ...subscription(id, "active"), organization_id: other },
      fetched_at: "2026-11-25T10:01:00Z",
    });
    const { rows } = await db.query<{ organization_id: string }>(
      "select organization_id from public.subscriptions where id = $1",
      [id],
    );
    expect(rows[0]?.organization_id).toBe(orgId);
  });

  it("is not callable by users or anon", async () => {
    const user = await newUser("sync-user");
    const args = {
      subscription: subscription("sub_x", "active"),
      fetched_at: "2026-11-25T10:00:00Z",
    };
    expect((await user.client.rpc("sync_subscription", args)).error?.code).toBe("42501");
    expect((await anonClient().rpc("sync_subscription", args)).error?.code).toBe("42501");
  });
});

describe("private billing tables", () => {
  it.each(["plans", "billing_customers"])("private.%s has RLS and no grants", async (table) => {
    const { rows } = await db.query<{
      rls: boolean;
      anon: boolean;
      authenticated: boolean;
      service: boolean;
    }>(
      `select
         c.relrowsecurity as rls,
         has_any_column_privilege('anon', c.oid, 'select, insert, update, references') as anon,
         has_any_column_privilege('authenticated', c.oid, 'select, insert, update, references') as authenticated,
         has_any_column_privilege('service_role', c.oid, 'select, insert, update, references') as service
       from pg_class c
       where c.oid = ('private.' || $1)::regclass`,
      [table],
    );
    expect(rows[0]).toEqual({ rls: true, anon: false, authenticated: false, service: false });
  });

  it("holds the seeded plans", async () => {
    const { rows } = await db.query("select id, seat_limit, rank from private.plans order by rank");
    expect(rows).toEqual([
      { id: "free", seat_limit: 3, rank: 0 },
      { id: "pro", seat_limit: 10, rank: 1 },
      { id: "team", seat_limit: null, rank: 2 },
    ]);
  });
});

describe("billing customers through the service role", () => {
  let owner: User;
  let orgId: string;

  beforeAll(async () => {
    owner = await newUser("cust-owner");
    orgId = await createOrg(owner);
  });

  it("links a customer once and keeps the first one", async () => {
    const first = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
    const second = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
    const a = await service.rpc("link_billing_customer", {
      organization_id: orgId,
      stripe_customer_id: first,
    });
    const b = await service.rpc("link_billing_customer", {
      organization_id: orgId,
      stripe_customer_id: second,
    });
    expect(a.data).toBe(first);
    expect(b.data).toBe(first);

    const byOrganization = await service.rpc("billing_customer_for_organization", {
      organization_id: orgId,
    });
    expect(byOrganization.data).toBe(first);
    const byCustomer = await service.rpc("billing_organization_for_customer", {
      stripe_customer_id: first,
    });
    expect(byCustomer.data).toBe(orgId);
  });

  it("takes parallel links of the same customer without an error", async () => {
    const org = await createOrg(owner);
    const customer = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.rpc("link_billing_customer", {
          organization_id: org,
          stripe_customer_id: customer,
        }),
      ),
    );
    expect(results.map(({ error }) => error)).toEqual(Array(6).fill(null));
    expect(results.map(({ data }) => data)).toEqual(Array(6).fill(customer));
  });

  it("finds nothing for an unknown customer", async () => {
    const { data, error } = await service.rpc("billing_organization_for_customer", {
      stripe_customer_id: "cus_unknown",
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it.each([
    [
      "link_billing_customer",
      { organization_id: crypto.randomUUID(), stripe_customer_id: "cus_x" },
    ],
    ["billing_customer_for_organization", { organization_id: crypto.randomUUID() }],
    ["billing_organization_for_customer", { stripe_customer_id: "cus_x" }],
  ] as const)("denies users and anon %s", async (fn, args) => {
    const user = await owner.client.rpc(fn, args as never);
    expect(user.error?.code).toBe("42501");
    const anon = await anonClient().rpc(fn, args as never);
    expect(anon.error?.code).toBe("42501");
  });
});

describe("seat limit on invitations", () => {
  let owner: User;
  let admin: User;

  beforeAll(async () => {
    [owner, admin] = await Promise.all([newUser("seat-owner"), newUser("seat-admin")]);
  });

  it("counts members and pending invitations against the free limit", async () => {
    const org = await createOrg(owner);
    expect((await invite(owner, org, emailFor("a"))).error).toBeNull();
    expect((await invite(owner, org, emailFor("b"))).error).toBeNull();
    const third = await invite(owner, org, emailFor("c"));
    expect(third.error?.code).toBe(SEAT_LIMIT);
  });

  it("does not count accepted or expired invitations", async () => {
    const org = await createOrg(owner);
    await db.query(
      `insert into public.invitations (organization_id, email, role, invited_by_email, expires_at)
       values ($1, $2, 'member', 'x@example.com', now() - interval '1 day')`,
      [org, emailFor("expired")],
    );
    await db.query(
      `insert into public.invitations (organization_id, email, role, invited_by_email, accepted_at)
       values ($1, $2, 'member', 'x@example.com', now())`,
      [org, emailFor("accepted")],
    );
    expect((await invite(owner, org, emailFor("a"))).error).toBeNull();
    expect((await invite(owner, org, emailFor("b"))).error).toBeNull();
    expect((await invite(owner, org, emailFor("c"))).error?.code).toBe(SEAT_LIMIT);
  });

  it("lets an invitation be replaced when the organization is full", async () => {
    const org = await createOrg(owner);
    const email = emailFor("again");
    expect((await invite(owner, org, email)).error).toBeNull();
    expect((await invite(owner, org, emailFor("other"))).error).toBeNull();
    expect((await invite(owner, org, email)).error?.code).toBe("23505");
    const removed = await owner.client.from("invitations").delete().eq("email", email);
    expect(removed.error).toBeNull();
    expect((await invite(owner, org, email)).error).toBeNull();
  });

  it("applies to every role and to direct Data API inserts", async () => {
    const org = await createOrg(owner);
    await addMember(org, admin, "admin");
    await addMembers(org, 1);
    const { error } = await admin.client
      .from("invitations")
      .insert({ organization_id: org, email: emailFor("late"), role: "member" });
    expect(error?.code).toBe(SEAT_LIMIT);
  });

  it("does not reveal a full organization to a member or an outsider", async () => {
    const org = await createOrg(owner);
    const [member, outsider] = await Promise.all([
      newUser("seat-member"),
      newUser("seat-outsider"),
    ]);
    await addMember(org, member);
    await addMembers(org, 1);
    for (const user of [member, outsider]) {
      const { error } = await invite(user, org, emailFor("probe"));
      expect(error?.code).toBe("42501");
    }
  });

  it("leaves exactly one of two concurrent inserts for the last seat", async () => {
    const org = await createOrg(owner);
    await addMember(org, admin, "admin");
    const results = await Promise.all([
      invite(owner, org, emailFor("race-a")),
      invite(admin, org, emailFor("race-b")),
    ]);
    expect(results.filter(({ error }) => error === null)).toHaveLength(1);
    expect(results.filter(({ error }) => error?.code === SEAT_LIMIT)).toHaveLength(1);
    const { rows } = await db.query<{ count: string }>(
      "select count(*) from public.invitations where organization_id = $1",
      [org],
    );
    expect(rows[0]?.count).toBe("1");
  });

  it("raises the limit with a paid plan", async () => {
    const org = await createOrg(owner);
    await addMembers(org, 2);
    expect((await invite(owner, org, emailFor("free"))).error?.code).toBe(SEAT_LIMIT);

    await setSubscription(org, "pro", "active");
    for (let index = 0; index < 7; index++) {
      expect((await invite(owner, org, emailFor(`pro${String(index)}`))).error).toBeNull();
    }
    expect((await invite(owner, org, emailFor("pro-over"))).error?.code).toBe(SEAT_LIMIT);
  });

  it("has no limit on the team plan", async () => {
    const org = await createOrg(owner);
    await setSubscription(org, "team", "active");
    await addMembers(org, 11);
    expect((await invite(owner, org, emailFor("team"))).error).toBeNull();
  });

  it("removes nobody on a downgrade and blocks new invitations", async () => {
    const org = await createOrg(owner);
    const id = await setSubscription(org, "pro", "active");
    await addMembers(org, 5);
    await setSubscription(org, "pro", "canceled", id);

    const { rows } = await db.query<{ count: string }>(
      "select count(*) from public.memberships where organization_id = $1",
      [org],
    );
    expect(rows[0]?.count).toBe("6");
    expect((await invite(owner, org, emailFor("down"))).error?.code).toBe(SEAT_LIMIT);
  });
});

describe("seat limit on memberships", () => {
  let owner: User;
  let orgId: string;

  async function fullOrganizationWithInvitation(inviteeEmail: string) {
    const org = await createOrg(owner);
    const invited = await owner.client
      .from("invitations")
      .insert({ organization_id: org, email: inviteeEmail, role: "member" })
      .select("id")
      .single();
    if (invited.error) throw invited.error;
    await addMembers(org, 2);
    return { org, invitationId: invited.data.id };
  }

  beforeAll(async () => {
    owner = await newUser("mem-owner");
    orgId = await createOrg(owner);
  });

  it("refuses a fourth member on the free plan", async () => {
    await addMembers(orgId, 2);
    await expect(addMember(orgId, await newUser("mem-late"))).rejects.toMatchObject({
      code: SEAT_LIMIT,
    });
  });

  it("fails an accept when the members fill the limit, also through the RPC", async () => {
    const invitee = await newUser("seat-invitee");
    const { org, invitationId } = await fullOrganizationWithInvitation(invitee.email);

    const { error } = await invitee.client.rpc("accept_invitation", {
      invitation_id: invitationId,
    });
    expect(error?.code).toBe(SEAT_LIMIT);

    const { rows } = await db.query<{ members: string; accepted: string }>(
      `select
         (select count(*) from public.memberships where organization_id = $1) as members,
         (select count(*) from public.invitations where id = $2 and accepted_at is not null) as accepted`,
      [org, invitationId],
    );
    expect(rows[0]).toEqual({ members: "3", accepted: "0" });
  });

  it("accepts again once a seat is free", async () => {
    const invitee = await newUser("seat-invitee");
    const { org, invitationId } = await fullOrganizationWithInvitation(invitee.email);
    await setSubscription(org, "pro", "active");

    const { error } = await invitee.client.rpc("accept_invitation", {
      invitation_id: invitationId,
    });
    expect(error).toBeNull();
  });

  it("lets an existing member accept again", async () => {
    const invitee = await newUser("seat-invitee");
    const org = await createOrg(owner);
    const invited = await owner.client
      .from("invitations")
      .insert({ organization_id: org, email: invitee.email, role: "admin" })
      .select("id")
      .single();
    if (invited.error) throw invited.error;
    await addMember(org, invitee, "member");
    await addMembers(org, 1);

    const { error } = await invitee.client.rpc("accept_invitation", {
      invitation_id: invited.data.id,
    });
    expect(error).toBeNull();
    const { rows } = await db.query<{ role: string }>(
      "select role from public.memberships where organization_id = $1 and user_id = $2",
      [org, invitee.id],
    );
    expect(rows[0]?.role).toBe("member");
  });

  it("does not block creating an organization", async () => {
    const creator = await newUser("mem-creator");
    const { error } = await creator.client
      .from("organizations")
      .insert({ name: "Fresh", slug: unique("fresh") });
    expect(error).toBeNull();
    const { rows } = await db.query<{ id: string }>(
      "select organization_id as id from public.memberships where user_id = $1",
      [creator.id],
    );
    orgIds.push(...rows.map(({ id }) => id));
  });
});
