"use client";

import Link from "next/link";
import { useActionState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/password";

import { updatePasswordAction } from "../actions";
import { Feedback, Field, SubmitButton } from "../auth-ui";
import { initialState } from "../form-state";

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      {state.error === "invalid_link" ? (
        <Link
          href="/forgot-password"
          className="text-sm text-ring underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      ) : null}
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Saving...">Set new password</SubmitButton>
    </form>
  );
}
