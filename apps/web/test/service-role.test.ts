import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = resolve(import.meta.dirname, "../src");
const ALLOWED = ["app/api/stripe/webhook/route.ts"];
const ALLOWED_DIRS = ["server/billing/", "server/supabase/service.ts"];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("service role client", () => {
  it("is imported only by the webhook route and server/billing", () => {
    const importers = files(srcDir)
      .map((file) => relative(srcDir, file))
      .filter((file) =>
        /supabase\/service["']|createServiceClient/.test(readFileSync(join(srcDir, file), "utf8")),
      )
      .filter(
        (file) => !ALLOWED.includes(file) && !ALLOWED_DIRS.some((dir) => file.startsWith(dir)),
      );
    expect(importers).toEqual([]);
  });
});
