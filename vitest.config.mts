import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// DB-backed test files share one local Supabase database and some assert on
// global ordering (e.g. top of the feed), so they must not run concurrently.
// Every file that imports ./test-helpers belongs here: *.data.test.ts plus
// the schema tests below that are not named *.data.test.ts.
const dbTests = [
  'src/**/*.data.test.ts',
  'src/lib/supabase/artists.test.ts',
  'src/lib/supabase/catalog-relations.test.ts',
  'src/lib/supabase/catalog.test.ts',
  'src/lib/supabase/users.test.ts',
];

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  const base = {
    plugins: [tsconfigPaths(), react()],
    resolve: {
      alias: {
        'server-only': fileURLToPath(
          new URL('./src/test/server-only-stub.ts', import.meta.url),
        ),
      },
    },
  };
  const testBase = {
    environment: 'jsdom' as const,
    setupFiles: ['./vitest.setup.ts'],
  };
  const exclude = [...configDefaults.exclude, '.claude/worktrees/**'];

  return {
    test: {
      projects: [
        {
          ...base,
          test: {
            ...testBase,
            name: 'unit',
            exclude: [...exclude, ...dbTests],
          },
        },
        {
          ...base,
          test: {
            ...testBase,
            name: 'db',
            include: dbTests,
            exclude,
            fileParallelism: false,
          },
        },
      ],
    },
  };
});
