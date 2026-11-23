"use client";

import { useActionState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/password";

import { signUpAction } from "../actions";
import { Feedback, Field, SubmitButton } from "../auth-ui";
import { initialState } from "../form-state";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialState);

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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating account...">Create account</SubmitButton>
    </form>
  );
}
