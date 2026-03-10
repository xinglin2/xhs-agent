import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    alias: {
      '@xhs/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@xhs/db': resolve(__dirname, '../db/src/index.ts'),
      '@xhs/logger': resolve(__dirname, '../logger/src/index.ts'),
    },
  },
  resolve: {
    alias: {
      '@xhs/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@xhs/db': resolve(__dirname, '../db/src/index.ts'),
      '@xhs/logger': resolve(__dirname, '../logger/src/index.ts'),
    },
  },
});
