"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/app/(auth)/auth-ui";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NAME_MAX, SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/slug";

import { changeSlugAction, renameOrganizationAction } from "../actions";
import { settingsErrorMessages, settingsInitialState } from "../form-state";
import type { SettingsFormState } from "../form-state";

function Feedback({ state }: { state: SettingsFormState }) {
  if (state.error) return <Alert variant="destructive">{settingsErrorMessages[state.error]}</Alert>;
  if (state.saved) return <Alert>Saved.</Alert>;
  return null;
}

export function RenameForm({ slug, name }: { slug: string; name: string }) {
  const [state, action] = useActionState(renameOrganizationAction, settingsInitialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={NAME_MAX}
          autoComplete="organization"
          defaultValue={state.value ?? name}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? "name-error" : undefined}
        />
        {state.fieldError ? (
          <p id="name-error" className="text-sm text-destructive">
            {state.fieldError}
          </p>
        ) : null}
      </div>
      <Feedback state={state} />
      <SubmitButton pendingLabel="Saving..." className="w-auto self-start px-4">
        Save
      </SubmitButton>
    </form>
  );
}

export function SlugForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(changeSlugAction, settingsInitialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-slug">Slug</Label>
        <div className="group flex">
          <span
            aria-hidden
            className="flex items-center rounded-l-md border border-r-0 border-input bg-foreground/5 px-3 text-muted-foreground group-has-[input[aria-invalid=true]]:border-destructive"
          >
            …/o/
          </span>
          <Input
            id="new-slug"
            name="new_slug"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={SLUG_MAX}
            minLength={SLUG_MIN}
            pattern={SLUG_PATTERN.source}
            defaultValue={state.value ?? slug}
            aria-invalid={state.fieldError ? true : undefined}
            aria-describedby="slug-hint"
            className="min-w-0 flex-1 rounded-l-none"
          />
        </div>
        <p
          id="slug-hint"
          className={
            state.fieldError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {state.fieldError ??
            "Links with the old slug will stop working, and another organization can take it."}
        </p>
      </div>
      <Feedback state={state} />
      <SubmitButton pendingLabel="Saving..." className="w-auto self-start px-4">
        Change slug
      </SubmitButton>
    </form>
  );
}
