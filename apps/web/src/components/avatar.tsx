import { cn } from "@/lib/utils";
import { initials, personInitials } from "@/lib/format";

const TINTS = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-400/20 dark:text-rose-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200",
];

const tintFor = (seed: string) =>
  TINTS[Array.from(seed).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % TINTS.length];

export function OrganizationAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold",
        tintFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserAvatar({
  email,
  name,
  className,
}: {
  email: string;
  name: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        tintFor(email),
        className,
      )}
    >
      {personInitials(name, email)}
    </span>
  );
}
