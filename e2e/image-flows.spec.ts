/**
 * E2E tests for image insertion, resize, and centering.
 *
 * Image handling spans three different surfaces in the Editor:
 *   1. Inserting an image (toolbar button → URL popover)
 *   2. Clicking an image → LinkImageBubble appears for editing
 *   3. Resize (drag handle + width/height inputs)
 *   4. Centering (checkbox → data-center → round-trip via Turndown)
 *
 * Each of these has pure-function coverage in unit tests, but none
 * were tested at the interaction level. The user reported visual
 * weirdness with the edit popover positioning — the kind of bug
 * that only shows up when a real browser lays out the element.
 *
 * These tests drive headless Chromium + WebKit against a real Next
 * dev server in demo mode.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

// Image tests manipulate the ProseMirror editor state; running them
// in parallel in the same file causes state contamination because
// the dev server's Fast Refresh can leak between workers. Serial
// within the file keeps the editor instance clean between tests.
test.describe.configure({ mode: "serial" });

// ─── Shared helpers ──────────────────────────────────────────────

async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const prsBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "PRs"
      );
      const hamburger = document.querySelector('button[aria-label="Open navigation"]');
      return !!prsBtn || !!hamburger;
    },
    { timeout: 15_000 }
  );
}

async function openSidebar(page: Page) {
  const hamburger = page.locator('button[aria-label="Open navigation"]');
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await page.waitForTimeout(350);
  }
}

async function clickInVisibleSidebar(page: Page, text: string) {
  await page
    .locator("button", { hasText: new RegExp(`^${text}$`) })
    .locator("visible=true")
    .first()
    .click();
}

async function clickVisibleText(page: Page, text: string | RegExp) {
  await page.getByText(text).locator("visible=true").first().click();
}

/**
 * Open a markdown file in the Editor. Returns the ProseMirror
 * content element for subsequent interactions.
 */
async function openMarkdownFile(page: Page, filename: string | RegExp = /README\.md/) {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await clickVisibleText(page, filename);
  const proseMirror = page.locator(".ProseMirror");
  await expect(proseMirror).toBeVisible({ timeout: 10_000 });
  return proseMirror;
}

/** Click the Add Image button in the Editor toolbar. */
async function clickAddImageButton(page: Page) {
  // The toolbar button has title="Add Image"
  await page.locator('button[title="Add Image"]').locator("visible=true").first().click();
}

/**
 * Insert an image via the toolbar button flow. Fills the URL and
 * alt inputs, then confirms.
 */
async function insertImage(page: Page, url: string, alt: string) {
  await clickAddImageButton(page);

  // The inline popover renders with an "Image URL" label above its input
  const popover = page.locator(':has-text("Image URL")').locator("visible=true").first();
  await expect(popover).toBeVisible({ timeout: 3_000 });

  // The URL and alt inputs are the only text inputs in the popover
  const urlInput = popover.locator('input[type="text"]').first();
  await urlInput.fill(url);

  // Alt input is the second text input (if visible). Some variants
  // only have the URL input — handle both.
  const inputs = popover.locator('input[type="text"]');
  const count = await inputs.count();
  if (count >= 2) {
    await inputs.nth(1).fill(alt);
  }

  // Confirm — button text is "Add Image" or "Add" inside the popover
  const addBtn = popover.locator('button', { hasText: /^Add( Image)?$/ }).last();
  await addBtn.click();

  // Popover dismisses
  await expect(popover).not.toBeVisible({ timeout: 2_000 });
}

// ─── Suite 1: Image insertion ────────────────────────────────────

test.describe("Image insertion in Editor", () => {
  test("toolbar Add Image button opens a URL/alt popover", async ({ page }) => {
    await openMarkdownFile(page);
    await clickAddImageButton(page);
    await expect(
      page.locator("text=Image URL").locator("visible=true").first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("inserting an image adds an <img> element to the ProseMirror document", async ({ page }) => {
    const pm = await openMarkdownFile(page);

    // Log what images exist before
    const beforeSrcs = await pm.locator("img").evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).src)
    );
    console.log("Images before insertion:", beforeSrcs);

    await insertImage(page, "https://example.com/test.png", "a test image");

    // The new image has the URL we set — this is the only assertion
    // we actually care about. Don't count total images because demo
    // files may include loaded images from other sources.
    const newImg = pm.locator('img[src="https://example.com/test.png"]');
    await expect(newImg).toBeVisible({ timeout: 3_000 });
    await expect(newImg).toHaveAttribute("alt", "a test image");
  });
});

// ─── Suite 2: Image edit bubble positioning ──────────────────────

