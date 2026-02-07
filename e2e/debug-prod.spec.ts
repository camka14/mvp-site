import { test } from '@playwright/test';

test('debug prod evaluate', async ({ page }) => {
  await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded' });
  const value = await page.evaluate(() => 1 + 1);
  console.log('value', value);
});
