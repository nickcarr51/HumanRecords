import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [tsconfigPaths(), react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
    },
  };
});
