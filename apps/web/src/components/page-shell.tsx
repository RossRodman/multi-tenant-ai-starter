import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className="px-4 py-6">
      <p className="text-sm font-medium">Multi-tenant AI Starter</p>
      <main className={cn("mx-auto mt-[22vh] flex w-full max-w-[22rem] flex-col gap-6", className)}>
        {children}
      </main>
    </div>
  );
}
