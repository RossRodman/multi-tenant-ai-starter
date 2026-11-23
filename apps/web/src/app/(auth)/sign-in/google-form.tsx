"use client";

import { useActionState } from "react";

import { googleSignInAction } from "../actions";
import { Feedback, SubmitButton } from "../auth-ui";
import { initialState } from "../form-state";

export function GoogleForm({ next }: { next: string }) {
  const [state, action] = useActionState(googleSignInAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton variant="outline" pendingLabel="Redirecting...">
        Continue with Google
      </SubmitButton>
    </form>
  );
}
