import { defineConfig, devices } from '@playwright/test';

// The e2e suite runs against the single-file build loaded over file://, because that
// is how most users will actually open the tool. Run `npm run build:single` first.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
    // No baseURL: tests navigate to the file:// URL of the built artifact.
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7) landscape'] },
    },
  ],
});
