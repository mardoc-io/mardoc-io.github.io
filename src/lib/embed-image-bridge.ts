/**
 * Bridge for loading local filesystem images when MarDoc runs inside
 * the VS Code webview (embed mode).
 *
 * The browser has no filesystem access, so when a markdown file
 * references `![diagram](./images/arch.png)`, the only way to render
 * it is to ask the VS Code extension to read the bytes and send them
 * back as base64. This module hides the postMessage round-trip
 * behind a promise-based API.
 *
 * Protocol:
 *   App → Extension:  { type: "file:read-image", requestId, path }
 *   Extension → App:  { type: "file:image-data", requestId, data, mimeType }
 *                  OR { type: "file:image-error", requestId, error }
 *
 * Each request has a timeout; if the extension doesn't respond within
 * a few seconds the promise rejects and the image falls back to the
 * standard failed-image placeholder.
 */

interface PendingRequest {
  resolve: (data: { data: string; mimeType: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingRequest>();
let listenerInstalled = false;
let nextRequestId = 0;

function ensureListener() {
  if (listenerInstalled) return;
  if (typeof window === "undefined") return;
  listenerInstalled = true;
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (typeof data.requestId !== "string") return;

    const req = pending.get(data.requestId);
    if (!req) return;

    if (data.type === "file:image-data") {
      clearTimeout(req.timer);
      pending.delete(data.requestId);
      req.resolve({
        data: String(data.data || ""),
        mimeType: String(data.mimeType || "application/octet-stream"),
      });
    } else if (data.type === "file:image-error") {
      clearTimeout(req.timer);
      pending.delete(data.requestId);
      req.reject(new Error(String(data.error || "Unknown embed image error")));
    }
  });
}

export interface RequestImageOptions {
  /** Timeout in ms. Default 5000. */
  timeoutMs?: number;
}

/**
 * Ask the VS Code extension to read a local image file and return
 * its base64-encoded content. Resolves to `{ data, mimeType }` or
 * rejects on timeout / error.
 */
export function requestEmbedImage(
  path: string,
  opts: RequestImageOptions = {}
): Promise<{ data: string; mimeType: string }> {
  ensureListener();

  if (typeof window === "undefined" || window.parent === window) {
    return Promise.reject(new Error("Not running in embed mode"));
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  const requestId = `embed-img-${++nextRequestId}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Embed image request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pending.set(requestId, { resolve, reject, timer });
    window.parent.postMessage(
      { type: "file:read-image", requestId, path },
      "*"
    );
  });
}

/** Test-only — clear any pending requests between test runs. */
export function __resetForTests() {
  pending.forEach((req) => {
    clearTimeout(req.timer);
    req.reject(new Error("Reset"));
  });
  pending.clear();
  nextRequestId = 0;
  listenerInstalled = false;
}
