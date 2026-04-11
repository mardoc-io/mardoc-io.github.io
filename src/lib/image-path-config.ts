/**
 * Per-repo image upload folder setting.
 *
 * Different projects put images in different folders — docs/images,
 * docs/assets, src/assets, public/img, etc. This module stores the
 * user's preferred target folder per repo in localStorage so the
 * paste / drag-drop upload flow can respect each project's
 * convention.
 *
 * Pure I/O — no React, no network. Tested in
 * image-path-config.test.ts.
 */

export const DEFAULT_IMAGE_FOLDER = "docs/images";

const STORAGE_PREFIX = "mardoc:image-folder:";

/**
 * Normalize a user-entered folder path. Strips leading/trailing
 * slashes, collapses runs of slashes, and rejects anything that would
 * escape the repo root (path traversal, protocols, empty). Rejected
 * inputs fall back to DEFAULT_IMAGE_FOLDER instead of throwing — the
 * caller gets a usable path either way.
 */
export function sanitizeImageFolder(input: string): string {
  if (!input) return DEFAULT_IMAGE_FOLDER;
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_IMAGE_FOLDER;

  // Reject anything that looks like an absolute URL.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return DEFAULT_IMAGE_FOLDER;

  // Strip leading/trailing slashes, collapse runs.
  const normalized = trimmed.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/+/g, "/");
  if (!normalized) return DEFAULT_IMAGE_FOLDER;

  // Reject path traversal segments.
  const segments = normalized.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return DEFAULT_IMAGE_FOLDER;

  return normalized;
}

function keyFor(repoFullName: string): string {
  return `${STORAGE_PREFIX}${repoFullName}`;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read the configured image upload folder for a repo. Returns the
 * default for missing repos, missing values, or values that fail
 * sanitization (tampered storage, old formats, etc.).
 */
export function getImageUploadFolder(repoFullName: string | undefined): string {
  if (!repoFullName) return DEFAULT_IMAGE_FOLDER;
  const storage = safeStorage();
  if (!storage) return DEFAULT_IMAGE_FOLDER;
  try {
    const raw = storage.getItem(keyFor(repoFullName));
    if (!raw) return DEFAULT_IMAGE_FOLDER;
    const sanitized = sanitizeImageFolder(raw);
    return sanitized;
  } catch {
    return DEFAULT_IMAGE_FOLDER;
  }
}

/**
 * Write the image upload folder for a repo. Empty / whitespace input
 * clears the stored value (falling back to the default on next read).
 */
export function setImageUploadFolder(
  repoFullName: string | undefined,
  value: string
): void {
  if (!repoFullName) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      storage.removeItem(keyFor(repoFullName));
      return;
    }
    const sanitized = sanitizeImageFolder(trimmed);
    storage.setItem(keyFor(repoFullName), sanitized);
  } catch {
    // ignore — storage failures are non-fatal
  }
}
