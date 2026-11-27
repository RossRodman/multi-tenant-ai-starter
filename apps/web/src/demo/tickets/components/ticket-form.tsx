"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";

import { Field, SubmitButton } from "@/app/(auth)/auth-ui";
import { ConfirmDialog } from "@/app/o/[slug]/members/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { ticketInitialState } from "../form-state";
import type { TicketFormState } from "../form-state";
import { BODY_MAX, TITLE_MAX } from "../schemas";
import type { TicketStatus } from "../schemas";
import { TEXTAREA } from "./styles";

type FormAction = (state: TicketFormState, formData: FormData) => Promise<TicketFormState>;

const SECONDARY = cn(buttonVariants({ variant: "outline" }), "w-auto px-4");

function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

export function TicketForm({
  action,
  fields,
  closeHref,
  ticket,
  submitLabel,
  note,
  secondary,
}: {
  action: FormAction;
  fields: Record<string, string>;
  closeHref: string;
  ticket?: { title: string; body: string; status: TicketStatus };
  submitLabel: string;
  note?: ReactNode;
  secondary?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, ticketInitialState);
  const values = state.values ?? ticket;
  const errors = state.fieldErrors ?? {};

  return (
    <>
      <form id="ticket-form" action={formAction} className="flex flex-col gap-4">
        <HiddenFields fields={fields} />
        <Field
          label="Title"
          name="title"
          required
          maxLength={TITLE_MAX}
          placeholder="Short summary of the request"
          defaultValue={values?.title}
          error={errors.title}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-body">Description</Label>
          <textarea
            id="ticket-body"
            name="body"
            rows={5}
            maxLength={BODY_MAX}
            defaultValue={values?.body}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? "ticket-body-error" : undefined}
            className={TEXTAREA}
          />
          {errors.body ? (
            <p id="ticket-body-error" className="text-sm text-destructive">
              {errors.body}
            </p>
          ) : null}
        </div>
        {ticket ? (
          <div className="flex flex-col items-start gap-1.5">
            <Label htmlFor="ticket-form-status">Status</Label>
            <NativeSelect
              id="ticket-form-status"
              name="status"
              key={state.values?.status}
              defaultValue={state.values?.status ?? ticket.status}
              className="w-[200px]"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </NativeSelect>
          </div>
        ) : null}
        {note}
        {state.error ? <Alert variant="destructive">Something went wrong. Try again.</Alert> : null}
      </form>
      <div className="flex flex-wrap justify-between gap-2.5">
        <div className="flex flex-wrap gap-2.5">{secondary}</div>
        <div className="flex gap-2.5">
          <Link href={closeHref as Route} scroll={false} className={SECONDARY}>
            Cancel
          </Link>
          <Button type="submit" form="ticket-form" disabled={pending} className="w-auto px-4">
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

export function StatusButton({
  action,
  fields,
  status,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  status: TicketStatus;
}) {
  return (
    <form action={action}>
      <HiddenFields fields={{ ...fields, status: status === "open" ? "closed" : "open" }} />
      <SubmitButton variant="outline" className="w-auto px-4">
        {status === "open" ? "Close ticket" : "Reopen ticket"}
      </SubmitButton>
    </form>
  );
}

export function DeleteButton({
  action,
  fields,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-auto px-4 text-destructive"
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        action={action}
        fields={fields}
        title="Delete this ticket?"
        description={`“${title}” will be deleted for everyone in the organization. This can't be undone.`}
        confirmLabel="Delete ticket"
      />
    </>
  );
}
