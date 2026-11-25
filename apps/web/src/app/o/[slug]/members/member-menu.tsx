"use client";

import type { MembershipRole } from "@repo/db";
import { useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleLabel } from "@/lib/roles";

import { ConfirmDialog } from "./confirm-dialog";

interface Removal {
  action: (formData: FormData) => Promise<void>;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
}

export function MemberMenu({
  email,
  slug,
  userId,
  roles,
  changeRole,
  removal,
}: {
  email: string;
  slug: string;
  userId: string;
  roles: MembershipRole[];
  changeRole: (formData: FormData) => Promise<void>;
  removal: Removal;
}) {
  const form = useRef<HTMLFormElement>(null);
  const role = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);

  function select(value: MembershipRole) {
    if (!role.current) return;
    role.current.value = value;
    form.current?.requestSubmit();
  }

  return (
    <>
      <form ref={form} action={changeRole} hidden>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="user_id" value={userId} />
        <input ref={role} type="hidden" name="role" />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${email}`}
          className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden
            className="size-[18px]"
          >
            <circle cx="4.5" cy="10" r="1" />
            <circle cx="10" cy="10" r="1" />
            <circle cx="15.5" cy="10" r="1" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {roles.length > 0 ? (
            <>
              <DropdownMenuLabel>Change role</DropdownMenuLabel>
              {roles.map((value) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={() => {
                    select(value);
                  }}
                >
                  {roleLabel(value)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              setConfirming(true);
            }}
          >
            {removal.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        action={removal.action}
        fields={{ slug, user_id: userId }}
        title={removal.title}
        description={removal.description}
        confirmLabel={removal.confirmLabel}
      />
    </>
  );
}
