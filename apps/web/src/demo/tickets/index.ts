import "server-only";

export { ticketScope } from "./scope";
export {
  PAGE_SIZE,
  createTicket,
  deleteTicket,
  getTicket,
  hasTickets,
  listTickets,
  updateTicket,
} from "./tickets";
export type { Ticket, TicketAuthor, TicketResult, TicketScope } from "./tickets";
