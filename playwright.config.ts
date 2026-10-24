import { defineConfig, devices } from '@playwright/test';

/**
 * Two real browser clients in one call, against the local stack in e2e/stack.mjs
 * (catalog stand-in, the signaling server from server/, and the exported web app).
 * Build the web app first: npm run e2e:build
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/stack.mjs',
    url: 'http://localhost:4000/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
