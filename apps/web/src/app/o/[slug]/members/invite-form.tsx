"use client";

import type { MembershipRole } from "@repo/db";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/app/(auth)/auth-ui";

import { inviteMembersAction } from "../actions";
import { inviteErrorMessages, inviteInitialState, rowsKey } from "../form-state";
import { InviteResults } from "../invite-results";
import { InviteRows } from "../invite-rows";

export function InviteForm({ slug, viewerRole }: { slug: string; viewerRole: MembershipRole }) {
  const [state, action] = useActionState(inviteMembersAction, inviteInitialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <InviteRows
        key={state.results ? `sent-${String(state.submission)}` : rowsKey(state.rows)}
        viewerRole={viewerRole}
        initialRows={1}
        defaults={state.error ? state.rows : undefined}
      />
      {state.error ? <Alert variant="destructive">{inviteErrorMessages[state.error]}</Alert> : null}
      {state.results ? <InviteResults results={state.results} /> : null}
      <SubmitButton pendingLabel="Sending..." className="w-auto self-start px-4">
        Send invitations
      </SubmitButton>
    </form>
  );
}
