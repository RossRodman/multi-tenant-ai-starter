import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";

import base from "./base.js";

export default defineConfig(globalIgnores(["next-env.d.ts"]), nextVitals, base);
