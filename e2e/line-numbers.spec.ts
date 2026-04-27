import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

test.describe("Line numbers toggle in diff views", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!!isMobile, "line numbers button uses toolbar-btn layout");
    await openPullRequest(page, /getting started guide/i);
  });

  test("Hash button toggles line numbers on in inline diff view", async ({ page }) => {
    // Line numbers should not be visible initially
    const gutters = page.locator(".line-gutter");
    await expect(gutters).toHaveCount(0);

    // Click the Hash (#) toggle button
    await page.locator("button[title='Show line numbers']").click();

    // Line numbers should now be visible
    await expect(gutters.first()).toBeVisible({ timeout: 3_000 });

    // Each gutter should contain a number
    const firstText = await gutters.first().textContent();
    expect(Number(firstText?.trim())).toBeGreaterThan(0);
  });

  test("Hash button toggles line numbers off again", async ({ page }) => {
    await page.locator("button[title='Show line numbers']").click();
    await expect(page.locator(".line-gutter").first()).toBeVisible({ timeout: 3_000 });

    // Toggle off
    await page.locator("button[title='Hide line numbers']").click();
    await expect(page.locator(".line-gutter")).toHaveCount(0);
  });

  test("line numbers appear in side-by-side view", async ({ page }) => {
    // Enable line numbers
    await page.locator("button[title='Show line numbers']").click();
    await expect(page.locator(".line-gutter").first()).toBeVisible({ timeout: 3_000 });

    // Switch to split view
    await page.locator("button", { hasText: /^Side by Side$/ }).click();
    await page.waitForTimeout(300);

    // Line numbers should be visible in the split view too
    await expect(page.locator(".line-gutter").first()).toBeVisible({ timeout: 3_000 });
    const count = await page.locator(".line-gutter").count();
    expect(count).toBeGreaterThan(1);
  });

  test("line numbers appear in preview view", async ({ page }) => {
    await page.locator("button[title='Show line numbers']").click();
    await expect(page.locator(".line-gutter").first()).toBeVisible({ timeout: 3_000 });

    // Switch to preview
    await page.locator("button", { hasText: /^Preview$/ }).click();
    await page.waitForTimeout(300);

    await expect(page.locator(".line-gutter").first()).toBeVisible({ timeout: 3_000 });
  });
});
