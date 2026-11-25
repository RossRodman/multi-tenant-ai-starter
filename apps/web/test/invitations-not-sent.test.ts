import pg from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/server/mail/send", () => ({ sendMail: () => Promise.resolve({ ok: false }) }));

const { inviteMembers, listPendingInvitations } = await import("../src/server/invitations");
const { createOrganization } = await import("../src/server/organizations");
const { env } = await import("./env");
const { createAdminClient, createUser, uniqueEmail } = await import("./harness");

const db = new pg.Client({ connectionString: env.dbUrl });
await db.connect();
const owner = await createUser("not-sent");
let orgId = "";

afterAll(async () => {
  await db.query("delete from public.organizations where id = $1", [orgId]);
  await createAdminClient().auth.admin.deleteUser(owner.id);
  await db.end();
});

describe("inviteMembers when the mail transport fails", () => {
  it("reports not_sent and leaves the invitation in place", async () => {
    const slug = `not-sent-${crypto.randomUUID().slice(0, 8)}`;
    await createOrganization(owner.client, { name: "Acme", slug });
    orgId =
      (
        await db.query<{ id: string }>("select id from public.organizations where slug = $1", [
          slug,
        ])
      ).rows[0]?.id ?? "";
    const email = uniqueEmail("not-sent");

    const results = await inviteMembers(owner.client, { id: orgId, name: "Acme" }, owner, [
      { email, role: "member" },
    ]);

    expect(results).toEqual([{ email, result: "not_sent" }]);
    expect(await listPendingInvitations(owner.client, orgId)).toMatchObject([{ email }]);
  });
});
