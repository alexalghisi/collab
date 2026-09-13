import { defineConfig } from 'vitest/config';

/**
 * Unit and integration tests for the transport, server and meeting logic.
 * React Native components are exercised through their hooks and plain modules
 * rather than a renderer, which keeps the suite free of the Metro transform.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    restoreMocks: true,
  },
});
