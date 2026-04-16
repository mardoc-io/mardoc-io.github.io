/**
 * Integration tests for loadAuthenticatedImages idempotency.
 *
 * The fix for the PR-mode blink is two-part:
 *   1. rewriteImageUrls emits the cached data URI when available, so
 *      the emitted HTML is byte-identical across re-renders.
 *   2. loadAuthenticatedImages skips images whose src is already a
 *      data: URI, so even if the useEffect re-fires (e.g. from a
 *      comments-prop reference change), we don't hammer the API.
 *
 * These tests drive loadAuthenticatedImages against a mocked octokit
 * to prove both guards hold.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initOctokit,
  loadAuthenticatedImages,
  rewriteImageUrls,
  __resetImageCachesForTests,
} from "@/lib/github-api";

// octokit.repos.getContent resolves with base64 content for the tests.
const MOCK_CONTENT = {
  content: "QUFBQQ==\n", // base64 of "AAAA"
  encoding: "base64" as const,
};

function mountAuthenticatedOctokit(getContent: ReturnType<typeof vi.fn>) {
  // initOctokit creates a real Octokit instance; we monkey-patch the
  // method we care about so the test doesn't hit the network.
  const octokit = initOctokit("test-token") as unknown as {
    repos: { getContent: typeof getContent };
  };
  octokit.repos.getContent = getContent;
  return octokit;
}

describe("loadAuthenticatedImages — cache + idempotency", () => {
  beforeEach(() => {
    __resetImageCachesForTests();
  });

  afterEach(() => {
    // Clear the module-scoped octokit so other tests don't see it.
    // We do this by initializing with an empty token; a simpler reset
    // would be exposed but this is good enough.
    initOctokit("");
  });

  it("fetches each image exactly once across two calls on the same DOM", async () => {
    const getContent = vi.fn().mockResolvedValue({ data: MOCK_CONTENT });
    mountAuthenticatedOctokit(getContent);

    const container = document.createElement("div");
    container.innerHTML = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );
    document.body.appendChild(container);

    // First pass: fetches the image
    await loadAuthenticatedImages(container);
    expect(getContent).toHaveBeenCalledTimes(1);

    const img = container.querySelector("img")!;
    expect(img.src.startsWith("data:image/png;base64,")).toBe(true);

    // Second pass: src is already data: — should no-op
    await loadAuthenticatedImages(container);
    expect(getContent).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
  });

  it("rewriteImageUrls emits the cached data URI after a successful load", async () => {
    const getContent = vi.fn().mockResolvedValue({ data: MOCK_CONTENT });
    mountAuthenticatedOctokit(getContent);

    const container = document.createElement("div");
    container.innerHTML = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );
    document.body.appendChild(container);

    await loadAuthenticatedImages(container);
    // Simulating a re-render: rewriteImageUrls runs again on the same
    // source markdown. Post-fix, it should emit the cached data URI
    // instead of the raw.githubusercontent.com URL.
    const reRendered = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );

    expect(reRendered).toContain("data:image/png;base64,");
    expect(reRendered).not.toMatch(/src="https:\/\/raw\.githubusercontent\.com/);

    document.body.removeChild(container);
  });

  it("the re-rendered HTML is byte-identical on subsequent renders (no DOM churn)", async () => {
    const getContent = vi.fn().mockResolvedValue({ data: MOCK_CONTENT });
    mountAuthenticatedOctokit(getContent);

    const container = document.createElement("div");
    container.innerHTML = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );
    document.body.appendChild(container);

    await loadAuthenticatedImages(container);

    const a = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );
    const b = rewriteImageUrls(
      '<img src="./diagram.png" alt="arch">',
      "acme/repo",
      "main",
      "docs/readme.md"
    );
    expect(a).toBe(b);

    document.body.removeChild(container);
  });
});
