import { z } from "zod";

export const TITLE_MAX = 200;
export const BODY_MAX = 10_000;
export const QUERY_MAX = 200;

const TICKET_STATUSES = ["open", "closed"] as const;

export const ticketStatus = z.enum(TICKET_STATUSES);

const title = z.string().trim().min(1).max(TITLE_MAX);
const body = z
  .string()
  .transform((value) => value.replaceAll("\r\n", "\n"))
  .pipe(z.string().max(BODY_MAX));

export const ticketInput = z.object({ title, body });

export const ticketPatch = z
  .object({ title: title.optional(), body: body.optional(), status: ticketStatus.optional() })
  .refine((patch) => Object.keys(patch).length > 0);

export const ticketFilter = z.object({
  q: z.string().trim().max(QUERY_MAX).catch(""),
  status: z.enum([...TICKET_STATUSES, "all"]).catch("open"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type TicketStatus = z.infer<typeof ticketStatus>;
export type TicketInput = z.infer<typeof ticketInput>;
export type TicketPatch = z.infer<typeof ticketPatch>;
export type TicketFilter = z.infer<typeof ticketFilter>;
