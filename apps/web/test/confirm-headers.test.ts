import { expect, it } from "vitest";

import nextConfig from "../next.config";

it("serves /auth/confirm without a cross-site referrer and without caching", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((entry) => entry.source === "/auth/confirm");
  expect(rule?.headers).toEqual(
    expect.arrayContaining([
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Cache-Control", value: "no-store" },
    ]),
  );
});
