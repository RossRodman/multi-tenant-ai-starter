create table private.plans (
  id text primary key,
  seat_limit integer check (seat_limit > 0),
  rank smallint not null unique
);

alter table private.plans enable row level security;

insert into private.plans (id, seat_limit, rank)
values ('free', 3, 0), ('pro', 10, 1), ('team', null, 2);

create table private.billing_customers (
  organization_id uuid primary key references public.organizations on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table private.billing_customers enable row level security;

create table public.subscriptions (
  id text primary key,
  organization_id uuid not null references public.organizations on delete cascade,
  plan text not null references private.plans,
  interval text not null check (interval in ('month', 'year')),
  status text not null
    check (
      status in (
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused'
      )
    ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_organization_id_idx on public.subscriptions (organization_id);
create index subscriptions_plan_idx on public.subscriptions (plan);

alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (organization_id in (select private.member_organization_ids()));

grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create function private.organization_plan(organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.id
      from public.subscriptions s
      join private.plans p on p.id = s.plan
      where s.organization_id = organization_plan.organization_id
        and s.status in ('active', 'trialing', 'past_due')
      order by p.rank desc
      limit 1
    ),
    'free'
  )
$$;

revoke execute on function private.organization_plan(uuid) from public;

create function private.organization_seat_limit(organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select p.seat_limit
  from private.plans p
  where p.id = private.organization_plan(organization_seat_limit.organization_id)
$$;

revoke execute on function private.organization_seat_limit(uuid) from public;

create function private.check_invitation_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_limit integer;
begin
  -- RLS rejects this row after the trigger; counting first would leak the seat usage.
  if (select auth.uid()) is not null and new.organization_id not in (
    select private.organization_ids_with_role('{owner,admin}')
  ) then
    return new;
  end if;

  perform 1 from public.organizations o where o.id = new.organization_id for no key update;

  seat_limit := private.organization_seat_limit(new.organization_id);

  if seat_limit is not null and (
    (select count(*) from public.memberships m where m.organization_id = new.organization_id)
    + (
      select count(*)
      from public.invitations i
      where i.organization_id = new.organization_id
        and i.accepted_at is null
        and i.expires_at > now()
        and i.email <> new.email
    )
  ) >= seat_limit then
    raise exception 'seat limit reached' using errcode = 'SL001';
  end if;

  return new;
end
$$;

revoke execute on function private.check_invitation_seat() from public;

create trigger check_invitation_seat
  before insert on public.invitations
  for each row execute function private.check_invitation_seat();

create function private.check_membership_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_limit integer;
begin
  perform 1 from public.organizations o where o.id = new.organization_id for no key update;

  if exists (
    select 1
    from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = new.user_id
  ) then
    return new;
  end if;

  seat_limit := private.organization_seat_limit(new.organization_id);

  if seat_limit is not null and (
    select count(*) from public.memberships m where m.organization_id = new.organization_id
  ) >= seat_limit then
    raise exception 'seat limit reached' using errcode = 'SL001';
  end if;

  return new;
end
$$;

revoke execute on function private.check_membership_seat() from public;

create trigger check_membership_seat
  before insert on public.memberships
  for each row execute function private.check_membership_seat();

create function private.billing_customer_for_organization(organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.stripe_customer_id
  from private.billing_customers c
  where c.organization_id = billing_customer_for_organization.organization_id
$$;

revoke execute on function private.billing_customer_for_organization(uuid) from public;

create function private.billing_organization_for_customer(stripe_customer_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.organization_id
  from private.billing_customers c
  where c.stripe_customer_id = billing_organization_for_customer.stripe_customer_id
$$;

revoke execute on function private.billing_organization_for_customer(text) from public;

create function private.link_billing_customer(organization_id uuid, stripe_customer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.billing_customers (organization_id, stripe_customer_id)
  values (link_billing_customer.organization_id, link_billing_customer.stripe_customer_id)
  on conflict do nothing;

  return (
    select c.stripe_customer_id
    from private.billing_customers c
    where c.organization_id = link_billing_customer.organization_id
  );
end
$$;

revoke execute on function private.link_billing_customer(uuid, text) from public;

create function public.billing_customer_for_organization(organization_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
begin atomic
  select private.billing_customer_for_organization(billing_customer_for_organization.organization_id);
end;

create function public.billing_organization_for_customer(stripe_customer_id text)
returns uuid
language sql
stable
security invoker
set search_path = ''
begin atomic
  select private.billing_organization_for_customer(billing_organization_for_customer.stripe_customer_id);
end;

create function public.link_billing_customer(organization_id uuid, stripe_customer_id text)
returns text
language sql
security invoker
set search_path = ''
begin atomic
  select private.link_billing_customer(link_billing_customer.organization_id, link_billing_customer.stripe_customer_id);
end;

revoke execute on function public.billing_customer_for_organization(uuid) from public;
revoke execute on function public.billing_organization_for_customer(text) from public;
revoke execute on function public.link_billing_customer(uuid, text) from public;

grant execute on function public.billing_customer_for_organization(uuid) to service_role;
grant execute on function public.billing_organization_for_customer(text) to service_role;
grant execute on function public.link_billing_customer(uuid, text) to service_role;

grant execute on function private.billing_customer_for_organization(uuid) to service_role;
grant execute on function private.billing_organization_for_customer(text) to service_role;
grant execute on function private.link_billing_customer(uuid, text) to service_role;

create function private.sync_subscription(subscription jsonb, fetched_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming public.subscriptions;
  written integer;
begin
  incoming := jsonb_populate_record(null::public.subscriptions, subscription);

  insert into public.subscriptions as s (
    id, organization_id, plan, interval, status,
    current_period_end, cancel_at_period_end, canceled_at, updated_at
  )
  values (
    incoming.id, incoming.organization_id, incoming.plan, incoming.interval, incoming.status,
    incoming.current_period_end, incoming.cancel_at_period_end, incoming.canceled_at, fetched_at
  )
  on conflict (id) do update
    set plan = excluded.plan,
        interval = excluded.interval,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        updated_at = excluded.updated_at
    where s.updated_at <= excluded.updated_at;

  get diagnostics written = row_count;
  return written > 0;
end
$$;

revoke execute on function private.sync_subscription(jsonb, timestamptz) from public;
grant execute on function private.sync_subscription(jsonb, timestamptz) to service_role;

create function public.sync_subscription(subscription jsonb, fetched_at timestamptz)
returns boolean
language sql
security invoker
set search_path = ''
begin atomic
  select private.sync_subscription(sync_subscription.subscription, sync_subscription.fetched_at);
end;

revoke execute on function public.sync_subscription(jsonb, timestamptz) from public;
grant execute on function public.sync_subscription(jsonb, timestamptz) to service_role;
