import { defineConfig } from "eslint/config";

import base from "./base.js";

export default defineConfig(base, {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["next", "next/*", "server-only"],
            message: "Packages must stay framework-agnostic.",
          },
        ],
      },
    ],
  },
});
