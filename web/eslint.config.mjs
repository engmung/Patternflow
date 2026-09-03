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
  // The community's server side — SQLite, Drizzle, Better Auth, the filesystem
  // — is lib/community/server/. A client component that imports it pulls
  // better-sqlite3 into a browser bundle, which fails late and confusingly.
  // Components and *Client.tsx files may import its TYPES (erased at compile
  // time) and nothing else; a value they need crosses through an API route.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*Client.tsx", "src/lib/community/!(server)/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/community/server/*", "**/community/server/*"],
              allowTypeImports: true,
              message:
                "lib/community/server/ runs on the server only — reach it through an API route, or import just the type.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
