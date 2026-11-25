import pg from "pg";
import { afterAll, describe, expect, it, onTestFinished } from "vitest";

import { SLUG_MAX, SLUG_PATTERN, toSlug } from "@/lib/slug";

import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "../src/server/organizations";
import { env } from "./env";
import { createAdminClient, createUser } from "./harness";

const db = new pg.Client({ connectionString: env.dbUrl });
await db.connect();

const [owner, other] = await Promise.all([createUser("org-owner"), createUser("org-other")]);

async function cleanup(userIds: string[]) {
  await db.query(
    "delete from public.organizations where id in (select organization_id from public.memberships where user_id = any ($1))",
    [userIds],
  );
  const admin = createAdminClient();
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

afterAll(async () => {
  await cleanup([owner.id, other.id]);
  await db.end();
});

const run = crypto.randomUUID().slice(0, 8);
let counter = 0;
const nextName = (label = "Acme") => `${label} ${run} ${String(++counter)}`;

async function organizationBySlug(slug: string) {
  const { rows } = await db.query<{ id: string; name: string; user_id: string; role: string }>(
    `select o.id, o.name, m.user_id, m.role
     from public.organizations o join public.memberships m on m.organization_id = o.id
     where o.slug = $1`,
    [slug],
  );
  return rows;
}

describe("createOrganization with a given slug", () => {
  it("creates an organization owned by the user", async () => {
    const slug = `given-${run}`;
    const name = nextName();
    expect(await createOrganization(owner.client, { name, slug })).toEqual({ ok: true, slug });
    expect(await organizationBySlug(slug)).toMatchObject([
      { name, user_id: owner.id, role: "owner" },
    ]);
  });

  it("trims the name and lowercases the slug", async () => {
    const result = await createOrganization(owner.client, {
      name: `  ${nextName()}  `,
      slug: ` Upper-${run} `,
    });
    expect(result).toEqual({ ok: true, slug: `upper-${run}` });
  });

  it("returns slug_taken without retrying", async () => {
    const slug = `taken-${run}`;
    await createOrganization(owner.client, { name: nextName(), slug });
    expect(await createOrganization(other.client, { name: nextName(), slug })).toEqual({
      ok: false,
      error: "slug_taken",
    });
  });

  it.each(["ab", "a".repeat(49), "has space", "-lead", "trail-", "dou--ble", "under_score"])(
    "rejects the slug %j",
    async (slug) => {
      expect(await createOrganization(owner.client, { name: nextName(), slug })).toEqual({
        ok: false,
        error: "invalid_slug",
      });
    },
  );

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["too long", "a".repeat(81)],
    ["control character", "Ac\u0007me"],
    ["zero-width space", "Ac\u200bme"],
    ["bidi mark", "Ac\u202eme"],
    ["line separator", "Acme\u2028Inc"],
    ["paragraph separator", "Acme\u2029Inc"],
    ["deprecated format control", "Ac\u206ame"],
    ["interlinear annotation", "Ac\ufff9me"],
    ["mongolian vowel separator", "Ac\u180eme"],
    ["lone zero-width joiner", "\u200d"],
    ["soft hyphen only", "\u00ad"],
    ["variation selector only", "\ufe0f"],
  ])("rejects a %s name", async (_label, name) => {
    expect(await createOrganization(owner.client, { name, slug: `bad-name-${run}` })).toEqual({
      ok: false,
      error: "invalid_name",
    });
  });

  it.each([
    ["zero-width joiner", "\u{1F469}\u200d\u{1F4BB} Labs"],
    ["zero-width non-joiner", "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645"],
  ])("accepts a %s in a name", async (_label, name) => {
    const slug = `fmt-${run}-${String(++counter)}`;
    expect(await createOrganization(owner.client, { name, slug })).toEqual({ ok: true, slug });
  });

  it("accepts an 80 character name made of multi-unit characters", async () => {
    const name = "😀".repeat(80);
    const result = await createOrganization(owner.client, { name, slug: `emoji-${run}` });
    expect(result.ok).toBe(true);
  });
});

