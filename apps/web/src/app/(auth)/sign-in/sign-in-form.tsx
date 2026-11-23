"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Feedback, SubmitButton } from "../auth-ui";
import { signInAction } from "../actions";
import { initialState } from "../form-state";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <input type="hidden" name="next" value={next} />
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
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        action={
          <Link
            href="/forgot-password"
            className="text-sm text-ring underline-offset-4 hover:underline"
          >
            Forgot?
          </Link>
        }
      />
      <SubmitButton name="intent" value="password" pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
      <SubmitButton variant="link" name="intent" value="magic-link" formNoValidate>
        Email me a sign-in link
      </SubmitButton>
      {state.error === "email_not_confirmed" ? (
        <SubmitButton variant="link" name="intent" value="resend" formNoValidate>
          Resend confirmation email
        </SubmitButton>
      ) : null}
    </form>
  );
}
