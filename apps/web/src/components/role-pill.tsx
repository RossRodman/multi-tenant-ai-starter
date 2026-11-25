import type { MembershipRole } from "@repo/db";

import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TONES: Record<MembershipRole, string> = {
  owner: "bg-accent text-accent-foreground",
  admin: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-200",
  member: "bg-foreground/8 text-foreground/80",
};

export function RolePill({ role }: { role: MembershipRole }) {
  return (
    <span
      className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[role])}
    >
      {roleLabel(role)}
    </span>
  );
}
