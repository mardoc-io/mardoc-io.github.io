/**
 * Pure helpers for the paste / drag-drop image upload flow.
 *
 * Validation, path generation, and binary-to-base64 encoding all live
 * here so they can be unit-tested without a real GitHub API or DOM.
 * The Editor hooks these up to clipboard and drag-drop events, and
 * uploads the encoded content via commitBase64FileToBranch.
 */

/** Maximum image size. GitHub's content API allows larger files (up
 * to 100 MB), but images that big blow the review workflow — a 5 MB
 * cap keeps PR attachments sane and fast to commit. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateImageFile(file: { type: string; size: number }): ValidationResult {
  if (!file.type || !ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return { ok: false, error: "File must be a png, jpeg, gif, webp, or svg image." };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const mb = (MAX_IMAGE_SIZE_BYTES / 1024 / 1024).toFixed(0);
    return { ok: false, error: `File is too large — max ${mb} MB.` };
  }
  return { ok: true };
}

/**
 * Generate a stable, collision-resistant path for an uploaded image.
 *
 * Layout: `docs/images/{YYYY-MM-DD}-{sanitized-stem}-{random}.{ext}`
 *
 *   - Date prefix keeps uploads sortable in the file tree
 *   - Random suffix prevents collisions when a user pastes the same
 *     clipboard content twice in a row (pasted screenshots always get
 *     the same name from the clipboard)
 *   - Sanitized stem matches the broad shape of the original filename
 *     but is url-safe and lowercased
 */
export function generateImagePath(originalName: string, now: Date = new Date()): string {
  const datePrefix = toISODatePrefix(now);
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  const { stem, ext } = splitName(originalName);
  const sanitizedStem = sanitizeStem(stem) || "image";
  const safeExt = ext || ".png";

  return `docs/images/${datePrefix}-${sanitizedStem}-${randomSuffix}${safeExt}`;
}

function toISODatePrefix(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function splitName(name: string): { stem: string; ext: string } {
  if (!name) return { stem: "", ext: "" };
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" }; // no extension
  return { stem: name.slice(0, dot), ext: name.slice(dot).toLowerCase() };
}

function sanitizeStem(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40); // hard cap so the final path stays reasonable
}

/**
 * Convert an ArrayBuffer to base64 without blowing the call stack.
 *
 * The obvious approach — `btoa(String.fromCharCode(...bytes))` — dies
 * on files larger than a few tens of KB because spreading the Uint8Array
 * into arguments exceeds the JS engine's argument-count limit. This
 * walks the buffer in chunks and concatenates the base64 piecewise.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return "";

  // 8 KB chunks — well under the argument-count limit on every engine,
  // still large enough that the per-chunk overhead is negligible.
  // We use .apply(null, array) instead of spread so this compiles
  // cleanly against lower iteration targets.
  const CHUNK = 8 * 1024;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}
