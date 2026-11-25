import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
    SUPABASE_DB_URL: z.url(),
  })
  .safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Missing Supabase test env (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}). ` +
      "Start the stack with `yarn db:start` and copy `.env.example` to .env and replace the Supabase lines with the output of `yarn db:env`.",
  );
}

export const env = {
  url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  secretKey: parsed.data.SUPABASE_SECRET_KEY,
  dbUrl: parsed.data.SUPABASE_DB_URL,
};
