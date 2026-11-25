import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createStripe } from "./stripe";
import { seedStripe } from "./seed";
import { seedKey } from "./seed-key";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

let key: string;
try {
  key = seedKey(process.env.STRIPE_SECRET_KEY, process.argv.includes("--live"));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const report = await seedStripe(createStripe(key));
console.log(JSON.stringify(report, null, 2));
