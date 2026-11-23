import type { ReactNode } from "react";

import { PageShell } from "@/components/page-shell";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PageShell>{children}</PageShell>;
}
