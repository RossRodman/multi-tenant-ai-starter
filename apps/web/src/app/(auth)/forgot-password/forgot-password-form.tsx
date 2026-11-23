"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "../actions";
import { Feedback, Field, SubmitButton } from "../auth-ui";
import { initialState } from "../form-state";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending...">Send reset link</SubmitButton>
    </form>
  );
}
