import { describe, expect, expectTypeOf, it } from "vitest";

import { createSessionlessClient } from "../src";
import type { Client } from "../src";
import { env } from "./env";

describe("createSessionlessClient", () => {
  const client = createSessionlessClient({ url: env.url, key: env.publishableKey });

  it("is typed with Database", () => {
    expectTypeOf(client).toEqualTypeOf<Client>();
  });

  it("talks to the local auth endpoint without a session", async () => {
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();

    const { error } = await client.auth.signInWithPassword({
      email: `nobody-${crypto.randomUUID()}@example.com`,
      password: "wrong-password",
    });
    expect(error?.status).toBe(400);
  });
});
