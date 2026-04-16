/**
 * Image URL caching tests for the PR mode blink bug.
 *
 * In PR mode, every time a comment state change occurred, the rendered
 * block HTML was regenerated and re-inserted via dangerouslySetInnerHTML.
 * Because rewriteImageUrls always emitted the raw.githubusercontent.com
 * URL (not the fetched data: URI), the HTML string differed between
 * renders, React replaced the DOM, the browser re-decoded the image,
 * and loadAuthenticatedImages kicked off a fresh octokit fetch — a
 * visible blink on every comment interaction.
 *
 * The fix is a URL-keyed cache: once loadAuthenticatedImages resolves
 * an image to a data: URI, rewriteImageUrls uses that cached URI as
 * the emitted src. Byte-identical HTML → no DOM replacement → no blink.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  rewriteImageUrls,
  __resetImageCachesForTests,
  __setImageDataUriForTests,
} from "@/lib/github-api";

describe("rewriteImageUrls — data URI cache", () => {
  beforeEach(() => {
    __resetImageCachesForTests();
  });

  it("emits the raw.githubusercontent URL on first call (no cache yet)", () => {
    const html = '<img src="./diagram.png" alt="arch">';
    const out = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    expect(out).toContain('src="https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png"');
    expect(out).not.toContain("data:image");
  });

  it("emits the cached data URI on subsequent calls for the same image", () => {
    const rawUrl = "https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png";
    const dataUri = "data:image/png;base64,AAAA";
    __setImageDataUriForTests(rawUrl, dataUri);

    const html = '<img src="./diagram.png" alt="arch">';
    const out = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");

    expect(out).toContain(`src="${dataUri}"`);
    expect(out).not.toContain(rawUrl + '"'); // not emitted as src
  });

  it("keeps data-gh-* attributes even when emitting a cached data URI", () => {
    const rawUrl = "https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png";
    __setImageDataUriForTests(rawUrl, "data:image/png;base64,AAAA");

    const html = '<img src="./diagram.png" alt="arch">';
    const out = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");

    expect(out).toContain('data-gh-owner="acme"');
    expect(out).toContain('data-gh-repo="repo"');
    expect(out).toContain('data-gh-ref="main"');
    expect(out).toContain('data-gh-path="docs/diagram.png"');
  });

  it("produces byte-identical HTML on repeated calls once the cache is warm", () => {
    const rawUrl = "https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png";
    __setImageDataUriForTests(rawUrl, "data:image/png;base64,ZZZ");

    const html = '<img src="./diagram.png" alt="arch">';
    const first = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    const second = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    expect(first).toBe(second);
  });

  it("caches per unique raw URL — different refs get separate cache entries", () => {
    const html = '<img src="./diagram.png" alt="arch">';

    __setImageDataUriForTests(
      "https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png",
      "data:image/png;base64,MAIN"
    );

    const mainOut = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    const branchOut = rewriteImageUrls(html, "acme/repo", "feature-x", "docs/readme.md");

    expect(mainOut).toContain("data:image/png;base64,MAIN");
    // branch had no cache entry — emits raw URL, not the main-branch data URI
    expect(branchOut).toContain("https://raw.githubusercontent.com/acme/repo/feature-x/docs/diagram.png");
    expect(branchOut).not.toContain("MAIN");
  });

  it("leaves absolute URLs alone (not cached, not rewritten)", () => {
    const html = '<img src="https://example.com/external.png" alt="ext">';
    const out = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    expect(out).toContain('src="https://example.com/external.png"');
  });

  it("leaves data: URIs alone", () => {
    const html = '<img src="data:image/png;base64,XYZ" alt="inline">';
    const out = rewriteImageUrls(html, "acme/repo", "main", "docs/readme.md");
    expect(out).toContain('src="data:image/png;base64,XYZ"');
  });
});
