import { existsSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const rootEnv = path.join(monorepoRoot, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  typedRoutes: true,
  agentRules: false,
  headers: () =>
    Promise.resolve([
      {
        source: "/auth/confirm",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ]),
};

export default nextConfig;
