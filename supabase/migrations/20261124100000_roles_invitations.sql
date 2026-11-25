create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  email text not null
    check (
      char_length(email) <= 320
      and email = lower(email)
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
    ),
  role public.membership_role not null,
  invited_by uuid default auth.uid() references auth.users on delete set null,
  invited_by_email text not null default auth.email(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

create unique index invitations_pending_email_idx
  on public.invitations (organization_id, email)
  where accepted_at is null;

create index invitations_email_pending_idx
  on public.invitations (email)
  where accepted_at is null;

create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_invited_by_idx on public.invitations (invited_by);

alter table public.invitations enable row level security;

create function private.organization_ids_with_role(roles public.membership_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.role = any (roles)
$$;

revoke execute on function private.organization_ids_with_role(public.membership_role[]) from public;
grant execute on function private.organization_ids_with_role(public.membership_role[]) to authenticated;

create function private.invited_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.organization_id
  from public.invitations i
  where i.email = lower((select auth.email()))
    and i.accepted_at is null
    and i.expires_at > now()
$$;

revoke execute on function private.invited_organization_ids() from public;
grant execute on function private.invited_organization_ids() to authenticated;

drop policy organizations_select on public.organizations;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    id in (select private.member_organization_ids())
    or id in (select private.invited_organization_ids())
  );

create policy organizations_update on public.organizations
  for update to authenticated
  using (id in (select private.organization_ids_with_role('{owner,admin}')))
  with check (id in (select private.organization_ids_with_role('{owner,admin}')));

grant update (name, slug) on public.organizations to authenticated;

create policy memberships_update on public.memberships
  for update to authenticated
  using (
    organization_id in (select private.organization_ids_with_role('{owner}'))
    or (
      organization_id in (select private.organization_ids_with_role('{admin}'))
      and role <> 'owner'
    )
  )
  with check (
    organization_id in (select private.organization_ids_with_role('{owner}'))
    or (
      organization_id in (select private.organization_ids_with_role('{admin}'))
      and role <> 'owner'
    )
  );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id in (select private.organization_ids_with_role('{owner}'))
    or (
      organization_id in (select private.organization_ids_with_role('{admin}'))
      and role <> 'owner'
    )
  );

grant update (role), delete on public.memberships to authenticated;

create function private.keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    perform 1 from public.organizations o where o.id = old.organization_id for no key update;

    if found and not exists (
      select 1
      from public.memberships m
      where m.organization_id = old.organization_id
        and m.role = 'owner'
        and m.user_id <> old.user_id
    ) then
      raise exception 'an organization needs at least one owner' using errcode = 'OW001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke execute on function private.keep_an_owner() from public;

create trigger keep_an_owner
  before update of role or delete on public.memberships
  for each row execute function private.keep_an_owner();

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    organization_id in (select private.organization_ids_with_role('{owner,admin}'))
    or (
      email = lower((select auth.email()))
      and accepted_at is null
      and expires_at > now()
    )
  );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    organization_id in (select private.organization_ids_with_role('{owner}'))
    or (
      organization_id in (select private.organization_ids_with_role('{admin}'))
      and role <> 'owner'
    )
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    organization_id in (select private.organization_ids_with_role('{owner}'))
    or (
      organization_id in (select private.organization_ids_with_role('{admin}'))
      and role <> 'owner'
    )
  );

grant select, delete on public.invitations to authenticated;
grant insert (organization_id, email, role) on public.invitations to authenticated;

create function private.accept_invitation(invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  invitation public.invitations;
begin
  if caller is null then
    raise exception 'invitation not available' using errcode = 'IV001';
  end if;

  select i.* into invitation
  from public.invitations i
  where i.id = invitation_id
    and i.email = lower((select auth.email()))
    and i.accepted_at is null
    and i.expires_at > now()
    and exists (
      select 1
      from auth.users u
      where u.id = caller
        and u.email_confirmed_at is not null
        and lower(u.email) = i.email
    )
  for update of i;

  if not found then
    raise exception 'invitation not available' using errcode = 'IV001';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (invitation.organization_id, caller, invitation.role)
  on conflict do nothing;

  update public.invitations set accepted_at = now() where id = invitation.id;

  return (select o.slug from public.organizations o where o.id = invitation.organization_id);
end
$$;

revoke execute on function private.accept_invitation(uuid) from public;
grant execute on function private.accept_invitation(uuid) to authenticated;

create function public.accept_invitation(invitation_id uuid)
returns text
language sql
security invoker
set search_path = ''
begin atomic
  select private.accept_invitation(invitation_id);
end;

revoke execute on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

create function private.organization_members(organization_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.membership_role,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    u.email::text,
    left(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), 80),
    m.role,
    m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = organization_members.organization_id
    and m.organization_id in (select private.member_organization_ids())
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    u.email
$$;

revoke execute on function private.organization_members(uuid) from public;
grant execute on function private.organization_members(uuid) to authenticated;

create function public.organization_members(organization_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.membership_role,
  joined_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
begin atomic
  select * from private.organization_members(organization_members.organization_id);
end;

revoke execute on function public.organization_members(uuid) from public;
grant execute on function public.organization_members(uuid) to authenticated;
