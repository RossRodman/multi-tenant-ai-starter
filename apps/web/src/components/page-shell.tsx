import type { ReactNode } from "react";

export function PageShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="px-4 py-6">
      <p className="text-sm font-medium">Multi-tenant AI Starter</p>
      <main className="mx-auto mt-[22vh] flex w-full max-w-[22rem] flex-col gap-6">{children}</main>
    </div>
  );
}
