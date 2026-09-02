import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Layering: lib/ is the bottom. It is imported by app/ and components/ and
  // must not import from them — a type it needs from a component belongs in
  // lib (lib/community/cardTypes.ts is the precedent). Without the rule the
  // one such edge sat unnoticed for a month.
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "@/app/*"],
              message:
                "lib/ must not depend on components/ or app/ — move the shared type or helper into lib/.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
