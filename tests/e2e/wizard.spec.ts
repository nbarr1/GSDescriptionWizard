import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * The e2e suite runs against the single-file build loaded over file://, because
 * that is how most users will open this tool - double-clicked from a network
 * share or an email attachment, with no server involved.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, '..', '..', 'dist', 'ii-description-wizard.html');
const APP_URL = pathToFileURL(ARTIFACT).href;

test.beforeAll(() => {
  if (!existsSync(ARTIFACT)) {
    throw new Error(`Missing ${ARTIFACT}. Run "npm run build:single" first.`);
  }
});

// --- helpers ---------------------------------------------------------------

async function chooseOption(page: Page, label: string) {
  await page.getByRole('radio', { name: label, exact: false }).first().check();
}

async function fill(page: Page, value: string) {
  const box = page.locator('.field__textarea, .field__input').first();
  await box.fill(value);
}

async function continueOn(page: Page) {
  await page.getByRole('button', { name: /Continue|Answer to continue/ }).click();
}

async function promptText(page: Page): Promise<string> {
  return (await page.locator('.question__prompt').first().textContent()) ?? '';
}

/** Walks the whole flow, answering every screen substantively. */
async function completeWizard(page: Page, seed: Record<string, string> = {}) {
  for (let screen = 0; screen < 120; screen += 1) {
    const heading = await promptText(page);
    if (heading.includes('Review and copy')) return;

    if (heading.includes('Form cross-check')) {
      await page.getByRole('button', { name: /Continue to the description/ }).click();
      continue;
    }

    const radios = page.getByRole('radio');
    const checkboxes = page.getByRole('checkbox');
    const textbox = page.locator('.field__textarea, .field__input').first();

    if (await textbox.count()) {
      const override = Object.entries(seed).find(([key]) => heading.includes(key))?.[1];
      // Long, specific, motion-bearing prose that satisfies every signal check.
      await textbox.fill(
        override ??
          'The operator was clearing a jammed carton from the infeed conveyor at station 4 while the belt was still running, approximately 40 pounds, about 6 feet from the guard, and the hand was drawn against the fixed steel edge.',
      );
    } else if (await radios.count()) {
      await radios.first().check();
    } else if (await checkboxes.count()) {
      await checkboxes.first().check();
    }

    await continueOn(page);
    // A challenge shows once; pressing Continue again moves past it.
    if (await page.locator('.feedback--challenge, .feedback--block').count()) {
      await continueOn(page);
    }
  }
  throw new Error('Wizard did not reach the review screen within 120 screens');
}

// --- the hard constraint ---------------------------------------------------

test('makes zero network requests across a full session', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    // The file:// document load itself is not an outbound request.
    if (!request.url().startsWith('file://')) requests.push(request.url());
  });
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith('file://')) requests.push(`failed: ${request.url()}`);
  });

  await page.goto(APP_URL);
  await completeWizard(page);
  await expect(page.locator('#composed-output')).toBeVisible();

  expect(requests, `unexpected network activity: ${requests.join(', ')}`).toEqual([]);
});

// --- core journey ----------------------------------------------------------

test('loads from file:// and shows the first question', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('.question__prompt')).toContainText('Which pattern best describes');
  await expect(page.locator('.progress__stage')).toContainText('Stage 1 of 8');
});