describe("createOrganization with an empty slug", () => {
  it("derives the slug from the name", async () => {
    const name = `Derived ${run}`;
    expect(await createOrganization(owner.client, { name, slug: "" })).toEqual({
      ok: true,
      slug: `derived-${run}`,
    });
  });

  it("adds a random suffix when the same name is used twice", async () => {
    const name = `Twin ${run}`;
    const first = await createOrganization(owner.client, { name, slug: "" });
    const second = await createOrganization(other.client, { name, slug: "" });
    expect(first).toEqual({ ok: true, slug: `twin-${run}` });
    expect(second).toMatchObject({ ok: true });
    expect(second.ok && second.slug).toMatch(new RegExp(`^twin-${run}-[a-z0-9]{4}$`));
  });

  it("falls back to org-xxxx when nothing usable remains", async () => {
    const result = await createOrganization(owner.client, { name: "Привіт", slug: "" });
    expect(result.ok && result.slug).toMatch(/^org-[a-z0-9]{4}$/);
  });

  it("suffixes a short result", async () => {
    const result = await createOrganization(owner.client, { name: "Ab", slug: "" });
    expect(result.ok && result.slug).toMatch(/^ab-[a-z0-9]{4}$/);
  });

  it.each([42, 43, 44])(
    "produces valid slugs for a long name with a separator at position %i",
    async (position) => {
      const name = `${run}${"a".repeat(position - 1 - run.length)} ${"b".repeat(60)}`.slice(0, 80);
      const first = await createOrganization(owner.client, { name, slug: "" });
      const second = await createOrganization(other.client, { name, slug: "" });
      for (const result of [first, second]) {
        expect(result.ok).toBe(true);
        expect(result.ok && result.slug).toMatch(SLUG_PATTERN);
        expect(result.ok && result.slug.length).toBeLessThanOrEqual(SLUG_MAX);
      }
      const base = toSlug(name);
      const stem = base.slice(0, SLUG_MAX - 5).replace(/-+$/, "");
      expect(first).toEqual({ ok: true, slug: base });
      expect(second.ok && second.slug).toMatch(new RegExp(`^${stem}-[a-z0-9]{4}$`));
    },
  );
});

describe("listOrganizations", () => {
  it("returns the user's organizations once each, with their role", async () => {
    const lister = await createUser("org-lister");
    const colleague = await createUser("org-colleague");
    onTestFinished(() => cleanup([lister.id, colleague.id]));
    const names = [nextName("Zeta"), nextName("Alpha")];
    for (const name of names) {
      await createOrganization(lister.client, { name, slug: "" });
    }
    const { rows } = await db.query<{ id: string }>(
      "select organization_id as id from public.memberships where user_id = $1",
      [lister.id],
    );
    await createOrganization(colleague.client, { name: nextName("Private"), slug: "" });
    for (const { id } of rows) {
      await db.query("insert into public.memberships values ($1, $2, 'member')", [
        id,
        colleague.id,
      ]);
    }

    const listed = await listOrganizations(lister.client, lister.id);
    expect(listed.map((o) => o.name)).toEqual([...names].sort());
    expect(listed.every((o) => o.role === "owner")).toBe(true);

    const colleagues = await listOrganizations(colleague.client, colleague.id);
    expect(colleagues).toHaveLength(3);
    expect(colleagues.filter((o) => o.role === "member")).toHaveLength(2);
  });
});

