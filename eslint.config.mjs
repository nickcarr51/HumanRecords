import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Only src/lib/db may open a database connection: a direct connection logs in
// as `postgres`, which skips asUser and RLS.
const DRIVER_PATHS = [
  { name: "postgres", message: "Only src/lib/db may open a database connection. Use asUser or a service." },
];
const DRIVER_PATTERNS = [
  { group: ["drizzle-orm/*-js"],
    message: "Only src/lib/db may open a database connection. Use asUser or a service." },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Outside src/lib/db and src/lib/services: no database driver, no Drizzle
  // client, and no asSystem (admin access, RLS bypassed).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", "src/lib/services/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: DRIVER_PATHS, patterns: [
        ...DRIVER_PATTERNS,
        { group: ["@/lib/db/client", "**/db/client"], allowTypeImports: true,
          message: "Use asUser (runs the query as the signed-in user, so RLS applies) or a service; only src/lib/db uses the Drizzle client directly." },
        { group: ["@/lib/db/system", "**/db/system"],
          message: "asSystem bypasses RLS; only src/lib/services may call it." },
      ] }],
    },
  },
  // Services may use asSystem (admin access, only after authorize() has
  // confirmed permission) but not the raw client or a database driver.
  {
    files: ["src/lib/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: DRIVER_PATHS, patterns: [
        ...DRIVER_PATTERNS,
        { group: ["@/lib/db/client", "**/db/client"], allowTypeImports: true,
          message: "Go through asUser or asSystem." },
      ] }],
    },
  },
  // Outside src/lib/db: no hand-written SQL text. sql.raw and postgres.js's
  // .unsafe() send a string to the database as-is, with no value escaping.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: "sql.raw sends text to the database unescaped; only src/lib/db may use it." },
        { selector: "CallExpression[callee.property.name='unsafe']",
          message: ".unsafe() sends text to the database unescaped; only src/lib/db may use it." },
      ],
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
