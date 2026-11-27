create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  body text not null default '' check (char_length(body) <= 10000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  search tsvector generated always as (to_tsvector('english'::regconfig, title || ' ' || body)) stored,
  check ((status = 'closed') = (closed_at is not null))
);

create index tickets_organization_status_created_idx
  on public.tickets (organization_id, status, created_at desc);
create index tickets_organization_created_idx on public.tickets (organization_id, created_at desc);
create index tickets_created_by_idx on public.tickets (created_by);
create index tickets_search_idx on public.tickets using gin (search);

create function private.touch_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.closed_at := case when new.status = 'closed' then now() end;
  end if;
  return new;
end;
$$;

revoke execute on function private.touch_ticket() from public;

create trigger touch_ticket
  before update of title, body, status on public.tickets
  for each row execute function private.touch_ticket();

alter table public.tickets enable row level security;

create policy tickets_select on public.tickets
  for select to authenticated
  using (organization_id in (select private.member_organization_ids()));

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    organization_id in (select private.member_organization_ids())
    and created_by = (select auth.uid())
  );

create policy tickets_update on public.tickets
  for update to authenticated
  using (
    organization_id in (select private.organization_ids_with_role('{owner,admin}'))
    or (
      organization_id in (select private.member_organization_ids())
      and created_by = (select auth.uid())
    )
  );

create policy tickets_delete on public.tickets
  for delete to authenticated
  using (
    organization_id in (select private.organization_ids_with_role('{owner,admin}'))
    or (
      organization_id in (select private.member_organization_ids())
      and created_by = (select auth.uid())
    )
  );

grant select, delete on public.tickets to authenticated;
grant insert (organization_id, title, body) on public.tickets to authenticated;
grant update (title, body, status) on public.tickets to authenticated;
