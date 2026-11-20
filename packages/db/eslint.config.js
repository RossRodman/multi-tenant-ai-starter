import { defineConfig, globalIgnores } from "eslint/config";

import config from "@repo/config/eslint/package";

export default defineConfig(globalIgnores(["src/database.types.ts"]), config);
