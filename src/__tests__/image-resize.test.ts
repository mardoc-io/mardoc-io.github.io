/**
 * Tests for the image-resize pure helpers.
 *
 * The resize feature adds width/height attributes to images in the
 * editor. The helpers here handle the three concerns that a pure
 * function can test without a real DOM:
 *
 *   1. parseImageDimension — user input string → normalized dimension
 *   2. formatImageDimension — normalized → display string
 *   3. buildSizedImageHTML — compose an <img> tag that Turndown emits
 *      when either dimension is set (markdown has no size syntax)
 */
import { describe, it, expect } from "vitest";
import {
  parseImageDimension,
  formatImageDimension,
  buildSizedImageHTML,
  type ImageDimension,
} from "@/lib/image-resize";

describe("parseImageDimension", () => {
  // ─── Valid pixel values ────────────────────────────────────────────────

  it("parses a plain integer as pixels", () => {
    expect(parseImageDimension("300")).toEqual({ value: 300, unit: "px" });
  });

  it("parses an explicit px suffix", () => {
    expect(parseImageDimension("300px")).toEqual({ value: 300, unit: "px" });
    expect(parseImageDimension("300PX")).toEqual({ value: 300, unit: "px" });
  });

  it("parses whitespace-padded input", () => {
    expect(parseImageDimension("  300px  ")).toEqual({ value: 300, unit: "px" });
  });

  // ─── Valid percentage values ───────────────────────────────────────────

  it("parses percentage", () => {
    expect(parseImageDimension("50%")).toEqual({ value: 50, unit: "%" });
  });

  it("parses 100%", () => {
    expect(parseImageDimension("100%")).toEqual({ value: 100, unit: "%" });
  });

  it("parses single-digit percentage", () => {
    expect(parseImageDimension("5%")).toEqual({ value: 5, unit: "%" });
  });

  // ─── Decimal values ────────────────────────────────────────────────────

  it("parses a decimal percentage", () => {
    expect(parseImageDimension("12.5%")).toEqual({ value: 12.5, unit: "%" });
  });

  it("truncates decimal pixel values to integers", () => {
    // HTML width/height attributes want integers — decimals would be
    // accepted but render inconsistently across browsers.
    expect(parseImageDimension("300.7px")).toEqual({ value: 300, unit: "px" });
  });

  // ─── Invalid / empty inputs ────────────────────────────────────────────

  it("returns null for empty input", () => {
    expect(parseImageDimension("")).toBeNull();
    expect(parseImageDimension("   ")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseImageDimension("auto")).toBeNull();
    expect(parseImageDimension("big")).toBeNull();
    expect(parseImageDimension("abc300")).toBeNull();
  });

  it("returns null for negative values", () => {
    // Negative widths are never valid for images.
    expect(parseImageDimension("-100")).toBeNull();
    expect(parseImageDimension("-50%")).toBeNull();
  });

  it("returns null for zero", () => {
    // A zero-width image is functionally deleting it — reject so the
    // user gets clear feedback instead of an invisible image.
    expect(parseImageDimension("0")).toBeNull();
    expect(parseImageDimension("0%")).toBeNull();
  });

  it("returns null for percentage over 100", () => {
    expect(parseImageDimension("150%")).toBeNull();
    expect(parseImageDimension("101%")).toBeNull();
  });

  it("returns null for percentage with no number", () => {
    expect(parseImageDimension("%")).toBeNull();
  });

  it("returns null for unsupported units", () => {
    expect(parseImageDimension("10em")).toBeNull();
    expect(parseImageDimension("5rem")).toBeNull();
    expect(parseImageDimension("100vw")).toBeNull();
  });
});

describe("formatImageDimension", () => {
  it("formats pixels with no suffix (HTML attribute convention)", () => {
    expect(formatImageDimension({ value: 300, unit: "px" })).toBe("300");
  });

  it("formats percentage with the % suffix", () => {
    expect(formatImageDimension({ value: 50, unit: "%" })).toBe("50%");
  });

  it("preserves decimal percentages", () => {
    expect(formatImageDimension({ value: 12.5, unit: "%" })).toBe("12.5%");
  });

  it("returns empty string for null (editor shows placeholder)", () => {
    expect(formatImageDimension(null)).toBe("");
  });
});

describe("buildSizedImageHTML", () => {
  it("builds an <img> tag with src and alt", () => {
    const out = buildSizedImageHTML({
      src: "docs/images/photo.png",
      alt: "A photo",
      width: null,
      height: null,
    });
    expect(out).toContain('src="docs/images/photo.png"');
    expect(out).toContain('alt="A photo"');
  });

  it("adds a width attribute when width is set (px)", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: "",
      width: { value: 300, unit: "px" },
      height: null,
    });
    expect(out).toContain('width="300"');
    expect(out).not.toContain("height=");
  });

  it("adds a width attribute with percent suffix", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: "",
      width: { value: 50, unit: "%" },
      height: null,
    });
    expect(out).toContain('width="50%"');
  });

  it("adds both width and height when both set", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: "both",
      width: { value: 400, unit: "px" },
      height: { value: 300, unit: "px" },
    });
    expect(out).toContain('width="400"');
    expect(out).toContain('height="300"');
  });

  it("escapes double quotes inside alt text so the tag stays valid", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: 'A "fancy" photo',
      width: null,
      height: null,
    });
    // Either HTML entity or backslash escape is acceptable — just
    // confirm there's no unescaped " that would break the attribute.
    expect(out).not.toContain('alt="A "fancy" photo"');
    expect(out).toContain("fancy");
  });

  it("escapes double quotes inside src", () => {
    const out = buildSizedImageHTML({
      src: 'x.png"; drop table',
      alt: "",
      width: null,
      height: null,
    });
    // The escaped src must not contain an unescaped " that would
    // prematurely close the src attribute.
    const srcMatch = out.match(/src="([^"]*)"/);
    expect(srcMatch).not.toBeNull();
    // The part after the quote must not be a valid attribute start.
    expect(out).not.toContain('src="x.png"; drop');
  });

  it("is a self-closing tag (HTML void element)", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: "",
      width: null,
      height: null,
    });
    // Accept either `<img ... />` or `<img ...>` — both are valid HTML.
    expect(out).toMatch(/<img[^>]*\/?>/);
  });

  it("omits empty alt gracefully", () => {
    const out = buildSizedImageHTML({
      src: "x.png",
      alt: "",
      width: null,
      height: null,
    });
    // Empty alt should still appear as alt="" for a11y (signals
    // decorative image to screen readers).
    expect(out).toContain('alt=""');
  });

  // ─── Round-trip through parse/format ──────────────────────────────────

  it("parse → format → parse is idempotent for pixel values", () => {
    const first = parseImageDimension("300")!;
    const formatted = formatImageDimension(first);
    const second = parseImageDimension(formatted);
    expect(second).toEqual(first);
  });

  it("parse → format → parse is idempotent for percentage values", () => {
    const first = parseImageDimension("50%")!;
    const formatted = formatImageDimension(first);
    const second = parseImageDimension(formatted);
    expect(second).toEqual(first);
  });
});
