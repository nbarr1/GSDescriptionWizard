import { expect, test } from '@playwright/test';
import { APP_URL } from './helpers';

/**
 * The legal footer text and the Evergreen/Urgency Green palette are compliance
 * requirements from the brand guidelines, not aesthetic preferences, so they get
 * an assertion rather than relying on someone eyeballing a screenshot.
 */

test('footer carries the required trademark and copyright text', async ({ page }) => {
  await page.goto(APP_URL);
  const footer = page.locator('.app__footer');
  await expect(footer).toContainText(
    'GE is a trademark of General Electric Company used under trademark license.',
  );
  await expect(footer).toContainText(
    '© 2025 GE Vernova and/or its affiliates. All rights reserved.',
  );
});

test('primary button uses the Evergreen brand color and sharp corners', async ({ page }) => {
  await page.goto(APP_URL);
  const primary = page.getByRole('button', { name: /Answer to continue|Continue/ });
  const style = await primary.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, radius: cs.borderRadius };
  });
  expect(style.background).toBe('rgb(0, 94, 96)'); // #005E60
  expect(parseFloat(style.radius)).toBeLessThanOrEqual(2);
});

test('the progress bar has no rounded (pill-shaped) corners', async ({ page }) => {
  await page.goto(APP_URL);
  const radius = await page
    .locator('.progress__bar')
    .evaluate((el) => parseFloat(getComputedStyle(el).borderRadius));
  expect(radius).toBeLessThanOrEqual(2);
});