describe("getOrganization", () => {
  it("returns the organization with the caller's role, and null for everyone else", async () => {
    const admin = await createUser("get-admin");
    const outsider = await createUser("get-outsider");
    const invitee = await createUser("get-invitee");
    onTestFinished(() => cleanup([admin.id, outsider.id, invitee.id]));

    const slug = `get-${run}`;
    await createOrganization(owner.client, { name: nextName(), slug });
    const { rows } = await db.query<{ id: string }>(
      "select id from public.organizations where slug = $1",
      [slug],
    );
    const orgId = rows[0]?.id;
    await db.query("insert into public.memberships values ($1, $2, 'admin')", [orgId, admin.id]);
    const invited = await owner.client
      .from("invitations")
      .insert({ organization_id: orgId ?? "", email: invitee.email, role: "member" });
    expect(invited.error).toBeNull();

    expect(await getOrganization(owner.client, owner.id, slug)).toMatchObject({
      id: orgId,
      slug,
      role: "owner",
    });
    expect(await getOrganization(admin.client, admin.id, slug)).toMatchObject({ role: "admin" });
    expect(await getOrganization(outsider.client, outsider.id, slug)).toBeNull();
    expect(await getOrganization(owner.client, owner.id, `missing-${run}`)).toBeNull();

    const readable = await invitee.client.from("organizations").select("id").eq("slug", slug);
    expect(readable.data).toHaveLength(1);
    expect(await getOrganization(invitee.client, invitee.id, slug)).toBeNull();
    expect((await listOrganizations(invitee.client, invitee.id)).map((o) => o.slug)).toEqual([]);
  });
});

describe("listOrganizations member count", () => {
  it("counts every member of each organization", async () => {
    const lister = await createUser("count-lister");
    const colleague = await createUser("count-colleague");
    onTestFinished(() => cleanup([lister.id, colleague.id]));
    await createOrganization(lister.client, { name: nextName("Counted"), slug: "" });
    await createOrganization(lister.client, { name: nextName("Solo"), slug: "" });
    const { rows } = await db.query<{ id: string }>(
      `select o.id from public.organizations o
       join public.memberships m on m.organization_id = o.id
       where m.user_id = $1 and o.name like 'Counted%'`,
      [lister.id],
    );
    await db.query("insert into public.memberships values ($1, $2, 'member')", [
      rows[0]?.id,
      colleague.id,
    ]);

    const listed = await listOrganizations(lister.client, lister.id);
    expect(listed.map(({ name, memberCount }) => [name.split(" ")[0], memberCount])).toEqual([
      ["Counted", 2],
      ["Solo", 1],
    ]);
  });
});

describe("updateOrganization", () => {
  async function setup() {
    const admin = await createUser("upd-admin");
    const member = await createUser("upd-member");
    onTestFinished(() => cleanup([admin.id, member.id]));
    const slug = `upd-${crypto.randomUUID().slice(0, 8)}`;
    await createOrganization(owner.client, { name: nextName("Update"), slug });
    const { rows } = await db.query<{ id: string }>(
      "select id from public.organizations where slug = $1",
      [slug],
    );
    const id = rows[0]?.id ?? "";
    await db.query("insert into public.memberships values ($1, $2, 'admin'), ($1, $3, 'member')", [
      id,
      admin.id,
      member.id,
    ]);
    return { admin, member, id, slug };
  }

  it("renames and changes the slug for an owner and an admin", async () => {
    const { admin, id } = await setup();
    expect(await updateOrganization(owner.client, id, { name: "  New name  " })).toMatchObject({
      ok: true,
    });
    const slug = `moved-${crypto.randomUUID().slice(0, 8)}`;
    expect(await updateOrganization(admin.client, id, { slug: ` ${slug.toUpperCase()} ` })).toEqual(
      { ok: true, slug },
    );
    const { rows } = await db.query("select name, slug from public.organizations where id = $1", [
      id,
    ]);
    expect(rows[0]).toEqual({ name: "New name", slug });
  });

  it("maps validation, a taken slug and a member to their errors", async () => {
    const { member, id } = await setup();
    const taken = `taken-${crypto.randomUUID().slice(0, 8)}`;
    await createOrganization(other.client, { name: nextName(), slug: taken });

    expect(await updateOrganization(owner.client, id, { name: "  " })).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(await updateOrganization(owner.client, id, { slug: "A_B" })).toEqual({
      ok: false,
      error: "invalid_slug",
    });
    expect(await updateOrganization(owner.client, id, { slug: "" })).toEqual({
      ok: false,
      error: "invalid_slug",
    });
    expect(await updateOrganization(owner.client, id, { slug: taken })).toEqual({
      ok: false,
      error: "slug_taken",
    });
    expect(await updateOrganization(member.client, id, { name: "Hijacked" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await updateOrganization(other.client, id, { name: "Hijacked" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
