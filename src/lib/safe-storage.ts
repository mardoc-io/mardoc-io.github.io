/**
 * Safe localStorage wrapper. Returns null / no-ops when localStorage
 * is unavailable (private browsing, restricted contexts, quota exceeded).
 */

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or access denied — silently ignore
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Access denied — silently ignore
  }
}
