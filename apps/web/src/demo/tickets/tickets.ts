import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Client, MembershipRole } from "@repo/db";

import { canManage } from "@/lib/roles";
import { listMembers } from "@/server/members";

import type { TicketFilter, TicketInput, TicketPatch, TicketStatus } from "./schemas";

export interface TicketScope {
  client: Client;
  organizationId: string;
  userId: string;
  role: MembershipRole;
}

export interface Ticket {
  id: string;
  title: string;
  body: string;
  status: TicketStatus;
  author: TicketAuthor | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  canManage: boolean;
}

export interface TicketAuthor {
  name: string | null;
  email: string;
}

export type TicketResult = { ok: true } | { ok: false; error: "not_found" | "unknown" };

export const PAGE_SIZE = 20;

const COLUMNS = "id, title, body, status, created_by, created_at, updated_at, closed_at";
const RANGE_NOT_SATISFIABLE = "PGRST103";

const ticketId = z.uuid();

interface Row {
  id: string;
  title: string;
  body: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

const authorsOf = cache(async (client: Client, organizationId: string) => {
  const members = await listMembers(client, organizationId);
  return new Map<string, TicketAuthor>(
    members.map((member) => [member.userId, { name: member.name, email: member.email }]),
  );
});

const authorNames = (scope: TicketScope) => authorsOf(scope.client, scope.organizationId);

function toTicket(scope: TicketScope, authors: Map<string, TicketAuthor>, row: Row): Ticket {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as TicketStatus,
    author: row.created_by ? (authors.get(row.created_by) ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    canManage: canManage(scope.role) || row.created_by === scope.userId,
  };
}

function matching(scope: TicketScope, filter: TicketFilter, head = false) {
  let query = scope.client
    .from("tickets")
    .select(COLUMNS, { count: "exact", head })
    .eq("organization_id", scope.organizationId);
  if (filter.status !== "all") query = query.eq("status", filter.status);
  if (filter.q) {
    query = query.textSearch("search", filter.q, { type: "websearch", config: "english" });
  }
  return query;
}

export async function listTickets(scope: TicketScope, filter: TicketFilter) {
  const from = (filter.page - 1) * PAGE_SIZE;
  const page = matching(scope, filter)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  const [{ data, count, error }, authors] = await Promise.all([page, authorNames(scope)]);
  let total = count ?? 0;
  if (error?.code === RANGE_NOT_SATISFIABLE) {
    const counted = await matching(scope, filter, true);
    if (counted.error) throw new Error("Could not count tickets", { cause: counted.error });
    total = counted.count ?? 0;
  } else if (error) {
    throw new Error("Could not list tickets", { cause: error });
  }
  return {
    tickets: (data ?? []).map((row) => toTicket(scope, authors, row)),
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function hasTickets(scope: TicketScope) {
  const { data, error } = await scope.client
    .from("tickets")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .limit(1);
  if (error) throw new Error("Could not check for tickets", { cause: error });
  return data.length > 0;
}

export async function getTicket(scope: TicketScope, id: string): Promise<Ticket | null> {
  if (!ticketId.safeParse(id).success) return null;
  const [{ data, error }, authors] = await Promise.all([
    scope.client
      .from("tickets")
      .select(COLUMNS)
      .eq("organization_id", scope.organizationId)
      .eq("id", id)
      .maybeSingle(),
    authorNames(scope),
  ]);
  if (error) throw new Error("Could not load the ticket", { cause: error });
  return data ? toTicket(scope, authors, data) : null;
}

function unexpected(error: { code: string; message: string }) {
  console.error("Unexpected ticket error", { code: error.code, message: error.message });
  return { ok: false, error: "unknown" } as const;
}

function outcome(
  rows: unknown[] | null,
  error: { code: string; message: string } | null,
): TicketResult {
  if (error) return unexpected(error);
  return rows?.length ? { ok: true } : { ok: false, error: "not_found" };
}

export async function createTicket(
  scope: TicketScope,
  input: TicketInput,
): Promise<{ ok: true; id: string } | { ok: false; error: "unknown" }> {
  const { data, error } = await scope.client
    .from("tickets")
    .insert({ organization_id: scope.organizationId, title: input.title, body: input.body })
    .select("id")
    .single();
  return error ? unexpected(error) : { ok: true, id: data.id };
}

export async function updateTicket(
  scope: TicketScope,
  id: string,
  patch: TicketPatch,
): Promise<TicketResult> {
  if (!ticketId.safeParse(id).success) return { ok: false, error: "not_found" };
  const { data, error } = await scope.client
    .from("tickets")
    .update(patch)
    .eq("organization_id", scope.organizationId)
    .eq("id", id)
    .select("id");
  return outcome(data, error);
}

export async function deleteTicket(scope: TicketScope, id: string): Promise<TicketResult> {
  if (!ticketId.safeParse(id).success) return { ok: false, error: "not_found" };
  const { data, error } = await scope.client
    .from("tickets")
    .delete()
    .eq("organization_id", scope.organizationId)
    .eq("id", id)
    .select("id");
  return outcome(data, error);
}
