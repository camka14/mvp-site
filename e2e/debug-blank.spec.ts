import { test } from '@playwright/test';

test('debug blank', async ({ page }) => {
  await page.goto('about:blank');
  const probe = await page.evaluate(() => 1 + 1);
  console.log('probe', probe);
});
