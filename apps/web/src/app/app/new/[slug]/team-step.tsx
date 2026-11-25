"use client";

import type { MembershipRole } from "@repo/db";
import Link from "next/link";
import type { Route } from "next";
import { useActionState } from "react";

import { inviteMembersAction } from "@/app/o/[slug]/actions";
import { inviteErrorMessages, inviteInitialState, rowsKey } from "@/app/o/[slug]/form-state";
import { InviteResults } from "@/app/o/[slug]/invite-results";
import { InviteRows } from "@/app/o/[slug]/invite-rows";
import { SubmitButton } from "@/app/(auth)/auth-ui";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { OnboardingCard } from "@/components/onboarding-card";
import { Stepper } from "@/components/stepper";

export function TeamStep({ slug, viewerRole }: { slug: string; viewerRole: MembershipRole }) {
  const [state, action] = useActionState(inviteMembersAction, inviteInitialState);
  const organizationHref = `/o/${slug}` as Route;

  if (state.results) {
    return (
      <>
        <Stepper current="Done" />
        <OnboardingCard title="You're all set">
          <InviteResults results={state.results} />
          <Link href={organizationHref} className={buttonVariants()}>
            Open organization
          </Link>
        </OnboardingCard>
      </>
    );
  }

  return (
    <>
      <Stepper current="Team" />
      <OnboardingCard
        title="Invite your team"
        description="Add teammates now or skip this step and do it later."
      >
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="slug" value={slug} />
          <InviteRows
            key={rowsKey(state.rows)}
            viewerRole={viewerRole}
            defaults={state.error ? state.rows : undefined}
          />
          {state.error ? (
            <Alert variant="destructive">{inviteErrorMessages[state.error]}</Alert>
          ) : null}
          <SubmitButton pendingLabel="Sending...">Send invitations</SubmitButton>
          <Link href={organizationHref} className={buttonVariants({ variant: "outline" })}>
            Skip for now
          </Link>
        </form>
      </OnboardingCard>
    </>
  );
}
