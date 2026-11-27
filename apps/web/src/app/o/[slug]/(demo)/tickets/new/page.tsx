import { TicketsView } from "@/demo/tickets/components/tickets-view";
import { TicketDialog } from "@/demo/tickets/components/ticket-dialog";
import { TicketForm } from "@/demo/tickets/components/ticket-form";
import { loadTicketsPage } from "@/demo/tickets/load";
import type { TicketsPageProps } from "@/demo/tickets/load";
import { filterParams, ticketsHref } from "@/demo/tickets/paths";

import { createTicketAction } from "../actions";

export default async function NewTicketPage(props: TicketsPageProps) {
  const { scope, organization, slug, filter } = await loadTicketsPage(props);
  const closeHref = ticketsHref(slug, filter);

  return (
    <>
      <TicketsView scope={scope} slug={slug} organization={organization} filter={filter} />
      <TicketDialog
        title="New ticket"
        description={`Everyone in ${organization.name} can see this ticket.`}
        closeHref={closeHref}
      >
        <TicketForm
          action={createTicketAction}
          fields={{ slug, query: filterParams(filter) }}
          closeHref={closeHref}
          submitLabel="Create ticket"
          note={
            <p className="text-[13px] text-muted-foreground">
              New tickets start as Open. You will be shown as the creator.
            </p>
          }
        />
      </TicketDialog>
    </>
  );
}
