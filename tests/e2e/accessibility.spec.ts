import { expect, test, type Page } from '@playwright/test';
import { APP_URL, answerScreen, chooseCase, continueOn, screenTitle } from './helpers';

/**
 * Accessibility and shop-floor ergonomics. These are not nice-to-haves here:
 * the tool is used on a tablet, under plant lighting, often with gloves on, and
 * sometimes entirely by keyboard.
 */

const MIN_TAP = 44;

async function firstQuestion(page: Page) {
  await page.goto(APP_URL);
  await expect(page.locator('.screen__title')).toBeVisible();
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
      undersized.push(
        `${(await control.textContent())?.trim().slice(0, 40)} ${box.width}x${box.height}`,
      );
    }
  }
  expect(undersized, `controls below ${MIN_TAP}px: ${undersized.join(' | ')}`).toEqual([]);
});

test('is fully operable by keyboard alone', async ({ page }) => {
  await firstQuestion(page);

  // Tab to the first radio and select it without ever using the mouse.
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const type = await page.evaluate(() => document.activeElement?.getAttribute('type'));
    if (type === 'radio') break;
  }
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio').first()).toBeChecked();

  // The remaining questions on this screen are answered the same way.
  await answerScreen(page);

  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (text === 'Continue' || text === 'Answer to continue') break;
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.screen__title')).not.toContainText('What kind of case is this');
});

test('moves focus to the new screen on every transition', async ({ page }) => {
  await firstQuestion(page);
  await answerScreen(page);
  await continueOn(page);

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
  await expect(page.locator('fieldset.options').first()).toBeVisible();
  await expect(page.locator('fieldset.options legend').first()).toBeAttached();
  // Every option group is labelled, not just the first.
  const groups = await page.locator('fieldset.options').count();
  expect(await page.locator('fieldset.options legend').count()).toBe(groups);
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
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await answerScreen(page);
  await continueOn(page);

  await expect(page.locator('.screen__title')).toContainText('What was being done');
  await continueOn(page);
  await expect(page.locator('[role="alert"]').first()).toBeVisible();
});

test('every posture tile is a full-size tap target', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  for (let i = 0; i < 10; i += 1) {
    if ((await screenTitle(page)).includes('sequence of events')) break;
    await answerScreen(page);
    await continueOn(page);
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }

  const tiles = page.locator('.postures .posture');
  const count = await tiles.count();
  expect(count).toBeGreaterThan(8);
  for (let i = 0; i < count; i += 1) {
    const box = await tiles.nth(i).boundingBox();
    expect(box, 'posture tile has no box').not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
