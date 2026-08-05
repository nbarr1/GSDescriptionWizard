import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  APP_URL,
  answerScreen,
  chooseCase,
  completeWizard,
  continueOn,
  questionBlock,
  screenTitle,
  walkToScreen,
} from './helpers';

test.beforeAll(() => {
  const artifact = fileURLToPath(APP_URL);
  if (!existsSync(artifact)) {
    throw new Error(`Missing ${artifact}. Run "npm run build:single" first.`);
  }
});

// --- the hard constraint ---------------------------------------------------

test('makes zero network requests across a full session', async ({ page }) => {
  const requests: string[] = [];
  const record = (url: string) => {
    // The file:// document load itself is not an outbound request.
    if (!url.startsWith('file://')) requests.push(url);
  };
  page.on('request', (r) => record(r.url()));
  page.on('requestfailed', (r) => record(`failed: ${r.url()}`));

  await page.goto(APP_URL);
  await completeWizard(page);
  await expect(page.locator('#composed-output')).toBeVisible();

  expect(requests, `unexpected network activity: ${requests.join(', ')}`).toEqual([]);
});

// --- core journey ----------------------------------------------------------

test('loads from file:// and shows the first screen', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('.screen__title')).toContainText('What kind of case is this');
  await expect(page.locator('.progress__stage')).toContainText('Stage 1 of 8');
});

test('asks several questions per screen rather than one', async ({ page }) => {
  await page.goto(APP_URL);
  // The consolidation is the point: a screen is a cluster, not a single question.
  expect(await page.locator('.q').count()).toBeGreaterThan(2);
});

test('completes a full session in a small number of screens', async ({ page }) => {
  await page.goto(APP_URL);

  let screens = 0;
  for (let i = 0; i < 40; i += 1) {
    const heading = await screenTitle(page);
    if (heading.includes('Review and copy')) break;
    screens += 1;
    if (heading.includes('Form cross-check')) {
      await page.getByRole('button', { name: /Continue to the description/ }).click();
      continue;
    }
    await answerScreen(page);
    await continueOn(page);
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }

  // One question per screen produced roughly 35 of these. Guard the improvement.
  expect(screens).toBeLessThanOrEqual(16);

  const output = page.locator('#composed-output');
  await expect(output).toBeVisible();
  const text = await output.inputValue();
  expect(text.length).toBeGreaterThan(300);
  expect(text).not.toMatch(/['"]/);
  expect(text).not.toMatch(/[^\x20-\x7E\n]/);
});

test('shows how many screens are left', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('.progress__label')).toContainText(/screens to go|Last screen/);
});

test('picking an answer does not scroll the page back to the top', async ({ page }) => {
  await page.goto(APP_URL);
  const target = page.getByRole('radio', { name: /^Wrist$/ });
  await target.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await target.check();
  await expect(target).toBeChecked();

  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBe(before);
});

test('branches on onset pattern - a gradual case never asks for the moment of injury', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Gradual onset/, type: /Repetitive motion/, part: /^Wrist$/ });

  const prompts: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const heading = await screenTitle(page);
    if (heading.includes('Review and copy')) break;
    for (const p of await page.locator('.q__prompt').allTextContents()) prompts.push(p);

    if (heading.includes('Form cross-check')) {
      await page.getByRole('button', { name: /Continue to the description/ }).click();
      continue;
    }
    await answerScreen(page);
    await continueOn(page);
    if (await page.locator('.feedback--challenge, .feedback--block').count())
      await continueOn(page);
  }

  expect(prompts.some((p) => p.includes('The moment: what happened'))).toBe(false);
  expect(prompts.some((p) => p.includes('How often is this task done'))).toBe(true);
  expect(prompts.some((p) => p.includes('Describe one cycle'))).toBe(true);
});

// --- the pushback engine ---------------------------------------------------

test('blocks an empty answer where a blank makes the record useless', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await answerScreen(page);
  await continueOn(page);

  await expect(page.locator('.screen__title')).toContainText('What was being done');
  await continueOn(page);
  await expect(page.locator('.feedback--block')).toBeVisible();
  await expect(page.locator('.screen__title')).toContainText('What was being done');
});

test('cannot be defeated by the literal filler strings from the real data', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await answerScreen(page);
  await continueOn(page);
  await expect(page.locator('.screen__title')).toContainText('What was being done');

  const task = questionBlock(page, 'What was the person doing');
  for (const filler of ['not specified', 'unknown', 'pending', 'n/a', 'Hand contusion']) {
    await task.locator('.field__textarea').fill(filler);
    await continueOn(page);
    await expect(
      page.locator('.feedback--block, .feedback--challenge').first(),
      `"${filler}" was accepted without pushback`,
    ).toBeVisible();
    await expect(page.locator('.screen__title')).toContainText('What was being done');
  }
});

test('never traps a user - a challenge always yields on the second attempt', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await answerScreen(page);
  await continueOn(page);

  const before = await screenTitle(page);
  // Long enough to clear the length floor, but with no action verb in it.
  await questionBlock(page, 'What was the person doing')
    .locator('.field__textarea')
    .fill('A conveyor jam situation at the station on the line near the wall');
  await continueOn(page);
  await expect(page.locator('.feedback--challenge').first()).toBeVisible();
  await continueOn(page);
  expect(await screenTitle(page)).not.toBe(before);
});

