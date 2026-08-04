import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Some CI images ship a Chromium build that does not match the revision this
// Playwright version would download. PLAYWRIGHT_CHROMIUM_PATH lets those images
// point at what they already have instead of fetching another copy.
const providedChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const launchOptions = existsSync(providedChromium)
  ? { executablePath: providedChromium }
  : undefined;

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
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    {
      // The shop floor runs this on tablets, so that viewport is a first-class
      // target rather than something checked once by hand. The iPad descriptor
      // defaults to WebKit; we keep its viewport and touch settings but run it
      // on Chromium, which is what the corporate tablets actually use.
      name: 'tablet',
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium', launchOptions },
    },
  ],
});
