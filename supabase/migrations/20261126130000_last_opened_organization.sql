create table private.last_opened_organizations (
  user_id uuid primary key references auth.users on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  opened_at timestamptz not null default now()
);

create index last_opened_organizations_organization_id_idx
  on private.last_opened_organizations (organization_id);

alter table private.last_opened_organizations enable row level security;

create function private.mark_organization_opened(slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.last_opened_organizations (user_id, organization_id)
  select m.user_id, m.organization_id
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where o.slug = mark_organization_opened.slug
    and m.user_id = (select auth.uid())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id, opened_at = now()
$$;

revoke execute on function private.mark_organization_opened(text) from public;
grant execute on function private.mark_organization_opened(text) to authenticated;

create function public.mark_organization_opened(slug text)
returns void
language sql
security invoker
set search_path = ''
begin atomic
  select private.mark_organization_opened(slug);
end;

revoke execute on function public.mark_organization_opened(text) from public;
grant execute on function public.mark_organization_opened(text) to authenticated;

create function private.last_opened_organization()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.slug
  from private.last_opened_organizations l
  join public.memberships m on m.organization_id = l.organization_id and m.user_id = l.user_id
  join public.organizations o on o.id = l.organization_id
  where l.user_id = (select auth.uid())
$$;

revoke execute on function private.last_opened_organization() from public;
grant execute on function private.last_opened_organization() to authenticated;

create function public.last_opened_organization()
returns text
language sql
stable
security invoker
set search_path = ''
begin atomic
  select private.last_opened_organization();
end;

revoke execute on function public.last_opened_organization() from public;
grant execute on function public.last_opened_organization() to authenticated;
