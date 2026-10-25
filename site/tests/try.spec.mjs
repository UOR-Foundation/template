import { expect, test } from '@playwright/test';

test('verifies, answers add 20 22 with 42, and replays 22/22', async ({ page }, info) => {
  const errors = [];
  const foreign = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:8123/')) foreign.push(request.url());
  });

  const opened = Date.now();
  await page.goto('/');
  await expect(page.locator('#verified')).toHaveText('Verified');
  await expect(page.locator('#fingerprint')).toHaveText(/^[0-9a-f]{64}$/);

  await page.locator('#a').fill('20');
  await page.locator('#op').selectOption('add');
  await page.locator('#b').fill('22');
  await page.locator('#send').click();
  await expect(page.locator('#answer-value')).toHaveText('42');
  const firstAnswer = Date.now() - opened;

  await page.locator('#replay').click();
  await expect(page.locator('#vectors')).toHaveText('22/22 passed');

  // A refusal is the guest's, not the page's.
  await page.locator('#a').fill('9223372036854775807');
  await page.locator('#b').fill('1');
  await page.locator('#send').click();
  await expect(page.locator('#answer-value')).toHaveText('refused: overflow');

  // Phone-width pages must not scroll sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  expect(errors).toEqual([]);
  expect(foreign, 'everything loads from the page\'s own origin').toEqual([]);
  info.annotations.push({ type: 'first-answer-ms', description: String(firstAnswer) });
  console.log(`${info.project.name}: open to first answer ${firstAnswer} ms`);
});
