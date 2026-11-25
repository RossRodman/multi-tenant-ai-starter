import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  acceptInvitation,
  inviteMembers,
  listMyInvitations,
  listPendingInvitations,
  resendInvitation,
  revokeInvitation,
} from "../src/server/invitations";
import { createOrganization } from "../src/server/organizations";
import { env } from "./env";
import { createAdminClient, createUser, uniqueEmail, waitForMessage } from "./harness";

const db = new pg.Client({ connectionString: env.dbUrl });
await db.connect();

const users: { id: string }[] = [];
const orgIds: string[] = [];

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const { id } of users) await createAdminClient().auth.admin.deleteUser(id);
  await db.end();
});

async function newUser(label: string) {
  const user = await createUser(label);
  users.push(user);
  return user;
}

async function setup(name = "Acme") {
  const [owner, admin] = await Promise.all([newUser("inv-owner"), newUser("inv-admin")]);
  const slug = `invite-${crypto.randomUUID().slice(0, 8)}`;
  await createOrganization(owner.client, { name, slug });
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  const id = rows[0]?.id ?? "";
  orgIds.push(id);
  await db.query("insert into public.memberships values ($1, $2, 'admin')", [id, admin.id]);
  return { owner, admin, organization: { id, name, slug } };
}

describe("inviteMembers", () => {
  it("returns one result per row", async () => {
    const { owner, admin, organization } = await setup();
    const fresh = uniqueEmail("fresh");

    const results = await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email: fresh, role: "member" },
      { email: "not an email", role: "member" },
      { email: admin.email, role: "member" },
      { email: fresh.toUpperCase(), role: "member" },
    ]);

    expect(results).toEqual([
      { email: fresh, result: "sent" },
      { email: "not an email", result: "invalid_email" },
      { email: admin.email, result: "already_member" },
      { email: fresh.toUpperCase(), result: "sent" },
    ]);
    expect(await listPendingInvitations(owner.client, organization.id)).toHaveLength(1);
  });

  it("refuses an admin inviting an owner and keeps the existing invitation", async () => {
    const { owner, admin, organization } = await setup();
    const email = uniqueEmail("promote");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email, role: "member" },
    ]);

    const results = await inviteMembers(admin.client, organization, { email: admin.email }, [
      { email, role: "owner" },
    ]);
    expect(results).toEqual([{ email, result: "forbidden" }]);
    expect(await listPendingInvitations(admin.client, organization.id)).toMatchObject([
      { email, role: "member" },
    ]);
  });

  it("replaces a pending invitation and mails the new link", async () => {
    const { owner, organization } = await setup();
    const email = uniqueEmail("again");
    const send = () =>
      inviteMembers(owner.client, organization, { email: owner.email }, [{ email, role: "admin" }]);
    expect(await send()).toEqual([{ email, result: "sent" }]);
    const [first] = await listPendingInvitations(owner.client, organization.id);
    expect(await send()).toEqual([{ email, result: "sent" }]);
    const pending = await listPendingInvitations(owner.client, organization.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).not.toBe(first?.id);
  });

  it("sends the invitation by email with the right recipient, subject and link", async () => {
    const { owner, organization } = await setup();
    const email = uniqueEmail("mailed");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email, role: "admin" },
    ]);
    const [invitation] = await listPendingInvitations(owner.client, organization.id);

    const message = await waitForMessage(email);
    expect(message.subject).toBe(`${owner.email} invited you to Acme`);
    expect(message.text).toContain(`http://localhost:3000/app?invitation=${invitation?.id ?? ""}`);
    expect(message.html).toContain(`/app?invitation=${invitation?.id ?? ""}`);
    expect(message.text).toContain("as Admin");
  });

  it("escapes the organization name in the HTML part", async () => {
    const { owner, organization } = await setup(`<b>Evil</b> & "Co"`);
    const email = uniqueEmail("escaped");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email, role: "member" },
    ]);
    const message = await waitForMessage(email);
    expect(message.html).not.toContain("<b>Evil</b>");
    expect(message.html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; &quot;Co&quot;");
  });
});

