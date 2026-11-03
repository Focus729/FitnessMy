import { defineConfig } from 'vitest/config';

// Explicit opt-in only: ordinary unit tests never use credentials or the network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/test-d1-sync.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 30000,
  },
});
