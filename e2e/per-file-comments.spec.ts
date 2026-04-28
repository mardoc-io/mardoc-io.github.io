/**
 * E2E tests for per-file comment filtering in PR review.
 *
 * Verifies that switching between files in a multi-file PR updates the
 * comment panel to show only comments for the selected file. Uses demo
 * PR #42 which has two files (docs/getting-started.md and
 * docs/contributing.md) with comments on each.
 */
import { test, expect } from "@playwright/test";
import {
  waitForHydration,
  openSidebar,
  clickInVisibleSidebar,
  clickVisibleText,
} from "./fixtures/helpers";

async function openMultiFilePR(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "PRs");
  await clickVisibleText(page, /Update getting started guide/i);
  await expect(
    page.locator("button", { hasText: /^Approve$/ }).first()
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("Per-file comment filtering", () => {
  test("comment panel shows only comments for the selected file", async ({ page }) => {
    await openMultiFilePR(page);

    // First file (getting-started.md) is selected by default.
    // It should show its 2 review comments + 1 pending = panel shows comments.
    // The comment "Great addition!" belongs to getting-started.md.
    await expect(page.locator("text=Great addition!")).toBeVisible({ timeout: 5_000 });

    // The comment from contributing.md should NOT be visible.
    await expect(page.locator("text=Can we add a section about running the test suite")).not.toBeVisible();
  });

  test("switching to second file shows only that file's comments", async ({ page }) => {
    await openMultiFilePR(page);

    // Verify first file's comment is visible
    await expect(page.locator("text=Great addition!")).toBeVisible({ timeout: 5_000 });

    // Switch to the second file via the sidebar file list
    await openSidebar(page);
    await clickInVisibleSidebar(page, "Files");
    await clickVisibleText(page, /contributing\.md/);

    // contributing.md's comment should now be visible
    await expect(
      page.locator("text=Can we add a section about running the test suite")
    ).toBeVisible({ timeout: 5_000 });

    // getting-started.md's comments should be gone
    await expect(page.locator("text=Great addition!")).not.toBeVisible();
    await expect(page.locator("text=Docker")).not.toBeVisible();
  });

  test("comment count badge reflects per-file count, not PR total", async ({ page }) => {
    await openMultiFilePR(page);

    // getting-started.md has 2 unresolved comments from review
    // The DiffViewer toolbar shows per-file count
    const commentBtn = page.locator("button", { hasText: /\d+ comments?/ }).first();
    await expect(commentBtn).toBeVisible({ timeout: 5_000 });
    const text = await commentBtn.textContent();
    expect(text).toMatch(/2 comments/);
  });
});
