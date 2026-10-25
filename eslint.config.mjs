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
// Allowed: drizzle-orm (the query helpers) and drizzle-orm/pg-core (the
// Postgres table types). Every other drizzle-orm path is blocked, so a driver
// Drizzle adds later is blocked too.
const DRIVER_PATTERNS = [
  { group: ["drizzle-orm/*", "!drizzle-orm/pg-core"],
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
        // import("postgres") or import("drizzle-orm/...") loaded while running,
        // and any import() whose path isn't a plain string, which lint can't read.
        { selector: "ImportExpression[source.value=/^(postgres|drizzle-orm\\/(?!pg-core(\\/|$)).+)$/]",
          message: "Only src/lib/db may open a database connection. Use asUser or a service." },
        { selector: "ImportExpression[source.type!='Literal']",
          message: "Write import() paths as plain strings, so lint can check them." },
        { selector: "CallExpression[callee.property.name='unsafe']",
          message: ".unsafe() sends text to the database unescaped; only src/lib/db may use it." },
        // The same rule for raw SQL reached another way: sql.raw under another
        // name (`s.raw`, `sql["raw"]`, `const { raw } = sql`), and execute(),
        // which runs a plain string as raw SQL. execute() must be called as
        // `x.execute(sql`...`)`, with the template written in place, so every
        // value in it is escaped. These match the names on any object, since
        // lint can't tell which object is Drizzle's.
        { selector: "MemberExpression[computed=false][property.name='raw'][object.name!=/^(sql|String)$/]",
          message: ".raw sends text to the database unescaped; only src/lib/db may use it." },
        { selector: "MemberExpression[computed=true][property.value='raw']",
          message: ".raw sends text to the database unescaped; only src/lib/db may use it." },
        { selector: "MemberExpression[computed=true][property.type='TemplateLiteral'][property.quasis.0.value.cooked='raw']",
          message: ".raw sends text to the database unescaped; only src/lib/db may use it." },
        { selector: "ObjectPattern > Property[key.name='raw'], ObjectPattern > Property[key.value='raw'], ObjectPattern > Property[key.quasis.0.value.cooked='raw']",
          message: ".raw sends text to the database unescaped; only src/lib/db may use it." },
        { selector: "CallExpression[callee.property.name='execute']:not([arguments.0.type='TaggedTemplateExpression'][arguments.0.tag.name='sql'])",
          message: "execute() runs a plain string as raw SQL; pass it a sql`...` template written in place." },
        { selector: "MemberExpression[computed=true][property.value='execute'], MemberExpression[computed=true][property.quasis.0.value.cooked='execute'], ObjectPattern > Property[key.name='execute'], ObjectPattern > Property[key.value='execute'], ObjectPattern > Property[key.quasis.0.value.cooked='execute'], MemberExpression[object.property.name='execute'][property.name=/^(call|apply|bind)$/], MemberExpression[property.name='execute']:not(.callee):not(.object)",
          message: "execute() runs a plain string as raw SQL; call it as x.execute(sql`...`)." },
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
