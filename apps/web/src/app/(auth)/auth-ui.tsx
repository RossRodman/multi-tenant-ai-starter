"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { errorMessages, noticeMessage } from "./form-state";
import type { FormState } from "./form-state";

export function Field({
  label,
  name,
  error,
  action,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  name: string;
  error?: string;
  action?: ReactNode;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={name}>{label}</Label>
        {action}
      </div>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return <Alert variant="destructive">{errorMessages[state.error]}</Alert>;
  }
  if (state.notice && state.email) {
    return <Alert>{noticeMessage(state.notice, state.email)}</Alert>;
  }
  return null;
}

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
