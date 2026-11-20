import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "./env";

const roles = ["anon", "authenticated"] as const;

describe("default privileges in public", () => {
  const db = new pg.Client({ connectionString: env.dbUrl });

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("leave new tables, sequences and functions closed to anon and authenticated", async () => {
    await db.query("begin");
    try {
      await db.query("create table public.privilege_probe (id int)");
      await db.query("create sequence public.privilege_probe_seq");
      await db.query(
        "create function public.privilege_probe_fn() returns int language sql as 'select 1'",
      );

      for (const role of roles) {
        const { rows } = await db.query<{
          tbl: boolean;
          seq: boolean;
          fn: boolean;
        }>(
          `select
             has_table_privilege($1, 'public.privilege_probe', 'select,insert,update,delete,truncate,references,trigger') as tbl,
             has_sequence_privilege($1, 'public.privilege_probe_seq', 'usage,select,update') as seq,
             has_function_privilege($1, 'public.privilege_probe_fn()', 'execute') as fn`,
          [role],
        );
        expect(rows[0], role).toEqual({ tbl: false, seq: false, fn: false });
      }
    } finally {
      await db.query("rollback");
    }
  });

  it("revokes execute on new functions from public", async () => {
    await db.query("begin");
    try {
      await db.query(
        "create function public.privilege_probe_fn() returns int language sql as 'select 1'",
      );
      const { rowCount } = await db.query(
        `select 1
         from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where p.oid = 'public.privilege_probe_fn()'::regprocedure and a.grantee = 0`,
      );
      expect(rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});
