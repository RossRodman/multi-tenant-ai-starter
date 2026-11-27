import { formatDate } from "@/lib/format";

import type { TicketAuthor } from "./tickets";

const sameYear = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function shortDate(value: string, now = new Date()) {
  const date = new Date(value);
  return date.getUTCFullYear() === now.getUTCFullYear() ? sameYear.format(date) : formatDate(value);
}

export const authorLabel = (author: TicketAuthor | null) =>
  author ? (author.name ?? author.email) : "Former member";

export function searchTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[\s"]+/)
    .map((term) => term.replace(/^-+/, ""))
    .filter((term) => term.length > 1 && term !== "or");
}
