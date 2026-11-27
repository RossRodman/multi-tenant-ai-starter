import { cn } from "@/lib/utils";

import type { TicketStatus } from "../schemas";

const TONES: Record<TicketStatus, string> = {
  open: "bg-indigo-50 text-indigo-900 dark:bg-indigo-400/20 dark:text-indigo-200",
  closed: "bg-foreground/6 text-foreground/80",
};

const statusLabel = (status: TicketStatus) => (status === "open" ? "Open" : "Closed");

export function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[status])}
    >
      {statusLabel(status)}
    </span>
  );
}
