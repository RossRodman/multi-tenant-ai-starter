"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { QUERY_MAX } from "../schemas";
import type { TicketFilter } from "../schemas";

export function TicketFilters({ action, filter }: { action: string; filter: TicketFilter }) {
  return (
    <form action={action} role="search" className="flex flex-wrap items-center gap-3">
      <div className="max-w-[380px] flex-[1_1_260px]">
        <label htmlFor="ticket-search" className="sr-only">
          Search tickets
        </label>
        <Input
          id="ticket-search"
          type="search"
          name="q"
          maxLength={QUERY_MAX}
          placeholder="Search title and text"
          defaultValue={filter.q}
        />
      </div>
      <label htmlFor="ticket-status" className="sr-only">
        Status
      </label>
      <NativeSelect
        id="ticket-status"
        name="status"
        defaultValue={filter.status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-[170px]"
      >
        <option value="all">All statuses</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
      </NativeSelect>
    </form>
  );
}
