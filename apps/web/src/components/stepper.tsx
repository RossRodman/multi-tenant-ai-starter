import { Fragment } from "react";

import { cn } from "@/lib/utils";

const STEPS = ["Account", "Organization", "Team", "Done"] as const;

export type Step = (typeof STEPS)[number];

export function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <li
                aria-hidden
                className={cn("h-px min-w-3 flex-1", done || active ? "bg-primary" : "bg-input")}
              />
            ) : null}
            <li
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                active ? "font-semibold" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-input",
                )}
              >
                {done ? (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-3"
                  >
                    <path d="m3.5 8.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden sm:inline">{step}</span>
              <span className="sr-only sm:hidden">{step}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
