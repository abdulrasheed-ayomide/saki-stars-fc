import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration files each use their own database, so they can run in parallel.
    fileParallelism: true,
  },
});
