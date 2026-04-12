// UTF-8 safe base64 helpers for the GitHub content API.
//
// The browser btoa/atob built-ins only speak Latin-1, so passing any string
// with characters above U+00FF (emoji, em-dashes, CJK, accented letters, …)
// throws "The string to be encoded contains characters outside of the Latin1
// range." Every file body we send to or receive from the GitHub content API
// needs to round-trip through UTF-8 bytes first.

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUtf8(b64: string): string {
  let binary: string;
  try {
    // GitHub's content API sometimes wraps base64 with newlines;
    // atob is strict about that and throws InvalidCharacterError.
    // Strip whitespace defensively before decoding.
    binary = atob(b64.replace(/\s/g, ""));
  } catch (err) {
    throw new Error(
      `base64ToUtf8: failed to decode base64 (${(err as Error).message}). ` +
      `Input length: ${b64.length}.`
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}