test('completes a full session and produces a clean description', async ({ page }) => {
  await page.goto(APP_URL);
  await completeWizard(page);

  const output = page.locator('#composed-output');
  await expect(output).toBeVisible();
  const text = await output.inputValue();

  expect(text.length).toBeGreaterThan(300);
  expect(text).not.toMatch(/['"]/);
  expect(text).not.toMatch(/[^\x20-\x7E\n]/);
  await expect(page.locator('.meter__label')).not.toBeEmpty();
});

test('branches on onset pattern - a gradual case never asks for the moment of injury', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Gradual onset or cumulative');
  await continueOn(page);

  const prompts: string[] = [];
  for (let i = 0; i < 60; i += 1) {
    const heading = await promptText(page);
    if (heading.includes('Review and copy')) break;
    prompts.push(heading);

    if (heading.includes('Form cross-check')) {
      await page.getByRole('button', { name: /Continue to the description/ }).click();
      continue;
    }
    const textbox = page.locator('.field__textarea, .field__input').first();
    if (await textbox.count()) {
      await textbox.fill(
        'The assembler was lifting and rotating trays about 300 times per shift with the wrist bent back, approximately 14 pounds each, for about 7 months.',
      );
    } else if (await page.getByRole('radio').count()) {
      await page.getByRole('radio').first().check();
    } else if (await page.getByRole('checkbox').count()) {
      await page.getByRole('checkbox').first().check();
    }
    await continueOn(page);
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }

  expect(prompts.some((p) => p.includes('The moment: what happened'))).toBe(false);
  expect(prompts.some((p) => p.includes('How often is this task performed'))).toBe(true);
});

// --- the pushback engine ---------------------------------------------------

test('blocks an empty answer on a question where a blank makes the record useless', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  // Walk to the first blocking free-text question.
  for (let i = 0; i < 12; i += 1) {
    if ((await promptText(page)).includes('What specific task was being performed')) break;
    const radios = page.getByRole('radio');
    if (await radios.count()) await radios.first().check();
    await continueOn(page);
  }

  await expect(page.locator('.question__prompt')).toContainText('What specific task');
  await continueOn(page);
  await expect(page.locator('.feedback--block')).toBeVisible();
  await expect(page.locator('.question__prompt')).toContainText('What specific task');
});

test('cannot be defeated by the literal filler strings from the real data', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  for (let i = 0; i < 12; i += 1) {
    if ((await promptText(page)).includes('What specific task was being performed')) break;
    const radios = page.getByRole('radio');
    if (await radios.count()) await radios.first().check();
    await continueOn(page);
  }

  for (const filler of ['not specified', 'unknown', 'pending', 'n/a', 'Hand contusion']) {
    await fill(page, filler);
    await continueOn(page);
    await expect(
      page.locator('.feedback--block, .feedback--challenge'),
      `"${filler}" was accepted without pushback`,
    ).toBeVisible();
    await expect(page.locator('.question__prompt')).toContainText('What specific task');
  }
});

test('never traps a user - a challenge always yields on the second attempt', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  for (let i = 0; i < 12; i += 1) {
    if ((await promptText(page)).includes('Why was this task being done')) break;
    const radios = page.getByRole('radio');
    const textbox = page.locator('.field__textarea, .field__input').first();
    if (await textbox.count()) {
      await textbox.fill('Clearing a jammed carton from the infeed conveyor at station 4');
    } else if (await radios.count()) {
      await radios.first().check();
    }
    await continueOn(page);
  }

  const before = await promptText(page);
  await fill(page, 'because');
  await continueOn(page);
  await continueOn(page);
  expect(await promptText(page)).not.toBe(before);
});

test('offers an escape hatch that requires a stated reason', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  for (let i = 0; i < 14; i += 1) {
    if ((await promptText(page)).includes('What procedure, work instruction')) break;
    const radios = page.getByRole('radio');
    const textbox = page.locator('.field__textarea, .field__input').first();
    if (await textbox.count()) {
      await textbox.fill('Clearing a jammed carton from the infeed conveyor at station 4');
    } else if (await radios.count()) {
      await radios.first().check();
    }
    await continueOn(page);
  }

  await expect(page.locator('.hatches')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept('The area supervisor is confirming it'));
  await page.getByRole('button', { name: 'I do not know' }).click();
  await expect(page.locator('.notice--advisory')).toContainText('Recorded as a stated gap');
});

// --- safety ----------------------------------------------------------------

