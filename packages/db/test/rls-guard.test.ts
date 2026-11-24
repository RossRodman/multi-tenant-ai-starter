import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "./env";

interface Violation {
  kind: string;
  object: string;
}

const ALLOWED_FUNCTION_OWNERS = [{ name: "graphql_public.graphql", owner: "supabase_admin" }];

const RELATION_PRIVILEGES = "select, insert, update, delete, truncate, references, trigger";
const COLUMN_PRIVILEGES = "select, insert, update, references";

const OBJECTS_CTE = `
with objects as (
  select
    c.oid,
    c.relkind::text as relkind,
    n.nspname || '.' || c.relname as name,
    pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity,
    c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any ($1)
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    )
),
roles(role) as (values ('anon'), ('authenticated'))
`;

const GUARD_QUERY = `${OBJECTS_CTE}
select 'rls_disabled' as kind, name as object
from objects
where relkind in ('r', 'p') and not relrowsecurity
union all
select 'view_without_security_invoker', name
from objects
where relkind = 'v'
  and not coalesce(
    (select option_value::boolean from pg_options_to_table(reloptions) where option_name = 'security_invoker'),
    false
  )
union all
select 'exposed_' || case relkind when 'm' then 'materialized_view' else 'foreign_table' end, name
from objects, roles
where relkind in ('m', 'f')
  and (
    has_table_privilege(roles.role, oid, '${RELATION_PRIVILEGES}')
    or has_any_column_privilege(roles.role, oid, '${COLUMN_PRIVILEGES}')
  )
union all
select 'anon_privilege', name
from objects
where (
    relkind in ('r', 'p', 'v', 'm', 'f')
    and (
      has_table_privilege('anon', oid, '${RELATION_PRIVILEGES}')
      or has_any_column_privilege('anon', oid, '${COLUMN_PRIVILEGES}')
    )
  )
  or (relkind = 'S' and has_sequence_privilege('anon', oid, 'usage, select, update'))
union all
select 'foreign_owner', name
from objects
where owner <> 'postgres'
union all
select 'security_definer_function', n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = any ($1)
  and p.prosecdef
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  )
union all
select 'anon_executable_function', n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = any ($1)
  and has_function_privilege('anon', p.oid, 'execute')
  and (n.nspname || '.' || p.proname, pg_get_userbyid(p.proowner)) not in (
    select * from unnest($2::text[], $3::text[])
  )
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  )
union all
select 'extension_in_exposed_schema', e.extname
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where n.nspname = any ($1)
union all
select 'foreign_owner', n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = any ($1)
  and pg_get_userbyid(p.proowner) <> 'postgres'
  and (n.nspname || '.' || p.proname, pg_get_userbyid(p.proowner)) not in (
    select * from unnest($2::text[], $3::text[])
  )
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  )
`;

