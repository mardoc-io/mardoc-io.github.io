/**
 * E2E regression for PR-mode mermaid stability.
 *
 * Symptom pre-fix: opening a PR with a mermaid diagram in the diff,
 * then toggling the comment sidebar closed, wiped the rendered
 * mermaid SVG. The diagram only came back on the next 30s poll tick
 * — when the `comments` prop reference changed and re-fired the
 * post-render useEffect that calls renderMermaidBlocks.
 *
 * Root cause: React 18 unconditionally re-applies innerHTML for
 * dangerouslySetInnerHTML when the prop is an inline object literal,
 * because the reconciler compares props by reference. The fix wraps
 * each block in React.memo keyed on the html string so the host
 * component bailout (`oldProps === newProps`) prevents the
 * setInnerHTML call, and mermaid's post-render DOM mutation survives.
 */
import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

test.describe("PR mode — mermaid stability across comment sidebar toggle", () => {
  test("mermaid SVG survives a comment panel open→close cycle", async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      "comment panel rail is desktop-only"
    );

    await openPullRequest(page, /getting started guide/i);

    const diagram = page.locator(".mermaid-diagram svg").first();
    await expect(diagram).toBeVisible({ timeout: 15_000 });

    // Tag the rendered SVG so we can detect if React tears down the
    // mermaid wrapper and falls back to the raw <pre><code> source.
    await page.evaluate(() => {
      const svg = document.querySelector(".mermaid-diagram svg");
      if (svg) svg.setAttribute("data-e2e-tag", "stable");
    });

    const closeBtn = page.locator('button[aria-label="Close comments"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page
        .locator("button", { hasText: /^(\d+ comments?|Comments)$/ })
        .locator("visible=true")
        .first()
        .click();
    }
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>(".mermaid-diagram svg");
      const preMermaid = document.querySelector(
        "pre > code.language-mermaid, pre > code.mermaid"
      );
      return {
        svgPresent: !!svg,
        svgTagged: svg?.getAttribute("data-e2e-tag") === "stable",
        sourceBlockBackToPre: !!preMermaid,
      };
    });

    expect(
      state,
      "after panel toggle the mermaid SVG should still be the same tagged DOM node; if <pre><code> is back, React replaced innerHTML"
    ).toEqual({
      svgPresent: true,
      svgTagged: true,
      sourceBlockBackToPre: false,
    });
  });

  test("mermaid SVG survives a comment panel close→open→close cycle", async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      "comment panel rail is desktop-only"
    );

    await openPullRequest(page, /getting started guide/i);

    const diagram = page.locator(".mermaid-diagram svg").first();
    await expect(diagram).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      const svg = document.querySelector(".mermaid-diagram svg");
      if (svg) svg.setAttribute("data-e2e-tag", "stable");
    });

    const commentsBtn = page
      .locator("button", { hasText: /^(\d+ comments?|Comments)$/ })
      .locator("visible=true")
      .first();

    await commentsBtn.click();
    await page.waitForTimeout(200);
    await commentsBtn.click();
    await page.waitForTimeout(200);
    await commentsBtn.click();
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>(".mermaid-diagram svg");
      return {
        present: !!svg,
        tagged: svg?.getAttribute("data-e2e-tag") === "stable",
      };
    });
    expect(state.present).toBe(true);
    expect(state.tagged).toBe(true);
  });
});
