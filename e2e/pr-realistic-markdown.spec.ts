/**
 * Regression: rendering a PR diff against real-shape markdown.
 *
 * Bug observed on PR #99's branch against live GitHub content: a
 * heavily-modified .md file renders with every block classified
 * `diff-block-removed` — the head side is effectively invisible and
 * the view is a sea of red. The synthetic demo PRs all happen to
 * pair cleanly, so they don't expose this.
 *
 * Fixture: merged PR #74 in this repo — a prose rewrite of
 * docs/features/037-ai-page-translation.md that inserts a new
 * "The reframe" section at the top and rewrites "Value". Captured
 * verbatim as e2e/fixtures/pr-realistic/{base,head}.md and wired
 * into mock-data via pr-regression-realistic-fixture.ts.
 *
 * Assertions express the minimum user-visible contract of a
 * working diff view: the head content is reachable, the view is
 * not 100% removed, and the added section shows up as such.
 */
import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

test.describe("PR mode — realistic markdown modification", () => {
  test("head-only content is visible and not every block is classified removed", async ({
    page,
  }) => {
    await openPullRequest(page, /rethink feature 037/i);

    // Default view is "rendered" (unified). Let the diff settle.
    await page.waitForTimeout(400);

    const counts = await page.evaluate(() => {
      const added = document.querySelectorAll(".diff-block-added").length;
      const removed = document.querySelectorAll(".diff-block-removed").length;
      const unchanged = document.querySelectorAll(
        ".rendered-block.diff-content"
      ).length;
      // Modified blocks have no unique class in the unified
      // renderer — they're just `.diff-content` that is neither
      // added, removed, nor unchanged. Derive by exclusion.
      const allDiffContent = document.querySelectorAll(".diff-content").length;
      const modified = Math.max(0, allDiffContent - added - removed - unchanged);
      return { added, removed, unchanged, modified };
    });

    // The head inserts a whole new "## The reframe" section at
    // the top of the file, with no equivalent in base. The
    // correct outcome is an Added block containing that heading
    // and its body. The bug observed against real GitHub content
    // was that block-pair matching greedily paired unrelated
    // blocks (base's "## Value" with head's "## The reframe"),
    // passed them to computeWordDiff, and emitted a single
    // "Modified" block with base+head text interleaved — the
    // head-only section never rendered as added at all.
    const addedBlockWithHeadText = page.locator(
      ".diff-block-added",
      { hasText: /The reframe/i }
    );
    await expect(
      addedBlockWithHeadText.first(),
      `the head-only "## The reframe" section must render inside a .diff-block-added element; counts=${JSON.stringify(counts)}`
    ).toBeVisible({ timeout: 5_000 });

    // Sanity: at least one diff-block-added element exists
    // somewhere in the diff (the whole-new-section insertion).
    expect(
      counts.added,
      `at least one diff-block-added element must render; got ${JSON.stringify(counts)}`
    ).toBeGreaterThan(0);

    // Guard against a common failure shape where the renderer
    // falls back to orphan-both-sides and the view becomes a sea
    // of red. For this fixture, removed-blocks should not
    // dominate.
    const totalDiffBlocks =
      counts.added + counts.removed + counts.unchanged + counts.modified;
    if (totalDiffBlocks > 0) {
      const removedRatio = counts.removed / totalDiffBlocks;
      expect(
        removedRatio,
        `removed-blocks ratio ${removedRatio.toFixed(2)} suggests orphan-both-sides fallback; counts=${JSON.stringify(counts)}`
      ).toBeLessThan(0.9);
    }

    // Shape check against the word-diff-blending bug: the
    // specific string "ValueThe reframe" should NOT appear as a
    // heading — that string only exists when base's "Value" H2
    // was force-paired with head's "The reframe" H2 and the word
    // diff concatenated them. If the block-pair matcher is
    // working, they render as two separate blocks.
    const blendedHeading = page.getByRole("heading", {
      name: /^ValueThe reframe$/i,
    });
    await expect(
      blendedHeading,
      "unrelated base/head headings must not be blended into a single Modified heading"
    ).toHaveCount(0);
  });
});
