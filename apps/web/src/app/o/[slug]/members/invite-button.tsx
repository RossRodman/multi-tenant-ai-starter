"use client";

import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InviteButton({ children }: { children: ReactNode }) {
  return (
    <a
      href="#invite"
      className={cn(buttonVariants(), "w-auto gap-2 px-4 font-semibold")}
      onClick={(event) => {
        const input = document.querySelector<HTMLInputElement>("#invite input[name=email]");
        if (!input) return;
        event.preventDefault();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}
