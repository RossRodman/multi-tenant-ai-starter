import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-[18px] shrink-0", className)}
    >
      {children}
    </svg>
  );
}
