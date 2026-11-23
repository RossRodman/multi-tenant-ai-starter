import { describe, expect, it } from "vitest";

import { safeNext } from "../src/server/auth";

describe("safeNext", () => {
  it.each([
    ["/app", "/app"],
    ["/app/tickets?status=open", "/app/tickets?status=open"],
    ["/o/acme#top", "/o/acme#top"],
  ])("keeps %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "http://evil.com/app",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
    "javascript:alert(1)",
    "evil.com",
    "app",
    "",
    "   ",
  ])("falls back for %j", (input) => {
    expect(safeNext(input)).toBe("/app");
  });

  it("falls back for missing values", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
  });
});
