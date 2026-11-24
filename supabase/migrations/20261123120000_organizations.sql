create type public.membership_role as enum ('owner', 'admin', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (
      char_length(name) between 1 and 80
      and name !~ '^\s|\s$'
      and name !~ '[[:cntrl:]]'
    ),
  slug text not null unique
    check (char_length(slug) between 3 and 48 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

create function private.member_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = (select auth.uid())
$$;

revoke execute on function private.member_organization_ids() from public;
grant execute on function private.member_organization_ids() to authenticated;

create function private.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'organizations can only be created by a signed-in user';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (new.id, (select auth.uid()), 'owner');

  return null;
end
$$;

revoke execute on function private.add_creator_as_owner() from public;

create trigger add_creator_as_owner
  after insert on public.organizations
  for each row execute function private.add_creator_as_owner();

create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select private.member_organization_ids()));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (true);

create policy memberships_select on public.memberships
  for select to authenticated
  using (organization_id in (select private.member_organization_ids()));

grant select on public.organizations, public.memberships to authenticated;
grant insert (name, slug) on public.organizations to authenticated;
