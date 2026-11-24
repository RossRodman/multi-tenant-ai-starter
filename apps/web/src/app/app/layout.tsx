import type { ReactNode } from "react";

import { PageShell } from "@/components/page-shell";
import { requireUser } from "@/server/session";

import { SignOutForm } from "./sign-out-form";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  return (
    <PageShell className="max-w-[28rem]">
      {children}
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0 truncate text-sm text-muted-foreground">{user.email}</span>
        <SignOutForm />
      </div>
    </PageShell>
  );
}
