import { test } from "@playwright/test";

test("debug prod evaluate", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const value = await page.evaluate(() => 1 + 1);
  console.log("value", value);
});
