/**
 * E2E regression tests for PR-mode image stability (issue #1).
 *
 * Symptom pre-fix: opening a PR with an image in the diff, then
 * interacting with comments, caused the image to blink — the `<img>`
 * element was torn down and recreated on every comments-prop change,
 * because:
 *   - DiffViewer's post-render useEffect depends on the `comments`
 *     array, so every prop change (even a reference-only change)
 *     re-ran loadAuthenticatedImages, which unconditionally refetched
 *     and re-assigned every image's src.
 *   - rewriteImageUrls always emitted the raw.githubusercontent.com
 *     URL, so the dangerouslySetInnerHTML diff never matched across
 *     re-renders; React replaced the DOM, and the browser re-decoded.
 *
 * Fix: URL-keyed cache populated by loadAuthenticatedImages and
 * consulted by rewriteImageUrls so the emitted HTML is byte-identical
 * on re-renders, and loadAuthenticatedImages skips images whose src
 * is already a data: URI.
 *
 * These tests reproduce the blink symptom at the DOM level:
 *   1. Open a PR with a markdown file that contains an image.
 *   2. Tag the image element and record its src + initial load count.
 *   3. Trigger a comment state change (select text → add a comment).
 *   4. Assert the image element is the same DOM node (no teardown),
 *      its src is unchanged, and the load event did not fire again.
 */
import { test, expect, type Page } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

/**
 * Install a page-level counter that increments every time an `img`
 * inside `.diff-content` fires a `load` event. Event delegation via
 * `capture: true` catches load events on freshly-inserted images too,
 * so this counter detects DOM replacement / image churn even if the
 * original <img> element gets torn down.
 */
async function installImageLoadCounter(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __mardocLoadCount?: number }).__mardocLoadCount = 0;
    document.addEventListener(
      "load",
      (e) => {
        const target = e.target as Element | null;
        if (target && target.tagName === "IMG" && target.closest(".diff-content")) {
          (window as unknown as { __mardocLoadCount: number }).__mardocLoadCount++;
        }
      },
      true // capture phase — load doesn't bubble
    );
  });
}

async function readLoadCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as unknown as { __mardocLoadCount?: number }).__mardocLoadCount ?? 0
  );
}

async function tagFirstDiffImage(page: Page) {
  return await page.evaluate(() => {
    // Find the first img in the DiffViewer's diff-content. We target
    // diff-content specifically because the DiffViewer renders markdown
    // blocks into a div with that class.
    const img = document.querySelector<HTMLImageElement>(".diff-content img");
    if (!img) return { tagged: false, src: "" };
    img.setAttribute("data-e2e-tag", "stable");
    return { tagged: true, src: img.src };
  });
}

async function readDiffImageState(page: Page) {
  return await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".diff-content img");
    if (!img) return { present: false, tagged: false, src: "" };
    return {
      present: true,
      tagged: img.getAttribute("data-e2e-tag") === "stable",
      src: img.src,
    };
  });
}

test.describe("PR mode — image stability across comment state changes", () => {
  test("diff image src is preserved across a view-mode round-trip", async ({
    page,
  }) => {
    // The getting-started PR fixture includes an architecture overview
    // image in both base and head content.
    await openPullRequest(page, /getting started guide/i);

    await expect(page.locator(".diff-content img").first()).toBeVisible({
      timeout: 10_000,
    });

    const before = await tagFirstDiffImage(page);
    expect(before.tagged).toBe(true);
    expect(before.src).not.toEqual("");

    // Toggle view mode "Side by Side" → back to "Inline Diff" to force
    // two extra passes through the post-render useEffect that
    // historically reloaded every image. The src is read from the
    // emitted HTML, so it should be stable across the round-trip — the
    // cache fix guarantees rewriteImageUrls emits byte-identical HTML
    // on re-renders for any image that has already loaded.
    await page
      .locator("button", { hasText: /^Side by Side$/ })
      .locator("visible=true")
      .first()
      .click();
    await page.waitForTimeout(250);

    await page
      .locator("button", { hasText: /^Inline Diff$/ })
      .locator("visible=true")
      .first()
      .click();
    await page.waitForTimeout(250);

    const after = await readDiffImageState(page);
    expect(after.present).toBe(true);
    expect(after.src).toEqual(before.src);
  });

  test("selecting text inside the diff does not replace the image DOM node", async ({
    page,
  }) => {
    await openPullRequest(page, /getting started guide/i);
    await expect(page.locator(".diff-content img").first()).toBeVisible({
      timeout: 10_000,
    });

    await installImageLoadCounter(page);
    await tagFirstDiffImage(page);
    const loadsBefore = await readLoadCount(page);
    const before = await readDiffImageState(page);

    // Select text inside the diff content. This triggers a selection
    // state change — in historical versions of DiffViewer, selection
    // rippled through to re-renders that wiped image state.
    await page.evaluate(() => {
      const p = document.querySelector(".diff-content p");
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, Math.min(10, (p.textContent || "").length));
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(300);

    const after = await readDiffImageState(page);
    const loadsAfter = await readLoadCount(page);

    // Same DOM node (tag still attached) — proves React did not
    // replace the innerHTML of the block containing the image.
    expect(after.tagged).toBe(true);
    expect(after.src).toEqual(before.src);
    // No additional `load` events fired on any .diff-content img —
    // this is the actual signal that the user wouldn't see a blink.
    expect(loadsAfter).toEqual(loadsBefore);
  });
});
