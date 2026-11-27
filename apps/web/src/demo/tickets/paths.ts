import { ticketFilter } from "./schemas";
import type { TicketFilter } from "./schemas";

export function parseFilter(params: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return ticketFilter.parse({
    q: first(params.q) ?? "",
    status: first(params.status),
    page: first(params.page),
  });
}

export function filterParams(filter: Partial<TicketFilter>) {
  const query = new URLSearchParams();
  if (filter.q) query.set("q", filter.q);
  if (filter.status && filter.status !== "open") query.set("status", filter.status);
  if (filter.page && filter.page > 1) query.set("page", String(filter.page));
  return query.toString();
}

export function ticketsHref(slug: string, filter: Partial<TicketFilter> = {}, path = "") {
  const query = filterParams(filter);
  return `/o/${slug}/tickets${path}${query ? `?${query}` : ""}`;
}
