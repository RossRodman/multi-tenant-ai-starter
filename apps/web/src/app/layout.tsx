import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-tenant AI Starter",
  description: "Multi-tenant SaaS starter.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-base text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
