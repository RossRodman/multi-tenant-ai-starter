import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverDir = resolve(import.meta.dirname, "../src/server");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("src/server", () => {
  it.each(sourceFiles(serverDir).map((file) => [file.slice(serverDir.length + 1), file]))(
    "%s imports server-only",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toMatch(/^import "server-only";$/m);
    },
  );
});
