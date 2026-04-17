/**
 * Regression for the VS Code embed `__local__` image bug.
 *
 * When a file is opened via the VS Code extension (drag-drop or the
 * "open folder" flow), `applyInitData` in app-context prepends a
 * `__local__/` scope marker to the workspace-relative path to
 * distinguish local-file scope from GitHub-repo scope in the draft
 * store. The marker is purely an app concept — it is NOT a real
 * directory on disk.
 *
 * Before this fix, loadEmbedLocalImages passed the prefix straight
 * through to resolvePath and then on to the extension via
 * requestEmbedImage. A markdown file like
 *   `__local__/docs/guide.md`  referencing  `./images/arch.png`
 * asked the extension for `__local__/docs/images/arch.png` — which
 * is not a real path on disk, so the image rendered broken.
 *
 * The fix strips the `__local__/` prefix from currentFilePath before
 * resolving, so the extension receives the real workspace-relative
 * path (`docs/images/arch.png`).
 *
 * A companion fix in Editor.tsx gates `rewriteImageUrls` on
 * `!filePath.startsWith("__local__/")`. Local files leave their
 * <img src> relative and this loader handles them; only GitHub-backed
 * files get rewritten to raw.githubusercontent.com.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/embed-image-bridge", () => ({
  requestEmbedImage: vi
    .fn()
    .mockResolvedValue({ data: "QUFBQQ==", mimeType: "image/png" }),
}));

import { loadEmbedLocalImages } from "@/lib/github-api";
import { requestEmbedImage } from "@/lib/embed-image-bridge";

const mockedRequest = requestEmbedImage as unknown as ReturnType<typeof vi.fn>;

describe("loadEmbedLocalImages — __local__ path handling", () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, "parent");

  beforeEach(() => {
    mockedRequest.mockClear();
    // loadEmbedLocalImages early-returns when window.parent === window
    // (i.e. not embedded). Stub so the function runs.
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: {} as Window,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalParent) {
      Object.defineProperty(window, "parent", originalParent);
    }
  });

  it("strips the __local__/ prefix before asking the extension", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<img src="./images/arch.png" alt="arch">';

    await loadEmbedLocalImages(container, "__local__/docs/guide.md");

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(mockedRequest).toHaveBeenCalledWith("docs/images/arch.png");
  });

  it("handles files at the workspace root (no directory) under __local__/", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<img src="./logo.png">';

    await loadEmbedLocalImages(container, "__local__/README.md");

    expect(mockedRequest).toHaveBeenCalledWith("logo.png");
  });

  it("does not modify paths that do not start with __local__/", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<img src="./images/arch.png">';

    await loadEmbedLocalImages(container, "docs/guide.md");

    expect(mockedRequest).toHaveBeenCalledWith("docs/images/arch.png");
  });

  it("resolves ../ paths correctly after stripping the prefix", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<img src="../assets/diagram.png">';

    await loadEmbedLocalImages(container, "__local__/docs/guide/intro.md");

    expect(mockedRequest).toHaveBeenCalledWith("docs/assets/diagram.png");
  });
});
