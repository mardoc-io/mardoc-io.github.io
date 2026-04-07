/**
 * Image round-trip tests.
 *
 * Verifies that images with data-original-src preserve their
 * original URL through the Turndown pipeline instead of outputting
 * data: or blob: URIs.
 */
import { describe, it, expect } from "vitest";
import { createTurndownService } from "@/lib/turndown";

describe("image round-trip via Turndown", () => {
  it("restores original src from data-original-src attribute", () => {
    const turndown = createTurndownService();
    const html = '<img src="data:image/png;base64,abc123" alt="diagram" data-original-src="https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png">';
    const md = turndown.turndown(html);
    expect(md).toBe("![diagram](https://raw.githubusercontent.com/acme/repo/main/docs/diagram.png)");
  });

  it("does not affect images without data-original-src", () => {
    const turndown = createTurndownService();
    const html = '<img src="https://example.com/photo.jpg" alt="photo">';
    const md = turndown.turndown(html);
    expect(md).toContain("![photo]");
    expect(md).toContain("https://example.com/photo.jpg");
  });

  it("preserves alt text", () => {
    const turndown = createTurndownService();
    const html = '<img src="data:image/png;base64,x" alt="Architecture overview" data-original-src="./images/arch.png">';
    const md = turndown.turndown(html);
    expect(md).toBe("![Architecture overview](./images/arch.png)");
  });

  it("handles empty alt text", () => {
    const turndown = createTurndownService();
    const html = '<img src="data:image/png;base64,x" alt="" data-original-src="image.png">';
    const md = turndown.turndown(html);
    expect(md).toBe("![](image.png)");
  });

  it("prefers data-original-src over data: URI", () => {
    const turndown = createTurndownService();
    // Even with a very long base64 src, the original URL is used
    const longBase64 = "data:image/png;base64," + "A".repeat(1000);
    const html = `<img src="${longBase64}" alt="img" data-original-src="docs/small.png">`;
    const md = turndown.turndown(html);
    expect(md).toBe("![img](docs/small.png)");
    expect(md).not.toContain("base64");
  });
});