test('offers an escape hatch that requires a stated reason', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await walkToScreen(page, 'Method and protection');

  const procedure = questionBlock(page, 'What written method covered this task');
  await expect(procedure.locator('.hatches')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept('The area supervisor is confirming it'));
  await procedure.getByRole('button', { name: 'I do not know' }).click();
  await expect(procedure.locator('.notice--advisory')).toContainText('Recorded as a stated gap');
});

// --- pickers ---------------------------------------------------------------

test('offers body position as figures rather than a text box', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await walkToScreen(page, 'sequence of events');

  const postures = page.locator('.postures .posture');
  expect(await postures.count()).toBeGreaterThan(8);
  // Each tile carries a drawn figure, not just a word.
  expect(await page.locator('.postures svg.posture__figure').count()).toBeGreaterThan(8);

  await postures.filter({ hasText: 'Bent and twisted' }).getByRole('radio').check();
  await expect(postures.filter({ hasText: 'Bent and twisted' }).getByRole('radio')).toBeChecked();
});

test('a picked posture reaches the composed description', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await walkToScreen(page, 'sequence of events');
  await answerScreen(page);
  await page
    .locator('.postures .posture')
    .filter({ hasText: 'Leaning over a rail' })
    .getByRole('radio')
    .check();
  await continueOn(page);
  if (await page.locator('.feedback--challenge, .feedback--block').count()) await continueOn(page);
  await completeWizard(page);

  const text = await page.locator('#composed-output').inputValue();
  expect(text).toContain('Body position at the moment: leaning over a rail or machine.');
});

test('multiselect answers join into readable prose', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await walkToScreen(page, 'Method and protection');

  const ppe = questionBlock(page, 'What PPE was being worn');
  await ppe.getByRole('checkbox', { name: 'Safety glasses' }).check();
  await ppe.getByRole('checkbox', { name: 'Cut resistant gloves' }).check();

  await answerScreen(page);
  await completeWizard(page);
  const text = await page.locator('#composed-output').inputValue();
  expect(text).toContain('safety glasses and cut resistant gloves');
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
    'What was the person doing':
      '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"> clearing a jammed carton from the conveyor at station 4 with the belt still running',
  });

  const output = await page.locator('#composed-output').inputValue();
  expect(output).toContain('script');
  expect(alerted).toBe(false);
  expect(
    await page.evaluate(() => (window as never as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('flags a seeded identifier in the review panel', async ({ page }) => {
  await page.goto(APP_URL);
  await completeWizard(page, {
    'What was different from a normal run':
      'The same jam was cleared by badge 448192 on the previous shift and was not reported at the time',
  });
  await expect(page.locator('.notice--blocking')).toContainText(/employee identifier/i);
});

// --- resilience ------------------------------------------------------------

test('a refresh starts clean while persistence is off', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await page.reload();
  await expect(page.locator('.screen__title')).toContainText('What kind of case is this');
});

test('opting into persistence survives a refresh, and clearing removes it', async ({ page }) => {
  await page.goto(APP_URL);
  await completeWizard(page);

  await page.locator('#persist-draft').check();
  await page.reload();
  await expect(page.locator('.screen__title')).not.toContainText('What kind of case is this');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Clear all data' }).click();
  await page.reload();
  await expect(page.locator('.screen__title')).toContainText('What kind of case is this');
});

test('back navigation is non-destructive', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  const second = await screenTitle(page);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(
    questionBlock(page, 'How did this case arise').getByRole('radio', {
      name: /Acute single event/,
    }),
  ).toBeChecked();

  await continueOn(page);
  expect(await screenTitle(page)).toBe(second);
});

test('rapid back and forth mid-validation does not lose answers', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });
  await answerScreen(page);
  await continueOn(page);
  await expect(page.locator('.screen__title')).toContainText('What was being done');

  const answer = 'Clearing a jammed carton from the infeed conveyor at station 4';
  await questionBlock(page, 'What was the person doing').locator('.field__textarea').fill(answer);

  // Bounce off the validation and back repeatedly. Each round ends on the same
  // screen, so the answer must survive every re-render.
  for (let i = 0; i < 5; i += 1) {
    await continueOn(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.screen__title')).toContainText('Who and what was involved');
    await continueOn(page);
    await expect(page.locator('.screen__title')).toContainText('What was being done');
  }

  await expect(
    questionBlock(page, 'What was the person doing').locator('.field__textarea'),
  ).toHaveValue(answer);
});

test('clear all data resets the session', async ({ page }) => {
  await page.goto(APP_URL);
  await chooseCase(page, { onset: /Acute single event/ });

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Clear all data' }).click();
  await expect(page.locator('.screen__title')).toContainText('What kind of case is this');
});

test('confirm all ticks the whole form cross-check at once', async ({ page }) => {
  await page.goto(APP_URL);
  await walkToScreen(page, 'Form cross-check', 30);

  await page.getByRole('button', { name: 'Confirm all' }).click();
  const boxes = page.locator('.checklist input[type="checkbox"]');
  expect(await boxes.count()).toBeGreaterThan(10);
  expect(await page.locator('.checklist input:checked').count()).toBe(await boxes.count());
});
