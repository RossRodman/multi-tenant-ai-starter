import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTicket } from "@/demo/tickets";
import type { Ticket } from "@/demo/tickets";
import { Icon } from "@/demo/tickets/components/icon";
import { StatusPill } from "@/demo/tickets/components/status-pill";
import { TicketDialog } from "@/demo/tickets/components/ticket-dialog";
import { TEXTAREA } from "@/demo/tickets/components/styles";
import { DeleteButton, StatusButton, TicketForm } from "@/demo/tickets/components/ticket-form";
import { TicketsView } from "@/demo/tickets/components/tickets-view";
import { authorLabel, shortDate } from "@/demo/tickets/format";
import { loadTicketsPage } from "@/demo/tickets/load";
import type { TicketsPageProps } from "@/demo/tickets/load";
import { filterParams, ticketsHref } from "@/demo/tickets/paths";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { deleteTicketAction, setTicketStatusAction, updateTicketAction } from "../actions";

const READ_ONLY = "bg-foreground/[0.035] text-muted-foreground";

function Meta({ ticket }: { ticket: Ticket }) {
  const now = new Date();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
      <span>
        Created by <strong className="text-foreground">{authorLabel(ticket.author)}</strong>
      </span>
      <span>
        Created {shortDate(ticket.createdAt, now)} · Updated {shortDate(ticket.updatedAt, now)}
        {ticket.closedAt ? ` · Closed ${shortDate(ticket.closedAt, now)}` : ""}
      </span>
    </div>
  );
}

function ReadOnlyTicket({ ticket, closeHref }: { ticket: Ticket; closeHref: string }) {
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-[10px] bg-foreground/[0.035] px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
        <Icon>
          <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
          <path d="M7 9V6.5a3 3 0 016 0V9" />
        </Icon>
        Only the author, Admins and Owners can edit this ticket.
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-title">Title</Label>
          <Input id="ticket-title" readOnly value={ticket.title} className={READ_ONLY} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-body">Description</Label>
          <textarea
            id="ticket-body"
            readOnly
            rows={5}
            value={ticket.body}
            className={cn(TEXTAREA, READ_ONLY)}
          />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-sm font-medium">Status</span>
          <StatusPill status={ticket.status} />
        </div>
      </div>
      <Meta ticket={ticket} />
      <div className="flex justify-end">
        <Link
          href={closeHref as Route}
          scroll={false}
          className={cn(buttonVariants({ variant: "outline" }), "w-auto px-4")}
        >
          Back to tickets
        </Link>
      </div>
    </>
  );
}

export default async function TicketPage(
  props: TicketsPageProps & { params: Promise<{ slug: string; id: string }> },
) {
  const { scope, organization, slug, filter } = await loadTicketsPage(props);
  const { id } = await props.params;
  const ticket = await getTicket(scope, id);
  if (!ticket) notFound();

  const closeHref = ticketsHref(slug, filter);
  const fields = { slug, id: ticket.id, query: filterParams(filter) };

  return (
    <>
      <TicketsView scope={scope} slug={slug} organization={organization} filter={filter} />
      {ticket.canManage ? (
        <TicketDialog
          title="Edit ticket"
          description={
            scope.role === "member"
              ? "You created this ticket, so you can edit it."
              : `As an ${roleLabel(scope.role)}, you can edit any ticket.`
          }
          closeHref={closeHref}
        >
          <TicketForm
            action={updateTicketAction}
            fields={fields}
            closeHref={closeHref}
            ticket={ticket}
            submitLabel="Save changes"
            note={<Meta ticket={ticket} />}
            secondary={
              <>
                <StatusButton
                  action={setTicketStatusAction}
                  fields={fields}
                  status={ticket.status}
                />
                <DeleteButton action={deleteTicketAction} fields={fields} title={ticket.title} />
              </>
            }
          />
        </TicketDialog>
      ) : (
        <TicketDialog title="Ticket" description="Read-only for your role." closeHref={closeHref}>
          <ReadOnlyTicket ticket={ticket} closeHref={closeHref} />
        </TicketDialog>
      )}
    </>
  );
}
