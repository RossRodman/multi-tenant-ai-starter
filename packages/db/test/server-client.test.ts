import { describe, expect, it } from "vitest";

import { createServerClient } from "../src";
import { env } from "./env";

interface Cookie {
  name: string;
  value: string;
}

function memoryCookies(initial: Cookie[] = []) {
  const jar = new Map(initial.map((c) => [c.name, c.value]));
  return {
    jar,
    adapter: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies: Cookie[]) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  };
}

const options = { url: env.url, key: env.publishableKey };

describe("createServerClient", () => {
  it("persists the session through the cookie adapter", async () => {
    const first = memoryCookies();
    const client = createServerClient({ ...options, cookies: first.adapter });

    const email = `cookie-seam-${crypto.randomUUID()}@example.com`;
    const { data, error } = await client.auth.signUp({
      email,
      password: "correct-horse-battery",
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(first.jar.size).toBeGreaterThan(0);

    const second = memoryCookies(first.adapter.getAll());
    const restored = createServerClient({
      ...options,
      cookies: second.adapter,
    });
    const { data: user } = await restored.auth.getUser();
    expect(user.user?.id).toBe(data.user?.id);
    expect(user.user?.email).toBe(email);
  });

  it("returns no user without cookies", async () => {
    const client = createServerClient({
      ...options,
      cookies: memoryCookies().adapter,
    });
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });
});
