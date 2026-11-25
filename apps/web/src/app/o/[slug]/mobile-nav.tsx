"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ switcher, children }: { switcher: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 border-b border-input bg-background px-3 py-2 md:hidden">
        {switcher}
        <SheetTrigger
          aria-label="Open menu"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
            className="size-5"
          >
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" strokeLinecap="round" />
          </svg>
        </SheetTrigger>
      </div>
      <SheetContent
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