test.describe("Image edit bubble (LinkImageBubble)", () => {
  test("clicking an inserted image opens the edit bubble", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/bubble.png", "bubble image");
    const img = pm.locator('img[src="https://example.com/bubble.png"]');
    await img.click();

    // The bubble shows the image URL in its preview
    await expect(
      page.locator('text=/bubble\\.png/').locator("visible=true").first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("bubble is positioned below the image within the editor container", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/position.png", "pos image");
    const img = pm.locator('img[src="https://example.com/position.png"]');
    await img.click();

    // Find the bubble's positioning wrapper — it has class "absolute z-50"
    // and contains the Edit button.
    const editBtn = page.locator('button[title="Edit"]').locator("visible=true").first();
    await expect(editBtn).toBeVisible({ timeout: 3_000 });

    // The bubble must appear below the image and inside the editor's
    // visible bounds — not clipped off the top, left, or right.
    const imgBox = await img.boundingBox();
    const bubbleHost = editBtn.locator("xpath=ancestor::div[contains(@class, 'absolute')][1]");
    const bubbleBox = await bubbleHost.boundingBox();

    expect(imgBox).toBeTruthy();
    expect(bubbleBox).toBeTruthy();
    if (!imgBox || !bubbleBox) return;

    // Bubble top is AT OR BELOW the image's bottom (with small tolerance)
    expect(bubbleBox.y).toBeGreaterThanOrEqual(imgBox.y + imgBox.height - 5);

    // Bubble is inside the viewport horizontally (never clipped off left/right)
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    if (!viewport) return;
    expect(bubbleBox.x).toBeGreaterThanOrEqual(0);
    expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(viewport.width + 5);
  });

  test("edit mode shows URL, Alt, Size, and Center fields for an image", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/edit.png", "edit me");
    await pm.locator('img[src="https://example.com/edit.png"]').click();

    // Enter edit mode
    await page.locator('button[title="Edit"]').locator("visible=true").first().click();

    // Every image edit field is present
    await expect(page.locator("text=Image URL").locator("visible=true").first()).toBeVisible();
    await expect(page.locator("text=Alt text").locator("visible=true").first()).toBeVisible();
    await expect(page.locator("text=Size").locator("visible=true").first()).toBeVisible();
    await expect(
      page.locator("text=/Center image/").locator("visible=true").first()
    ).toBeVisible();
  });
});

// ─── Suite 3: Resize via width/height inputs ─────────────────────

test.describe("Image resize via the edit bubble inputs", () => {
  test("setting a width adds the width attribute to the image", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/resize.png", "resize me");
    await pm.locator('img[src="https://example.com/resize.png"]').click();
    await page.locator('button[title="Edit"]').locator("visible=true").first().click();

    // Fill the width input. It has placeholder "Width".
    const widthInput = page.locator('input[placeholder="Width"]').locator("visible=true").first();
    await widthInput.fill("200");

    // Apply
    await page.locator('button', { hasText: /^Apply$/ }).locator("visible=true").first().click();

    // The image now has width="200"
    await expect(pm.locator('img[src="https://example.com/resize.png"]')).toHaveAttribute(
      "width",
      "200",
      { timeout: 3_000 }
    );
  });

  test("aspect lock auto-fills height when width changes", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/aspect.png", "aspect");
    const img = pm.locator('img[src="https://example.com/aspect.png"]');

    // Force a predictable natural size so the aspect ratio is determined
    await img.evaluate((el) => {
      Object.defineProperty(el, "naturalWidth", { value: 400, configurable: true });
      Object.defineProperty(el, "naturalHeight", { value: 200, configurable: true });
    });

    await img.click();
    await page.locator('button[title="Edit"]').locator("visible=true").first().click();

    const widthInput = page.locator('input[placeholder="Width"]').locator("visible=true").first();
    const heightInput = page.locator('input[placeholder="Height"]').locator("visible=true").first();

    await widthInput.fill("500");
    // Height should be auto-computed from the 2:1 aspect ratio
    await expect(heightInput).toHaveValue("250", { timeout: 2_000 });
  });
});

// ─── Suite 4: Centering an image ─────────────────────────────────

test.describe("Image centering", () => {
  test("toggling the Center checkbox sets data-center on the image", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/center.png", "center me");
    await pm.locator('img[src="https://example.com/center.png"]').click();
    await page.locator('button[title="Edit"]').locator("visible=true").first().click();

    // Toggle the Center checkbox
    const centerCheckbox = page.locator('input[type="checkbox"]').locator("visible=true").first();
    await centerCheckbox.check();

    // Apply
    await page.locator('button', { hasText: /^Apply$/ }).locator("visible=true").first().click();

    // The image now has data-center="true"
    await expect(pm.locator('img[src="https://example.com/center.png"]')).toHaveAttribute(
      "data-center",
      "true",
      { timeout: 3_000 }
    );
  });
});

// ─── Suite 5: Bubble dismissal ───────────────────────────────────

test.describe("Image edit bubble dismissal", () => {
  test("mousedown outside the bubble dismisses it", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/dismiss.png", "dismiss");
    await pm.locator('img[src="https://example.com/dismiss.png"]').click();

    // Bubble is visible
    await expect(
      page.locator('button[title="Edit"]').locator("visible=true").first()
    ).toBeVisible();

    // The bubble installs its outside-click listener via setTimeout(0),
    // so give it a tick before firing a mousedown outside.
    await page.waitForTimeout(50);

    // Fire a mousedown outside the bubble. The bubble listens for
    // `mousedown` specifically, not `click`, so dispatchEvent must fire
    // a MouseEvent of the right type on an element outside the bubble.
    await page.evaluate(() => {
      const target = document.querySelector("header") || document.body;
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    // Bubble should be gone
    await expect(page.locator('button[title="Edit"]')).toHaveCount(0, { timeout: 2000 });
  });

  test("Escape dismisses the bubble", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await insertImage(page, "https://example.com/escape.png", "escape");
    await pm.locator('img[src="https://example.com/escape.png"]').click();

    await expect(
      page.locator('button[title="Edit"]').locator("visible=true").first()
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('button[title="Edit"]')).toHaveCount(0);
  });
});
