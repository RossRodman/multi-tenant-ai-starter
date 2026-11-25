"use client";

import type { MembershipRole } from "@repo/db";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import type { SeatUsage } from "@/lib/billing";
import { SubmitButton } from "@/app/(auth)/auth-ui";

import { inviteMembersAction } from "../actions";
import { inviteErrorMessages, inviteInitialState, rowsKey } from "../form-state";
import { InviteResults } from "../invite-results";
import { InviteRows } from "../invite-rows";
import { SeatHint, countFilled, seatsBlocked } from "../seat-hint";

export function InviteForm({
  slug,
  viewerRole,
  seats,
}: {
  slug: string;
  viewerRole: MembershipRole;
  seats: SeatUsage;
}) {
  const [state, action] = useActionState(inviteMembersAction, inviteInitialState);
  const [counted, setCounted] = useState({ submission: state.submission, filled: 0 });
  const filled = counted.submission === state.submission ? counted.filled : 0;
  const blocked = seatsBlocked(seats, filled);

  return (
    <form
      action={action}
      onChange={(event) => {
        setCounted({ submission: state.submission, filled: countFilled(event.currentTarget) });
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <InviteRows
        key={state.results ? `sent-${String(state.submission)}` : rowsKey(state.rows)}
        viewerRole={viewerRole}
        initialRows={1}
        defaults={state.error ? state.rows : undefined}
      />
      <SeatHint seats={seats} filled={filled} slug={slug} isOwner={viewerRole === "owner"} />
      {state.error ? <Alert variant="destructive">{inviteErrorMessages[state.error]}</Alert> : null}
      {state.results ? <InviteResults results={state.results} /> : null}
      <SubmitButton
        pendingLabel="Sending..."
        className="w-auto self-start px-4"
        {...(blocked ? { disabled: true } : {})}
      >
        Send invitations
      </SubmitButton>
    </form>
  );
}
