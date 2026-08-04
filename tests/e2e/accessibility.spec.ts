import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility and shop-floor ergonomics. These are not nice-to-haves here:
 * the tool is used on a tablet, under plant lighting, often with gloves on, and
 * sometimes entirely by keyboard.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_URL = pathToFileURL(join(HERE, '..', '..', 'dist', 'ii-description-wizard.html')).href;

const MIN_TAP = 44;

async function firstQuestion(page: Page) {
  await page.goto(APP_URL);
  await expect(page.locator('.question__prompt')).toBeVisible();
}

test('every interactive control meets the 44px minimum tap target', async ({ page }) => {
  await firstQuestion(page);

  const controls = page.locator('button, .option, a.skip-link, summary');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  const undersized: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    if (box.height < MIN_TAP || box.width < MIN_TAP) {
      undersized.push(`${(await control.textContent())?.trim().slice(0, 40)} ${box.width}x${box.height}`);
    }
  }
  expect(undersized, `controls below ${MIN_TAP}px: ${undersized.join(' | ')}`).toEqual([]);
});

test('is fully operable by keyboard alone', async ({ page }) => {
  await firstQuestion(page);

  // Tab to the first radio and select it without ever using the mouse.
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const role = await page.evaluate(() => document.activeElement?.getAttribute('type'));
    if (role === 'radio') break;
  }
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio').first()).toBeChecked();

  // Tab on to Continue and activate it.
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (text === 'Continue' || text === 'Answer to continue') break;
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.question__prompt')).not.toContainText('Which pattern best describes');
});

test('moves focus to the new screen on every transition', async ({ page }) => {
  await firstQuestion(page);
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: /Continue/ }).click();

  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim().slice(0, 60),
  }));
  expect(focused.tag).toBe('H2');
  expect(focused.text?.length).toBeGreaterThan(0);
});

test('labels every input and announces validation through a live region', async ({ page }) => {
  await firstQuestion(page);

  // Every form control has an accessible name.
  const unlabelled = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('input, textarea, select')];
    return controls
      .filter((control) => {
        const id = control.getAttribute('id');
        const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : false;
        return !hasLabel && !control.getAttribute('aria-label');
      })
      .map((control) => control.getAttribute('id') ?? control.tagName);
  });
  expect(unlabelled).toEqual([]);

  await expect(page.locator('[role="status"][aria-live="polite"]').first()).toBeAttached();
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', /\d+/);
});

test('uses a fieldset and legend for grouped options', async ({ page }) => {
  await firstQuestion(page);
  await expect(page.locator('fieldset.options')).toBeVisible();
  await expect(page.locator('fieldset.options legend')).toBeAttached();
});

test('has exactly one h1 and a coherent heading order', async ({ page }) => {
  await firstQuestion(page);
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1])),
  );
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  for (let i = 1; i < levels.length; i += 1) {
    expect((levels[i] as number) - (levels[i - 1] as number)).toBeLessThanOrEqual(1);
  }
});

test('does not scroll horizontally at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await firstQuestion(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('a blocking message is exposed as an alert', async ({ page }) => {
  await firstQuestion(page);
  await page.getByRole('radio', { name: /Acute single event/ }).check();
  await page.getByRole('button', { name: /Continue/ }).click();

  for (let i = 0; i < 12; i += 1) {
    const heading = await page.locator('.question__prompt').first().textContent();
    if (heading?.includes('What specific task was being performed')) break;
    const radios = page.getByRole('radio');
    if (await radios.count()) await radios.first().check();
    await page.getByRole('button', { name: /Continue|Answer to continue/ }).click();
  }

  await page.getByRole('button', { name: /Continue|Answer to continue/ }).click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
});
