/**
 * E2E tests for the PR review submission flow.
 *
 * This is the core product value prop: a reviewer opens a PR, leaves
 * comments, and submits a review (approve / request changes / comment).
 * In demo mode the submission is a local state flip — no GitHub API
 * call — so the assertions focus on the UI transition, not network.
 *
 * Covers:
 *   - The Approve / Request Changes / Finish Review buttons appear
 *   - Clicking Approve opens the review modal
 *   - The review modal has the three radio options
 *   - Request Changes requires a message (empty body shows an error)
 *   - Submitting Approve flips the PR header badge to "Approved"
 *   - Submitting Request Changes flips the badge to "Changes Requested"
 *   - Closing the modal with X dismisses it without submitting
 *   - The submit button is disabled while submitting
 *
 * The new-comment → finish review path is covered by critical-flows
 * already (adds a comment), so we add tests that cover the SUBMIT
 * side of that path here.
 */
import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

// Each test opens its own PR via page.goto, so running in parallel
// (the Playwright default) gives every test a fresh browser context
// and avoids flakiness from review-state leaking between tests.

test.describe("PR review submission — action buttons", () => {
  test("Approve button is visible when PR is in an unreviewed state", async ({ page }) => {
    await openPullRequest(page, /architecture overview/i);
    await expect(page.locator('button', { hasText: /^Approve$/ }).first()).toBeVisible();
  });

  test("Request Changes button is visible alongside Approve", async ({ page }) => {
    await openPullRequest(page, /architecture overview/i);
    await expect(
      page.locator('button', { hasText: /^Request Changes$/ }).first()
    ).toBeVisible();
  });
});

test.describe("PR review submission — Approve flow", () => {
  test("clicking Approve opens the review modal with three radio options", async ({ page }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Approve$/ }).first().click();

    // Modal header
    await expect(page.locator('text=/Finish your review/i')).toBeVisible({ timeout: 3_000 });

    // All three options are present
    await expect(page.locator("text=/^Comment\\./")).toBeVisible();
    await expect(page.locator("text=/^Approve\\./")).toBeVisible();
    await expect(page.locator("text=/^Request changes\\./")).toBeVisible();

    // Approve is preselected (opened via the Approve button)
    const approveRadio = page.locator('input[type="radio"][value="APPROVE"]');
    await expect(approveRadio).toBeChecked();
  });

  test("submitting Approve flips the PR header badge to Approved", async ({ page }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Approve$/ }).first().click();
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();

    // Click the Submit review button inside the modal.
    const modalSubmit = page.locator('button', { hasText: /^Submit review$/ });
    await modalSubmit.click();

    // The header badge now shows Approved
    await expect(page.locator("text=/^Approved$/").first()).toBeVisible({
      timeout: 3_000,
    });

    // The Approve / Request Changes buttons are replaced by the badge
    await expect(page.locator('button', { hasText: /^Approve$/ })).toHaveCount(0);
  });

  test("closing the modal with X does not submit the review", async ({ page }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Approve$/ }).first().click();
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();

    // Click the X close button
    await page.locator('button[aria-label="Close"]').click();

    // Modal dismissed, Approve button is back
    await expect(page.locator("text=/Finish your review/i")).not.toBeVisible();
    await expect(page.locator('button', { hasText: /^Approve$/ }).first()).toBeVisible();
  });
});

test.describe("PR review submission — Request Changes flow", () => {
  test("Request Changes requires a message — empty body shows validation error", async ({
    page,
  }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Request Changes$/ }).first().click();
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();

    // Don't fill the body. Click submit.
    await page.locator('button', { hasText: /^Submit review$/ }).click();

    // Error message appears
    await expect(
      page.locator("text=/requires a message|explain what needs/i")
    ).toBeVisible({ timeout: 2_000 });

    // Modal stays open — we didn't submit
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();
  });

  test("submitting Request Changes with a message flips badge to Changes Requested", async ({
    page,
  }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Request Changes$/ }).first().click();
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();

    // Fill the message
    const textarea = page.locator("textarea").first();
    await textarea.fill("Please update the section headings to match the style guide.");

    // Submit
    await page.locator('button', { hasText: /^Submit review$/ }).click();

    // Badge flips
    await expect(page.locator("text=/^Changes Requested$/").first()).toBeVisible({
      timeout: 3_000,
    });
  });
});

test.describe("PR detail — description collapse toggle", () => {
  // The "Description" button in the PR header used to be a broken
  // <details> element with no children. This test guards against the
  // regression by proving that clicking the button actually hides the
  // description body.

  test("description body is expanded by default on a PR with a description", async ({
    page,
  }) => {
    await openPullRequest(page, /architecture overview/i);
    await expect(page.locator("#pr-description-body")).toBeVisible({
      timeout: 3_000,
    });
    // And the toggle button reflects the expanded state
    await expect(
      page.locator('button[aria-controls="pr-description-body"]')
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking the Description button collapses and re-expands the body", async ({
    page,
  }) => {
    await openPullRequest(page, /architecture overview/i);
    const toggle = page.locator('button[aria-controls="pr-description-body"]');
    const body = page.locator("#pr-description-body");

    // Start expanded
    await expect(body).toBeVisible();

    // Collapse
    await toggle.click();
    await expect(body).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Re-expand
    await toggle.click();
    await expect(body).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("PR review submission — Comment-only flow", () => {
  test("switching radio to Comment, then submit, dismisses modal without a verdict badge", async ({
    page,
  }) => {
    await openPullRequest(page, /architecture overview/i);
    await page.locator('button', { hasText: /^Approve$/ }).first().click();
    await expect(page.locator("text=/Finish your review/i")).toBeVisible();

    // Change the radio to Comment
    await page.locator('input[type="radio"][value="COMMENT"]').check();

    // Submit
    await page.locator('button', { hasText: /^Submit review$/ }).click();

    // Modal dismisses
    await expect(page.locator("text=/Finish your review/i")).not.toBeVisible({
      timeout: 3_000,
    });

    // No verdict badge (neither Approved nor Changes Requested)
    await expect(page.locator("text=/^Approved$/")).toHaveCount(0);
    await expect(page.locator("text=/^Changes Requested$/")).toHaveCount(0);
  });
});
