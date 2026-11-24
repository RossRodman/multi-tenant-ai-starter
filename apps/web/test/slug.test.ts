import { describe, expect, it } from "vitest";

import { SLUG_MAX, SLUG_PATTERN, toSlug } from "../src/lib/slug";

describe("toSlug", () => {
  it.each([
    ["Acme", "acme"],
    ["Acme Inc.", "acme-inc"],
    ["  Acme   Inc  ", "acme-inc"],
    ["Café Münster", "cafe-munster"],
    ["Straße", "stra-e"],
    ["København", "k-benhavn"],
    ["Łódź", "odz"],
    ["Bob's", "bob-s"],
    ["Ａｃｍｅ", "acme"],
    ["ℌello", "hello"],
    ["Привіт", ""],
    ["Привіт Acme", "acme"],
    ["🚀🚀", ""],
    ["Acme 🚀 Labs", "acme-labs"],
    ["a --- b", "a-b"],
    ["!!!Acme???", "acme"],
    ["R&D", "r-d"],
  ])("%j becomes %j", (name, slug) => {
    expect(toSlug(name)).toBe(slug);
  });

  it("returns strings shorter than the minimum as they are", () => {
    expect(toSlug("Ab")).toBe("ab");
    expect(toSlug("")).toBe("");
  });

  it("cuts a long name on a separator without leaving a trailing dash", () => {
    const name = `${"a".repeat(47)} bcd`;
    const slug = toSlug(name);
    expect(slug).toBe("a".repeat(47));

    const long = "word ".repeat(30);
    const result = toSlug(long);
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(result).toMatch(SLUG_PATTERN);
  });
});
