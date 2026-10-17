import { expect, test } from "@playwright/test";

const viewports = [360, 390, 768, 1024, 1440];

for (const width of viewports) {
  test(`fits ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of ["feed", "apps", "release"]) {
      await page.goto(`/preview/design-direction.html?screen=${screen}`);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${screen} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }

    const phoneNavigation = page.getByRole("navigation", { name: "Primary navigation" });
    if (width <= 1023) {
      await expect(phoneNavigation).toBeVisible();
      expect(await phoneNavigation.locator("a").first().evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    } else {
      await expect(phoneNavigation).toBeHidden();
    }
  });
}

test("screen and theme controls remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/design-direction.html");
  await page.locator('.prototype-bar button[data-view="apps"]').click();
  await expect(page.locator("#view-apps")).toBeVisible();
  await page.locator('.switcher button[data-theme-choice="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator('.prototype-bar button[data-view="release"]').click();
  await expect(page.locator("#view-release")).toBeVisible();
});
