import "server-only";

import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { authorLabel, searchTerms, shortDate } from "../format";
import { ticketsHref } from "../paths";
import type { TicketFilter } from "../schemas";
import { hasTickets, listTickets } from "../tickets";
import type { Ticket, TicketScope } from "../tickets";
import { Highlight } from "./highlight";
import { Icon } from "./icon";
import { StatusPill } from "./status-pill";
import { TicketFilters } from "./ticket-filters";

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-input px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function NewTicketLink({
  slug,
  filter = {},
  label,
}: {
  slug: string;
  filter?: Partial<TicketFilter>;
  label: string;
}) {
  return (
    <Link
      href={ticketsHref(slug, filter, "/new") as Route}
      scroll={false}
      className={cn(buttonVariants(), "w-auto gap-2")}
    >
      <Icon>
        <path d="M10 4v12M4 10h12" />
      </Icon>
      {label}
    </Link>
  );
}

function EmptyState({ slug, organization }: { slug: string; organization: string }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-foreground/25 bg-background px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-[14px] bg-indigo-50 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200"
      >
        <Icon className="size-[26px]">
          <path d="M3 11l2-6h10l2 6v4a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
          <path d="M3 11h4l1 2h4l1-2h4" />
        </Icon>
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">No tickets yet</h2>
        <p className="max-w-[420px] leading-relaxed text-muted-foreground">
          Tickets are visible to everyone in {organization}. Create the first one.
        </p>
      </div>
      <NewTicketLink slug={slug} label="Create ticket" />
    </section>
  );
}

function TicketRow({
  ticket,
  href,
  terms,
  now,
}: {
  ticket: Ticket;
  href: Route;
  terms: string[];
  now: Date;
}) {
  return (
    <tr className="border-b border-foreground/8 last:border-b-0">
      <td className="max-w-0 px-4 py-3">
        <Link href={href} scroll={false} className="block">
          <span className="block truncate font-semibold">
            <Highlight text={ticket.title} terms={terms} />
          </span>
          {ticket.body ? (
            <span className="mt-0.5 block max-w-[460px] truncate text-[13px] text-muted-foreground">
              <Highlight text={ticket.body} terms={terms} />
            </span>
          ) : null}
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusPill status={ticket.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {ticket.author ? (
            <UserAvatar email={ticket.author.email} name={ticket.author.name} />
          ) : null}
          <span className={cn("truncate", !ticket.author && "text-muted-foreground")}>
            {authorLabel(ticket.author)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{shortDate(ticket.createdAt, now)}</td>
      <td className="px-4 py-3 text-right">
        {ticket.canManage ? (
          <Link
            href={href}
            scroll={false}
            aria-label={`Edit ${ticket.title}`}
            className="ml-auto flex size-9 items-center justify-center rounded-lg hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Icon>
              <circle cx="4.5" cy="10" r="1" />
              <circle cx="10" cy="10" r="1" />
              <circle cx="15.5" cy="10" r="1" />
            </Icon>
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

function PageLink({
  slug,
  filter,
  page,
  disabled,
  children,
}: {
  slug: string;
  filter: TicketFilter;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline" }), "h-9 w-auto px-3.5 text-sm");
  if (disabled) {
    return (
      <span aria-disabled className={cn(className, "text-muted-foreground opacity-60")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={ticketsHref(slug, { ...filter, page }) as Route} className={className}>
      {children}
    </Link>
  );
}

const emptyMessage = (filter: TicketFilter) => {
  if (filter.q) return `No tickets match “${filter.q}”.`;
  return filter.status === "closed" ? "No closed tickets." : "No open tickets.";
};

export async function TicketsView({
  scope,
  slug,
  organization,
  filter,
}: {
  scope: TicketScope;
  slug: string;
  organization: { name: string };
  filter: TicketFilter;
}) {
  const result = await listTickets(scope, filter);
  if (filter.page > result.pageCount) {
    redirect(ticketsHref(slug, { ...filter, page: result.pageCount }) as Route);
  }
  const empty = result.total === 0 && !filter.q && !(await hasTickets(scope));

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Tickets</h1>
        <p className="text-[15px] text-muted-foreground">
          Requests and questions from your team in {organization.name}.
        </p>
      </div>
      {empty ? null : <NewTicketLink slug={slug} filter={filter} label="New ticket" />}
    </div>
  );

  if (empty) {
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        {header}
        <EmptyState slug={slug} organization={organization.name} />
      </div>
    );
  }

  const terms = searchTerms(filter.q);
  const now = new Date();

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      {header}
      <TicketFilters action={ticketsHref(slug)} filter={filter} />
      {filter.q ? (
        <p className="text-[13px] text-muted-foreground">
          <strong className="text-foreground">
            {result.total} {result.total === 1 ? "result" : "results"}
          </strong>{" "}
          for &ldquo;{filter.q}&rdquo;
        </p>
      ) : null}
      <section
        aria-label="Tickets"
        className="overflow-hidden rounded-[14px] border border-input bg-background"
      >
        {result.tickets.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">{emptyMessage(filter)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Ticket</Th>
                  <Th className="w-[110px]">Status</Th>
                  <Th className="w-[210px]">Created by</Th>
                  <Th className="w-[110px]">Created</Th>
                  <Th className="w-16">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {result.tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    href={ticketsHref(slug, filter, `/${ticket.id}`) as Route}
                    terms={terms}
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/8 px-4 py-3">
            <span className="text-[13px] text-muted-foreground">
              Showing {result.tickets.length} of {result.total} {filter.q ? "results" : "tickets"}
            </span>
            {result.pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <span className="mr-1 text-[13px] text-muted-foreground">
                  Page {filter.page} of {result.pageCount}
                </span>
                <PageLink
                  slug={slug}
                  filter={filter}
                  page={filter.page - 1}
                  disabled={filter.page <= 1}
                >
                  Previous
                </PageLink>
                <PageLink
                  slug={slug}
                  filter={filter}
                  page={filter.page + 1}
                  disabled={filter.page >= result.pageCount}
                >
                  Next
                </PageLink>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
