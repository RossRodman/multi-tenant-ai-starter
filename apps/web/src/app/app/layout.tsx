import type { ReactNode } from "react";

import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireUser();
  return children;
}
