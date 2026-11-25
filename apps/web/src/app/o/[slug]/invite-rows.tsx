"use client";

import type { MembershipRole } from "@repo/db";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EMAIL_MAX, INVITE_ROWS_MAX } from "@/lib/invitations";
import type { InviteRow } from "@/lib/invitations";
import { assignableRoles, roleLabel } from "@/lib/roles";

const DEFAULT_ROWS = 3;

export function InviteRows({
  viewerRole,
  initialRows = DEFAULT_ROWS,
  defaults = [],
}: {
  viewerRole: MembershipRole;
  initialRows?: number;
  defaults?: InviteRow[];
}) {
  const [count, setCount] = useState(Math.max(initialRows, defaults.length));
  const roles = assignableRoles(viewerRole);

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-wrap gap-2">
          <Input
            type="email"
            name="email"
            aria-label={`Email ${String(index + 1)}`}
            placeholder="name@company.com"
            autoComplete="off"
            maxLength={EMAIL_MAX}
            defaultValue={defaults[index]?.email}
            className="min-w-44 flex-1"
          />
          <NativeSelect
            name="role"
            aria-label={`Role ${String(index + 1)}`}
            defaultValue={defaults[index]?.role ?? "member"}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}
      {count < INVITE_ROWS_MAX ? (
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setCount((value) => value + 1);
          }}
        >
          Add another
        </Button>
      ) : null}
    </div>
  );
}