test('treats script injection as inert text', async ({ page }) => {
  await page.goto(APP_URL);
  let alerted = false;
  page.on('dialog', (dialog) => {
    alerted = true;
    void dialog.dismiss();
  });

  await completeWizard(page, {
    'What specific task was being performed':
      '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"> clearing a jammed carton from the conveyor at station 4 with the belt still running',
  });

  const output = await page.locator('#composed-output').inputValue();
  expect(output).toContain('script');
  expect(alerted).toBe(false);
  expect(
    await page.evaluate(() => (window as never as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  // No element was ever created from the injected markup.
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('flags a seeded identifier in the review panel', async ({ page }) => {
  await page.goto(APP_URL);
  await completeWizard(page, {
    'What specific task was being performed':
      'Clearing a jam at station 4 alongside badge 448192 while the conveyor belt was still running and the guard was open',
  });
  await expect(page.locator('.notice--blocking')).toContainText(/employee identifier/i);
});

// --- resilience ------------------------------------------------------------

test('survives a browser refresh at the first stage without persisting anything', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  await page.reload();

  // Persistence is opt-in, so a refresh starts clean rather than leaking a draft.
  await expect(page.locator('.question__prompt')).toContainText('Which pattern best describes');
});

test('back navigation is non-destructive', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);
  const second = await promptText(page);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: /Acute single event/ })).toBeChecked();

  await continueOn(page);
  expect(await promptText(page)).toBe(second);
});

test('clear all data resets the session', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Clear all data' }).click();
  await expect(page.locator('.question__prompt')).toContainText('Which pattern best describes');
});

// --- refresh and persistence across the whole flow --------------------------

test('a refresh at any stage starts clean while persistence is off', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);

  // Refresh at several points through the flow, not just the first screen.
  for (let stage = 0; stage < 6; stage += 1) {
    for (let i = 0; i < 4; i += 1) {
      const radios = page.getByRole('radio');
      const textbox = page.locator('.field__textarea, .field__input').first();
      if (await textbox.count()) {
        await textbox.fill(
          'The operator was clearing a jammed carton from the conveyor at station 4 while the belt was still running and the hand was drawn against the guard edge.',
        );
      } else if (await radios.count()) {
        await radios.first().check();
      }
      await continueOn(page);
      if (await page.locator('.feedback--challenge, .feedback--block').count())
        await continueOn(page);
    }

    await page.reload();
    // Nothing was opted into storage, so every refresh returns to the start.
    await expect(page.locator('.question__prompt')).toContainText('Which pattern best describes');
    await chooseOption(page, 'Acute single event');
    await continueOn(page);
  }
});

test('opting into persistence survives a refresh, and clearing removes it', async ({ page }) => {
  await page.goto(APP_URL);
  await completeWizard(page);

  await page.locator('#persist-draft').check();
  await page.reload();
  // The draft is restored, so the wizard does not start from the first question.
  await expect(page.locator('.question__prompt')).not.toContainText('Which pattern best describes');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Clear all data' }).click();
  await page.reload();
  await expect(page.locator('.question__prompt')).toContainText('Which pattern best describes');
});

test('rapid back and forth mid-validation does not lose answers or wedge the flow', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await chooseOption(page, 'Acute single event');
  await continueOn(page);

  for (let i = 0; i < 10; i += 1) {
    const radios = page.getByRole('radio');
    if (await radios.count()) await radios.first().check();
    await continueOn(page);
    if ((await promptText(page)).includes('What specific task was being performed')) break;
  }

  const answer = 'Clearing a jammed carton from the infeed conveyor at station 4';
  await fill(page, answer);

  // Trigger validation, then immediately navigate away and back, repeatedly.
  for (let i = 0; i < 8; i += 1) {
    await continueOn(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await continueOn(page);
  }

  // The answer is intact and the flow is still usable.
  await page.getByRole('button', { name: 'Back' }).click();
  const box = page.locator('.field__textarea, .field__input').first();
  await expect(box).toHaveValue(answer);
  await continueOn(page);
  expect(await promptText(page)).not.toBe('');
});
