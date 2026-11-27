import { BODY_MAX, TITLE_MAX } from "./schemas";
import type { TicketStatus } from "./schemas";

export interface TicketFormState {
  error?: "unknown";
  fieldErrors?: { title?: string; body?: string };
  values?: { title: string; body: string; status?: TicketStatus };
}

export const ticketInitialState: TicketFormState = {};

export const ticketFieldMessages = {
  title: `Use 1 to ${String(TITLE_MAX)} characters.`,
  body: `Use up to ${BODY_MAX.toLocaleString("en")} characters.`,
};
