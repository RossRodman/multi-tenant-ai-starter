import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createBrowserClient } from "../src";
import type { Client, Database } from "../src";
import { env } from "./env";

describe("createBrowserClient", () => {
  const client = createBrowserClient({
    url: env.url,
    key: env.publishableKey,
  });

  it("is typed with Database", () => {
    expectTypeOf(client).toEqualTypeOf<Client>();
    expectTypeOf<Client>().toEqualTypeOf<SupabaseClient<Database>>();
  });

  it("talks to the local auth endpoint", async () => {
    const { data, error } = await client.auth.getSession();
    expect(error).toBeNull();
    expect(data.session).toBeNull();

    const { error: signInError } = await client.auth.signInWithPassword({
      email: `nobody-${crypto.randomUUID()}@example.com`,
      password: "wrong-password",
    });
    expect(signInError?.status).toBe(400);
  });
});
