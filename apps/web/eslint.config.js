import { defineConfig } from "eslint/config";

import next from "@repo/config/eslint/next";

export default defineConfig(
  next,
  { rules: { "react/no-danger": "error" } },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/demo/**", "test/demo/**", "src/app/o/*/(demo)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/demo", "@/demo/**", "**/demo", "**/demo/**", "**/(demo)", "**/(demo)/**"],
              message: "The core must not depend on the demo module.",
            },
          ],
        },
      ],
    },
  },
);
