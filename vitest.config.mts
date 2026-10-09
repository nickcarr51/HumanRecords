import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [tsconfigPaths(), react()],
    resolve: {
      alias: {
        'server-only': fileURLToPath(
          new URL('./src/test/server-only-stub.ts', import.meta.url),
        ),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
    },
  };
});
