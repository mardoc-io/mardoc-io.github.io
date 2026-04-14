/**
 * E2E tests for embed-mode clipboard handling.
 *
 * When MarDoc runs inside the VS Code extension's webview, the parent
 * shell's Cmd+C handling interferes with the browser's native copy
 * path: VS Code dispatches its own clipboard command against the
 * outer webview document (which has no selection because the
 * selection lives inside our cross-origin iframe), and as a side
 * effect the iframe's text selection is cleared between the two
 * keydown firings the iframe sees for a single Cmd+C press. By the
 * time the browser would fire its native `copy` event there is
 * nothing to copy, and the clipboard stays empty.
 *
 * The fix (app-context.tsx): in embed mode, a capture-phase keydown
 * listener intercepts the first Cmd+C while the selection is still
 * intact, runs document.execCommand('copy') synchronously, and
 * preventDefault()s so the parent shell's subsequent handling can't
 * clobber what we just copied.
 *
 * This spec can't reproduce VS Code's specific interference from
 * Playwright, but it does verify the embed-mode copy path works
 * end-to-end: loading the app with ?embed=true, receiving a file
 * via the init postMessage path, selecting text, pressing Cmd+C,
 * and reading the clipboard back. A regression that breaks the
 * embed-mode keydown handler or the execCommand fallback fails here.
 */
import { test, expect } from "@playwright/test";
import { waitForHydration } from "./fixtures/helpers";

test.describe("Embed mode: clipboard", () => {
  test("embed mode loads without crashing on ?embed=true", async ({ page }) => {
    // Sanity check that embed mode activates and the MarDoc app
    // renders. If this fails, the rest of the embed-mode flow is moot.
    await page.goto("/?embed=true");
    await waitForHydration(page);
    await expect(page.getByText(/MarDoc/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Cmd+C in embed mode copies the selection to the clipboard", async ({
    page,
    context,
    browserName,
  }) => {
    // Webkit in Playwright does not recognize `clipboard-write` as a
    // permission and blocks navigator.clipboard.readText() on HTTP
    // origins. The chromium run still exercises the embed-mode
    // keydown handler, which is the code path that actually failed
    // in the VS Code webview.
    test.skip(browserName === "webkit", "webkit clipboard permissions not supported");
    await context.grantPermissions(["clipboard-read"]);

    await page.goto("/?embed=true");
    await waitForHydration(page);

    // Simulate the init message the VS Code extension host sends
    // when it opens a file with "Edit with MarDoc". This is the same
    // postMessage contract documented in feature 017.
    const sentinel = `e2e-clip-${Date.now()}`;
    const fileContent = `# Sample\n\nThis is a paragraph containing the sentinel ${sentinel} that the test selects and copies.\n`;
    await page.evaluate(
      (payload) => {
        window.postMessage(payload, "*");
      },
      {
        type: "init",
        fileName: "sample.md",
        filePath: "sample.md",
        fileContent,
      }
    );

    // Wait for the editor to render the file content
    const pm = page.locator(".ProseMirror");
    await expect(pm).toBeVisible({ timeout: 10_000 });
    await expect(pm.locator("text=" + sentinel).first()).toBeVisible({
      timeout: 5_000,
    });

    // Select everything in the ProseMirror document and press Cmd+C.
    // The embed-mode handler should run execCommand('copy')
    // synchronously on this keydown and preventDefault the key.
    await pm.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+C");

    // Read the clipboard and verify it contains our sentinel. If the
    // embed-mode handler is broken or the execCommand fallback is
    // removed, this assertion fails loudly.
    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain(sentinel);
  });

  test("Cmd+W in embed mode posts a close-panel message to the parent", async ({
    page,
  }) => {
    // Guards the app-side Cmd+W bridge: in embed mode the app
    // intercepts Cmd+W, preventDefaults to stop VS Code's webview
    // focus scope from swallowing it, and posts
    // { type: 'close-panel' } to window.parent so the VS Code
    // extension host can dispose the specific panel. Playwright's
    // window.parent === window, so we can listen on window itself.
    await page.goto("/?embed=true");
    await waitForHydration(page);

    // Install a capture listener before pressing the key.
    await page.evaluate(() => {
      (window as unknown as { __closePanelCaptured: unknown }).__closePanelCaptured = null;
      window.addEventListener("message", (e: MessageEvent) => {
        if (e.data && typeof e.data === "object" && (e.data as { type?: string }).type === "close-panel") {
          (window as unknown as { __closePanelCaptured: unknown }).__closePanelCaptured = e.data;
        }
      });
    });

    // Focus the document so keydown listener is active
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+w");

    // Poll for the message — postMessage is async, the listener runs
    // in a microtask after preventDefault returns.
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __closePanelCaptured: unknown }).__closePanelCaptured
        ),
        { timeout: 2_000 }
      )
      .toEqual({ type: "close-panel" });
  });
});
