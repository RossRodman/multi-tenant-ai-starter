"use client";

import { useActionState, useState } from "react";
import { flushSync } from "react-dom";

import { OnboardingCard } from "@/components/onboarding-card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN, toSlug } from "@/lib/slug";

import { Field, SubmitButton } from "../(auth)/auth-ui";
import { createOrganizationAction } from "./actions";
import { errorMessages, initialState } from "./form-state";

function suggestSlug(name: string) {
  const slug = toSlug(name);
  return slug.length >= SLUG_MIN ? slug : "";
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

export function CreateOrganizationForm({ title }: { title: string }) {
  const [state, action] = useActionState(createOrganizationAction, initialState);
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [following, setFollowing] = useState(slug === suggestSlug(name));
  const slugError = state.fieldErrors?.slug;

  function commitSlug() {
    const normalized = normalizeSlug(slug);
    setSlug(normalized);
    if (normalized === "") setFollowing(true);
  }

  return (
    <OnboardingCard title={title}>
      <form action={action} className="flex flex-col gap-5">
        <Field
          label="Name"
          name="name"
          placeholder="Acme, Inc."
          autoComplete="organization"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (following) setSlug(suggestSlug(event.target.value));
          }}
          error={state.fieldErrors?.name}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Slug</Label>
          <div className="group flex">
            <span
              aria-hidden
              className="flex items-center rounded-l-md border border-r-0 border-input bg-foreground/5 px-3 text-muted-foreground group-has-[input[aria-invalid=true]]:border-destructive"
            >
              …/o/
            </span>
            <Input
              id="slug"
              name="slug"
              placeholder="acme"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={SLUG_MAX}
              minLength={SLUG_MIN}
              pattern={SLUG_PATTERN.source}
              aria-invalid={slugError ? true : undefined}
              aria-describedby={slugError ? "slug-error" : undefined}
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setFollowing(event.target.value === "");
              }}
              onBlur={commitSlug}
              onKeyDown={(event) => {
                if (event.key === "Enter") flushSync(commitSlug);
              }}
              className="min-w-0 flex-1 rounded-l-none"
            />
          </div>
          {slugError ? (
            <p id="slug-error" className="text-sm text-destructive">
              {slugError}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Lowercase letters, numbers and dashes</p>
          )}
        </div>
        {state.error ? <Alert variant="destructive">{errorMessages[state.error]}</Alert> : null}
        <SubmitButton pendingLabel="Creating...">Create organization</SubmitButton>
      </form>
    </OnboardingCard>
  );
}
