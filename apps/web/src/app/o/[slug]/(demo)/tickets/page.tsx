import { TicketsView } from "@/demo/tickets/components/tickets-view";
import { loadTicketsPage } from "@/demo/tickets/load";
import type { TicketsPageProps } from "@/demo/tickets/load";

export default async function TicketsPage(props: TicketsPageProps) {
  const { scope, organization, slug, filter } = await loadTicketsPage(props);
  return <TicketsView scope={scope} slug={slug} organization={organization} filter={filter} />;
}