describe("invitation lifecycle", () => {
  it("lists my invitations without the organization's other invitations", async () => {
    const { owner, admin, organization } = await setup();
    const invitee = await newUser("inv-me");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email: invitee.email, role: "member" },
      { email: uniqueEmail("someone-else"), role: "member" },
    ]);

    const mine = await listMyInvitations(invitee.client, invitee.email);
    expect(mine).toMatchObject([
      {
        role: "member",
        invitedByEmail: owner.email,
        organization: { name: "Acme", slug: organization.slug },
      },
    ]);
    expect(await listPendingInvitations(admin.client, organization.id)).toHaveLength(2);
    expect(await listMyInvitations(admin.client, admin.email)).toEqual([]);
  });

  it("accepts an invitation and maps every miss to not_available", async () => {
    const { owner, organization } = await setup();
    const invitee = await newUser("inv-accept");
    const stranger = await newUser("inv-stranger");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email: invitee.email, role: "admin" },
    ]);
    const [invitation] = await listMyInvitations(invitee.client, invitee.email);
    const id = invitation?.id ?? "";

    expect(await acceptInvitation(stranger.client, id)).toEqual({
      ok: false,
      error: "not_available",
    });
    expect(await acceptInvitation(invitee.client, id)).toEqual({
      ok: true,
      slug: organization.slug,
    });
    expect(await acceptInvitation(invitee.client, id)).toEqual({
      ok: false,
      error: "not_available",
    });
    expect(await acceptInvitation(invitee.client, crypto.randomUUID())).toEqual({
      ok: false,
      error: "not_available",
    });
  });

  it("revokes and resends", async () => {
    const { owner, admin, organization } = await setup();
    const email = uniqueEmail("revoke");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email, role: "owner" },
    ]);
    const [invitation] = await listPendingInvitations(owner.client, organization.id);
    const id = invitation?.id ?? "";

    expect(await revokeInvitation(admin.client, organization.id, id)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await resendInvitation(admin.client, organization, { email: admin.email }, id)).toBe(
      "forbidden",
    );

    expect(await resendInvitation(owner.client, organization, { email: owner.email }, id)).toBe(
      "sent",
    );
    const [resent] = await listPendingInvitations(owner.client, organization.id);
    expect(resent).toMatchObject({ email, role: "owner" });
    expect(resent?.id).not.toBe(id);

    expect(await revokeInvitation(owner.client, organization.id, resent?.id ?? "")).toEqual({
      ok: true,
    });
    expect(await listPendingInvitations(owner.client, organization.id)).toEqual([]);
  });

  it("resends an expired invitation", async () => {
    const { owner, organization } = await setup();
    const email = uniqueEmail("expired");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email, role: "member" },
    ]);
    await db.query(
      "update public.invitations set expires_at = now() - interval '1 day' where organization_id = $1",
      [organization.id],
    );
    const [expired] = await listPendingInvitations(owner.client, organization.id);
    expect(expired?.email).toBe(email);

    expect(
      await resendInvitation(owner.client, organization, { email: owner.email }, expired?.id ?? ""),
    ).toBe("sent");
    const [fresh] = await listPendingInvitations(owner.client, organization.id);
    expect(fresh?.id).not.toBe(expired?.id);
    expect(new Date(fresh?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not revoke an invitation through another organization's id", async () => {
    const { owner, organization } = await setup();
    const other = await setup("Other");
    await inviteMembers(owner.client, organization, { email: owner.email }, [
      { email: uniqueEmail("scoped"), role: "member" },
    ]);
    const [invitation] = await listPendingInvitations(owner.client, organization.id);

    expect(
      await revokeInvitation(other.owner.client, other.organization.id, invitation?.id ?? ""),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(
      await revokeInvitation(owner.client, other.organization.id, invitation?.id ?? ""),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await listPendingInvitations(owner.client, organization.id)).toHaveLength(1);
  });
});
