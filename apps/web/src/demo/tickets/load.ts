import "server-only";

import { notFound } from "next/navigation";

import { parseFilter } from "./paths";
import { ticketScope } from "./scope";

export interface TicketsPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function loadTicketsPage({ params, searchParams }: TicketsPageProps) {
  const { slug } = await params;
  const current = await ticketScope(slug);
  if (!current) notFound();
  return { ...current, slug, filter: parseFilter(await searchParams) };
}
