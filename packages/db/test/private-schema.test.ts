import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "./env";

describe("private schema", () => {
  const db = new pg.Client({ connectionString: env.dbUrl });

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("exists", async () => {
    const { rowCount } = await db.query("select 1 from pg_namespace where nspname = 'private'");
    expect(rowCount).toBe(1);
  });

  it.each(["anon", "authenticated"])("grants no usage to %s", async (role) => {
    const { rows } = await db.query<{ usage: boolean }>(
      "select has_schema_privilege($1, 'private', 'usage') as usage",
      [role],
    );
    expect(rows[0]?.usage).toBe(false);
  });

  it("grants no usage to PUBLIC", async () => {
    const { rowCount } = await db.query(
      `select 1
       from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
       where n.nspname = 'private' and a.grantee = 0`,
    );
    expect(rowCount).toBe(0);
  });

  it("is not reachable through the Data API", async () => {
    const client = createClient(env.url, env.publishableKey);
    const { data, error } = await client
      .schema("private" as "public")
      .from("anything")
      .select();
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST106");
  });
});
