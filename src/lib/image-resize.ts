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
}

/**
 * Build an HTML `<img>` tag with the given attributes, with every
 * attribute value HTML-escaped so nothing the user typed can break
 * the tag boundary. Used by the Turndown image rule when either
 * dimension is set.
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
  return parts.join(" ") + ">";
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
