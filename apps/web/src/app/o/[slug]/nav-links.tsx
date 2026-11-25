"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px] shrink-0"
    >
      {children}
    </svg>
  );
}

const icons = {
  overview: <path d="M3 9l7-6 7 6v8a1 1 0 01-1 1h-3v-5H7v5H4a1 1 0 01-1-1z" />,
  members: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 4.5a3 3 0 010 5.5M15 12.3c1.6.7 2.6 2.3 2.6 4.7" />
    </>
  ),
  billing: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 8.5h15M5.5 12.5h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
};

export function NavLinks({ slug, showSettings }: { slug: string; showSettings: boolean }) {
  const pathname = usePathname();
  const base = `/o/${slug}`;
  const links = [
    { href: base, label: "Overview", icon: icons.overview },
    { href: `${base}/members`, label: "Members", icon: icons.members },
    ...(showSettings
      ? [
          { href: `${base}/billing`, label: "Billing", icon: icons.billing },
          { href: `${base}/settings`, label: "Settings", icon: icons.settings },
        ]
      : []),
  ];

  return (
    <nav aria-label="Organization" className="flex flex-col gap-0.5">
      {links.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href as Route}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium hover:bg-foreground/5",
            pathname === href && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
          )}
        >
          <Icon>{icon}</Icon>
          {label}
        </Link>
      ))}
    </nav>
  );
}
