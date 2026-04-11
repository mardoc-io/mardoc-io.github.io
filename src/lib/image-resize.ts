/**
 * Pure helpers for image resize: parsing user input, formatting for
 * display, and building the sized <img> tag emitted by Turndown.
 *
 * Markdown has no native size syntax (`![](url)` doesn't carry
 * dimensions), so sized images round-trip as inline HTML. GitHub
 * renders inline `<img src="..." width="..." height="...">` in
 * markdown files, and Turndown's image rule switches to this shape
 * when either dimension is set.
 *
 * Tested in image-resize.test.ts.
 */

export type ImageDimensionUnit = "px" | "%";

export interface ImageDimension {
  value: number;
  unit: ImageDimensionUnit;
}

/**
 * Parse a user-entered dimension string into a normalized form.
 *
 * Accepts:
 *   - Plain integer "300" → { value: 300, unit: "px" }
 *   - Pixel suffix "300px" / "300PX" → { value: 300, unit: "px" }
 *   - Percentage "50%" → { value: 50, unit: "%" }
 *   - Whitespace-padded versions of any of the above
 *
 * Rejects (returns null):
 *   - Empty / whitespace-only
 *   - Non-numeric
 *   - Negative or zero values
 *   - Percentages over 100
 *   - Unsupported units (em, rem, vw, vh, etc.)
 *   - Decimals for pixels (truncated to integers)
 */
export function parseImageDimension(input: string): ImageDimension | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Percentage form: digits (with optional decimal) + %
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    const value = parseFloat(pctMatch[1]);
    if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
    return { value, unit: "%" };
  }

  // Pixel form: digits (with optional decimal) + optional px suffix
  const pxMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(px)?$/i);
  if (pxMatch) {
    const raw = parseFloat(pxMatch[1]);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    // HTML width/height attributes want integers — truncate decimals.
    return { value: Math.trunc(raw), unit: "px" };
  }

  return null;
}

/**
 * Format a normalized dimension back into the display string the user
 * sees in the width/height inputs. Null becomes empty string so a
 * cleared input shows a placeholder instead of literal "null".
 */
export function formatImageDimension(dim: ImageDimension | null): string {
  if (!dim) return "";
  if (dim.unit === "%") return `${dim.value}%`;
  return `${dim.value}`;
}

/**
 * Format a dimension the way it should appear as an HTML attribute
 * value — pixels have no suffix (HTML convention), percents keep the %.
 */
function formatDimensionAttr(dim: ImageDimension): string {
  return dim.unit === "%" ? `${dim.value}%` : `${dim.value}`;
}

export interface SizedImageInput {
  src: string;
  alt: string;
  width: ImageDimension | null;
  height: ImageDimension | null;
  /** When true, wrap the rendered tag in `<div align="center">...</div>`
   *  so GitHub renders the image centered. GitHub's markdown sanitizer
   *  strips `class` and `style` from inline `<img>`, but it keeps the
   *  `align` attribute on block wrappers, so this is the clean path. */
  center?: boolean;
}

/**
 * Build an HTML `<img>` tag with the given attributes, with every
 * attribute value HTML-escaped so nothing the user typed can break
 * the tag boundary. Used by the Turndown image rule when either
 * dimension is set or the image is marked centered.
 */
export function buildSizedImageHTML(input: SizedImageInput): string {
  const parts: string[] = ["<img"];
  parts.push(`src="${escapeAttribute(input.src)}"`);
  parts.push(`alt="${escapeAttribute(input.alt)}"`);
  if (input.width) {
    parts.push(`width="${formatDimensionAttr(input.width)}"`);
  }
  if (input.height) {
    parts.push(`height="${formatDimensionAttr(input.height)}"`);
  }
  const tag = parts.join(" ") + ">";
  if (input.center) {
    return `<div align="center">${tag}</div>`;
  }
  return tag;
}

/**
 * Pre-processor that runs on showdown-rendered HTML before TipTap
 * parses it. Detects `<div align="center">` or `<p align="center">`
 * wrappers whose only meaningful child is an `<img>`, unwraps them,
 * and tags the inner image with `data-center="true"` so the Image
 * extension's parseHTML can restore the centered attribute.
 *
 * Wrappers that contain additional content (caption text, multiple
 * elements) are left alone — the user wrote something custom and the
 * editor shouldn't flatten it on round-trip.
 */
export function unwrapCenteredImages(html: string): string {
  if (!html) return html;
  // Match `<div align="center">` or `<p align="center">` containing a
  // single `<img>` (with optional surrounding whitespace). The inner
  // tag may already have attributes; we preserve them and append
  // `data-center="true"`.
  const re = /<(div|p)\s+align="center"\s*>\s*(<img\b[^>]*?\/?>)\s*<\/\1>/gi;
  return html.replace(re, (_full, _tag, imgTag: string) => {
    // Only rewrite if the captured img doesn't already have data-center
    // so idempotent passes don't duplicate the attribute.
    if (/\bdata-center\b/.test(imgTag)) return imgTag;
    // Insert data-center="true" right before the closing `>`.
    return imgTag.replace(/\s*\/?>$/, ' data-center="true">');
  });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
