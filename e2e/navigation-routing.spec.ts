/**
 * E2E tests for MarDoc's sidebar navigation + demo-mode deep linking.
 *
 * The hash router (parseHash / buildFileHash / buildPRHash) is unit
 * tested separately. These tests verify what a real user sees as they
 * navigate: clicking files swaps the editor content, clicking PRs
 * shows the diff view, the sidebar tabs toggle between Files and PRs,
 * and a deep-link URL loads the targeted file on first paint.
 *
 * Note: MarDoc's hash writing is gated on `currentRepo` being set,
 * which in demo mode happens only when a token is present. So demo
 * mode tests focus on the user-observable behavior (content swaps,
 * sidebar toggles) rather than URL polling.
 */
import { test, expect } from "@playwright/test";
import {
  clickInVisibleSidebar,
  clickVisibleText,
  openSidebar,
  openMarkdownFile,
  waitForHydration,
} from "./fixtures/helpers";

test.describe("Navigation: sidebar file switching", () => {
  test("Clicking a different file swaps the editor content", async ({ page }) => {
    await openMarkdownFile(page, /README\.md/);
    // Capture the first heading text as a baseline
    const firstHeading = await page
      .locator(".ProseMirror h1")
      .first()
      .textContent();
    expect(firstHeading).toBeTruthy();

    // On mobile the drawer auto-closes after selecting a file, so
    // reopen it to navigate to the second file. openSidebar() is a
    // no-op on desktop where the sidebar is always visible.
    await openSidebar(page);
    await clickVisibleText(page, /CHANGELOG\.md/);

    // Wait for content to swap — the new first heading should be different
    await expect
      .poll(async () => {
        const t = await page.locator(".ProseMirror h1").first().textContent();
        return t?.trim();
      }, { timeout: 3_000 })
      .not.toBe(firstHeading?.trim());

    // Editor is still visible with the new content
    await expect(page.locator(".ProseMirror")).toBeVisible();
  });

  test("Clicking a nested file under docs/ loads its content", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await openSidebar(page);
    await clickInVisibleSidebar(page, "Files");
    // The docs/ folder in the demo tree has contributing.md inside it.
    // Clicking the file name loads it regardless of whether the folder
    // is expanded by default.
    await clickVisibleText(page, /contributing\.md/);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    // The contributing doc contains a Development Setup heading
    await expect(
      page.locator(".ProseMirror", { hasText: /Development Setup/i })
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Navigation: sidebar tab toggle", () => {
  test("Files tab shows the file tree", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await openSidebar(page);
    await clickInVisibleSidebar(page, "Files");
    await expect(page.getByText(/README\.md/i).locator("visible=true").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/CHANGELOG\.md/i).locator("visible=true").first()).toBeVisible();
  });

  test("PRs tab shows the PR list", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await openSidebar(page);
    await clickInVisibleSidebar(page, "PRs");
    await expect(page.getByText(/architecture overview/i).locator("visible=true").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Switching between Files and PRs swaps the visible list", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await openSidebar(page);
    // Start on PRs
    await clickInVisibleSidebar(page, "PRs");
    await expect(page.getByText(/architecture overview/i).locator("visible=true").first()).toBeVisible({
      timeout: 5_000,
    });
    // Swap to Files
    await clickInVisibleSidebar(page, "Files");
    await expect(page.getByText(/README\.md/i).locator("visible=true").first()).toBeVisible({
      timeout: 5_000,
    });
    // Swap back to PRs — the PR list should be visible again
    await clickInVisibleSidebar(page, "PRs");
    await expect(page.getByText(/architecture overview/i).locator("visible=true").first()).toBeVisible();
  });
});

test.describe("Navigation: opening a PR from the sidebar", () => {
  test("Clicking a PR in the sidebar renders the diff view", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await openSidebar(page);
    await clickInVisibleSidebar(page, "PRs");
    await clickVisibleText(page, /architecture overview/i);
    // PR header shows the Approve button (proves we landed on PR detail)
    await expect(
      page.locator("button", { hasText: /^Approve$/ }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Navigation: hash-based deep links", () => {
  // Regression guard for a bug where opening a PR URL directly
  // (https://mardoc.app/#/owner/repo/pull/N) showed the welcome
  // screen instead of the PR. The root cause was a stale-closure
  // bug in navigateToHash's PR lookup, plus the initial-hash effect
  // short-circuiting demo mode to file routes only. Both paths now
  // flow through navigateToHash which resolves PRs synchronously if
  // they are already in prList (demo mode) and via a pending-pr
  // effect if not (authenticated deep links).
  //
  // Demo mode ships with a "Add architecture overview as HTML
  // document" PR at #37. Any valid owner/repo prefix resolves
  // because demo mode does not validate the repo name against
  // mock data.

  test("deep link /#/owner/repo/pull/N opens the PR directly", async ({ page }) => {
    await page.goto("/#/mardoc/demo/pull/37");
    await waitForHydration(page);
    // The PR header has an Approve button — that proves the PR view
    // rendered instead of the welcome screen.
    await expect(
      page.locator("button", { hasText: /^Approve$/ }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("deep link to a non-existent PR falls back to welcome without crashing", async ({ page }) => {
    await page.goto("/#/mardoc/demo/pull/99999");
    await waitForHydration(page);
    // No PR matches — the app should stay on the welcome screen,
    // not show a blank page or crash. We assert the welcome copy is
    // visible which also proves the app hydrated successfully.
    await expect(
      page.getByText(/Welcome to/i).locator("visible=true").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("deep link /#/owner/repo/blob/branch/file.md opens the file", async ({ page }) => {
    await page.goto("/#/mardoc/demo/blob/main/README.md");
    await waitForHydration(page);
    // The ProseMirror editor surface is visible when the file loads
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10_000 });
    // And the README's h1 text renders
    await expect(
      page.locator(".ProseMirror h1").first()
    ).toBeVisible();
  });
});
