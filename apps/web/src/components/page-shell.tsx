import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Logo } from "./logo";

export function PageShell({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <Logo />
      <main className={cn("mx-auto mt-[16vh] flex w-full max-w-[22rem] flex-col gap-6", className)}>
        {children}
      </main>
    </div>
  );
}
