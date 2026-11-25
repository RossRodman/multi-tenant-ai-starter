import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        className={cn(
          "h-10 appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      >
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export { NativeSelect };
