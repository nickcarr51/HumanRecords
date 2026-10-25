import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Outside src/lib/db and src/lib/services: no Drizzle client, and no asSystem
  // (admin access, RLS bypassed).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", "src/lib/services/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["@/lib/db/client", "**/db/client"], allowTypeImports: true,
          message: "Use asUser (runs the query as the signed-in user, so RLS applies) or a service; only src/lib/db uses the Drizzle client directly." },
        { group: ["@/lib/db/system", "**/db/system"],
          message: "asSystem bypasses RLS; only src/lib/services may call it." },
      ] }],
    },
  },
  // Services may use asSystem (admin access, only after authorize() has
  // confirmed permission) but not the raw client.
  {
    files: ["src/lib/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["@/lib/db/client", "**/db/client"], allowTypeImports: true,
          message: "Go through asUser or asSystem." },
      ] }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".claude/worktrees/**",
      "src/lib/db/generated/**",
    ],
  },
];

export default eslintConfig;