function exposedSchemas() {
  const config = readFileSync(
    resolve(import.meta.dirname, "../../../supabase/config.toml"),
    "utf8",
  );
  const api = /^\[api\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(config)?.[1] ?? "";
  const list = /^schemas\s*=\s*\[([^\]]*)\]/m.exec(api)?.[1];
  if (!list) throw new Error("No [api] schemas in supabase/config.toml");
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("RLS guard", () => {
  const db = new pg.Client({ connectionString: env.dbUrl });
  const schemas = exposedSchemas();

  const violations = async () =>
    (
      await db.query<Violation>(GUARD_QUERY, [
        schemas,
        ALLOWED_FUNCTION_OWNERS.map(({ name }) => name),
        ALLOWED_FUNCTION_OWNERS.map(({ owner }) => owner),
      ])
    ).rows;

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("reads the exposed schemas from config.toml", () => {
    expect(schemas).toEqual(expect.arrayContaining(["public"]));
    expect(schemas).not.toContain("private");
  });

  it("passes on the real schema", async () => {
    expect(await violations()).toEqual([]);
  });

  it("sees the tenancy tables", async () => {
    const { rows } = await db.query<{ name: string }>(
      `${OBJECTS_CTE} select name from objects where relkind = 'r' and relrowsecurity`,
      [schemas],
    );
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(["public.organizations", "public.memberships"]),
    );
  });

  it("reports each kind of violation", async () => {
    await db.query("begin");
    try {
      await db.query("create table public.guard_no_rls (id int)");
      await db.query("create view public.guard_plain_view as select 1 as id");
      await db.query("create materialized view public.guard_matview as select 1 as id");
      await db.query("grant select on public.guard_matview to authenticated");
      await db.query(
        `create function public.guard_definer() returns int
         language sql security definer set search_path = '' as 'select 1'`,
      );
      await db.query("create table public.guard_column_grant (id int, secret int)");
      await db.query("alter table public.guard_column_grant enable row level security");
      await db.query("grant select (id) on public.guard_column_grant to anon");

      const found = (await violations()).filter((v) => v.object.startsWith("public.guard_"));
      expect(found).toEqual(
        expect.arrayContaining([
          { kind: "rls_disabled", object: "public.guard_no_rls" },
          { kind: "view_without_security_invoker", object: "public.guard_plain_view" },
          { kind: "exposed_materialized_view", object: "public.guard_matview" },
          { kind: "security_definer_function", object: "public.guard_definer" },
          { kind: "anon_privilege", object: "public.guard_column_grant" },
        ]),
      );
      expect(found).toHaveLength(5);
    } finally {
      await db.query("rollback");
    }
  });

  it("reports a foreign table granted to authenticated and an anon grant on a sequence", async () => {
    await db.query("begin");
    try {
      await db.query("create extension postgres_fdw with schema extensions");
      await db.query("create server guard_server foreign data wrapper postgres_fdw");
      await db.query("create foreign table public.guard_foreign (id int) server guard_server");
      await db.query("grant select on public.guard_foreign to authenticated");
      await db.query("create sequence public.guard_seq");
      await db.query("grant usage on sequence public.guard_seq to anon");

      const found = (await violations()).filter((v) => v.object.startsWith("public.guard_"));
      expect(found).toEqual(
        expect.arrayContaining([
          { kind: "exposed_foreign_table", object: "public.guard_foreign" },
          { kind: "anon_privilege", object: "public.guard_seq" },
        ]),
      );
    } finally {
      await db.query("rollback");
    }
  });

  it("reports a table granted to anon through PUBLIC", async () => {
    await db.query("begin");
    try {
      await db.query("create table public.guard_public_grant (id int)");
      await db.query("alter table public.guard_public_grant enable row level security");
      await db.query("grant select on public.guard_public_grant to public");

      expect(await violations()).toContainEqual({
        kind: "anon_privilege",
        object: "public.guard_public_grant",
      });
    } finally {
      await db.query("rollback");
    }
  });

  it("reports a function executable by anon", async () => {
    await db.query("begin");
    try {
      await db.query(
        `create function public.guard_anon_fn() returns int
         language sql security invoker set search_path = '' as 'select 1'`,
      );
      await db.query("grant execute on function public.guard_anon_fn() to anon");

      expect(await violations()).toContainEqual({
        kind: "anon_executable_function",
        object: "public.guard_anon_fn",
      });
    } finally {
      await db.query("rollback");
    }
  });

  it("reports an extension installed in an exposed schema", async () => {
    await db.query("begin");
    try {
      await db.query("create extension pg_trgm with schema public");

      expect(await violations()).toContainEqual({
        kind: "extension_in_exposed_schema",
        object: "pg_trgm",
      });
    } finally {
      await db.query("rollback");
    }
  });

  it("reports objects owned by another role", async () => {
    await db.query("begin");
    try {
      await db.query("create role guard_owner nologin");
      await db.query("grant create on schema public to guard_owner");
      await db.query("grant guard_owner to postgres with set true");
      await db.query("create table public.guard_foreign_owner (id int)");
      await db.query("alter table public.guard_foreign_owner enable row level security");
      await db.query("alter table public.guard_foreign_owner owner to guard_owner");

      expect(await violations()).toContainEqual({
        kind: "foreign_owner",
        object: "public.guard_foreign_owner",
      });
    } finally {
      await db.query("rollback");
    }
  });
});
