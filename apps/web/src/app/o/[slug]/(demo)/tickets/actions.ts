"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { createTicket, deleteTicket, ticketScope, updateTicket } from "@/demo/tickets";
import type { TicketResult } from "@/demo/tickets";
import { ticketFieldMessages } from "@/demo/tickets/form-state";
import type { TicketFormState } from "@/demo/tickets/form-state";
import { parseFilter, ticketsHref } from "@/demo/tickets/paths";
import { ticketInput, ticketPatch, ticketStatus } from "@/demo/tickets/schemas";
import { text } from "@/lib/form";
import { isSlug } from "@/lib/slug";

const slugSchema = z.string().refine(isSlug);

async function context(formData: FormData) {
  const slug = slugSchema.safeParse(text(formData, "slug"));
  if (!slug.success) redirect("/app");
  const current = await ticketScope(slug.data);
  if (!current) notFound();
  const filter = parseFilter(Object.fromEntries(new URLSearchParams(text(formData, "query"))));
  return { ...current, slug: slug.data, filter };
}

function fieldErrors(error: z.ZodError): TicketFormState["fieldErrors"] {
  const paths = new Set(error.issues.map((issue) => issue.path[0]));
  return {
    title: paths.has("title") ? ticketFieldMessages.title : undefined,
    body: paths.has("body") ? ticketFieldMessages.body : undefined,
  };
}

function finish(slug: string, href: string): never {
  revalidatePath(`/o/${slug}/tickets`, "layout");
  redirect(href as Route);
}

function settle(result: TicketResult): TicketFormState | undefined {
  if (result.ok) return undefined;
  if (result.error === "not_found") notFound();
  return { error: "unknown" };
}

export async function createTicketAction(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const { scope, slug, filter } = await context(formData);
  const values = { title: text(formData, "title"), body: text(formData, "body") };
  const parsed = ticketInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const created = await createTicket(scope, parsed.data);
  if (!created.ok) return { error: "unknown", values };
  finish(slug, ticketsHref(slug, filter));
}

export async function updateTicketAction(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const { scope, slug, filter } = await context(formData);
  const status = ticketStatus.safeParse(text(formData, "status")).data;
  const values = { title: text(formData, "title"), body: text(formData, "body"), status };
  const parsed = ticketPatch.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const failed = settle(await updateTicket(scope, text(formData, "id"), parsed.data));
  if (failed) return { ...failed, values };
  finish(slug, ticketsHref(slug, filter));
}

export async function setTicketStatusAction(formData: FormData) {
  const { scope, slug, filter } = await context(formData);
  const status = ticketStatus.safeParse(text(formData, "status"));
  if (!status.success) notFound();

  const failed = settle(await updateTicket(scope, text(formData, "id"), { status: status.data }));
  if (failed) throw new Error("Could not change the ticket status");
  finish(slug, ticketsHref(slug, filter));
}

export async function deleteTicketAction(formData: FormData) {
  const { scope, slug, filter } = await context(formData);

  const failed = settle(await deleteTicket(scope, text(formData, "id")));
  if (failed) throw new Error("Could not delete the ticket");
  finish(slug, ticketsHref(slug, filter));
}
