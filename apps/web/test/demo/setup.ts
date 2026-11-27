import pg from "pg";
import { afterAll, beforeAll } from "vitest";

import { createOrganization } from "../../src/server/organizations";
import { env } from "../env";
import { createAdminClient, createUser } from "../harness";

export type User = Awaited<ReturnType<typeof createUser>>;

export function ticketFixtures() {
  const db = new pg.Client({ connectionString: env.dbUrl });
  const users: User[] = [];
  const orgIds: string[] = [];

  beforeAll(async () => {
    await db.connect();
  });

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

  async function newOrg(owner: User, members: [User, "admin" | "member"][] = []) {
    const slug = `tickets-${crypto.randomUUID().slice(0, 8)}`;
    await createOrganization(owner.client, { name: "Tickets", slug });
    const { rows } = await db.query<{ id: string }>(
      "select id from public.organizations where slug = $1",
      [slug],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("organization not created");
    orgIds.push(id);
    for (const [user, role] of members) {
      await db.query("insert into public.memberships values ($1, $2, $3)", [id, user.id, role]);
    }
    return id;
  }

  async function leave(organizationId: string, user: User) {
    await db.query("delete from public.memberships where organization_id = $1 and user_id = $2", [
      organizationId,
      user.id,
    ]);
  }

  return { db, newUser, newOrg, leave };
}
