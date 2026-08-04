import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';

/**
 * Shared driving helpers.
 *
 * The suite runs against the single-file build over file://, because that is how
 * most users open this tool - double-clicked from a share or an attachment.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_URL = pathToFileURL(
  join(HERE, '..', '..', 'dist', 'ii-description-wizard.html'),
).href;

/** A long, specific, motion-bearing answer that satisfies every signal check. */
export const GOOD_ANSWER =
  'The carton released suddenly, the belt restarted under its own control logic, and the right hand was pulled against the fixed steel edge of the guard opening at station 4.';

export async function screenTitle(page: Page): Promise<string> {
  return (await page.locator('.screen__title').first().textContent()) ?? '';
}

export async function continueOn(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /Continue|Answer to continue/ })
    .first()
    .click();
}

/** The question block whose prompt contains `fragment`. */
export function questionBlock(page: Page, fragment: string) {
  return page.locator('.q').filter({ has: page.locator('.q__prompt', { hasText: fragment }) });
}

/** Fills every control on the current screen that has not been answered yet. */
export async function answerScreen(page: Page, seed: Record<string, string> = {}): Promise<void> {
  for (const block of await page.locator('.q').all()) {
    const prompt = (await block.locator('.q__prompt').first().textContent()) ?? '';
    const box = block.locator('.field__textarea, .field__input');

    if (await box.count()) {
      const override = Object.entries(seed).find(([key]) => prompt.includes(key))?.[1];
      await box.first().fill(override ?? GOOD_ANSWER);
      continue;
    }

    const group = block.locator('fieldset');
    if (!(await group.count())) continue;
    if ((await group.locator('input:checked').count()) > 0) continue;

    const radios = group.getByRole('radio');
    if (await radios.count()) {
      await radios.first().check();
      continue;
    }
    const checks = group.getByRole('checkbox');
    if (await checks.count()) await checks.first().check();
  }
}

/** Answers screens until the one whose title contains `fragment` is showing. */
export async function walkToScreen(page: Page, fragment: string, max = 20): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    if ((await screenTitle(page)).includes(fragment)) return;
    await answerScreen(page);
    await continueOn(page);
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }
  throw new Error(`Never reached a screen titled like "${fragment}"`);
}

/** Walks the whole flow to the review screen. */
export async function completeWizard(page: Page, seed: Record<string, string> = {}): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const heading = await screenTitle(page);
    if (heading.includes('Review and copy')) return;

    if (heading.includes('Form cross-check')) {
      await page.getByRole('button', { name: /Continue to the description/ }).click();
      continue;
    }

    await answerScreen(page, seed);
    await continueOn(page);
    // A challenge shows once; pressing Continue again moves past it.
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }
  throw new Error('Wizard did not reach the review screen within 40 screens');
}

/** Picks the four framing values, which decide the whole downstream flow. */
export async function chooseCase(
  page: Page,
  opts: { onset: RegExp; type?: RegExp; part?: RegExp },
): Promise<void> {
  await questionBlock(page, 'How did this case arise')
    .getByRole('radio', { name: opts.onset })
    .check();
  await questionBlock(page, 'Injury or illness')
    .getByRole('radio', { name: /^Injury$/ })
    .check();
  await questionBlock(page, 'Accident type')
    .getByRole('radio', { name: opts.type ?? /Caught in/ })
    .check();
  await questionBlock(page, 'Principal body part')
    .getByRole('radio', { name: opts.part ?? /^Hand$/ })
    .check();
  await continueOn(page);
  await expect(page.locator('.screen__title')).toContainText('Who and what was involved');
}
