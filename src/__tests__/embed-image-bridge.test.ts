/**
 * Tests for the VS Code embed image bridge.
 *
 * The bridge posts a "file:read-image" message to window.parent and
 * waits for a matching "file:image-data" or "file:image-error"
 * response. Tests simulate the parent by monkey-patching
 * window.parent.postMessage and dispatching synthetic message events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requestEmbedImage, __resetForTests } from "@/lib/embed-image-bridge";

function fakeParentWindow() {
  // Make window.parent a different object so the bridge thinks it's embedded.
  const realParent = window.parent;
  const mockPostMessage = vi.fn();
  const fakeParent = { postMessage: mockPostMessage } as unknown as Window;
  Object.defineProperty(window, "parent", {
    value: fakeParent,
    configurable: true,
    writable: true,
  });
  return {
    postMessage: mockPostMessage,
    restore: () => {
      Object.defineProperty(window, "parent", {
        value: realParent,
        configurable: true,
        writable: true,
      });
    },
  };
}

function dispatchMessage(data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

describe("requestEmbedImage", () => {
  let parent: ReturnType<typeof fakeParentWindow>;

  beforeEach(() => {
    __resetForTests();
    parent = fakeParentWindow();
  });

  afterEach(() => {
    parent.restore();
    __resetForTests();
  });

  it("rejects when not running in embed mode (window.parent === window)", async () => {
    parent.restore();
    await expect(requestEmbedImage("foo.png")).rejects.toThrow(/Not running in embed mode/);
  });

  it("posts a file:read-image message to the parent with path and requestId", () => {
    void requestEmbedImage("images/a.png").catch(() => {});
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    const [msg] = parent.postMessage.mock.calls[0];
    expect(msg.type).toBe("file:read-image");
    expect(msg.path).toBe("images/a.png");
    expect(typeof msg.requestId).toBe("string");
  });

  it("resolves when the parent responds with file:image-data", async () => {
    const promise = requestEmbedImage("images/a.png");
    const [msg] = parent.postMessage.mock.calls[0];
    dispatchMessage({
      type: "file:image-data",
      requestId: msg.requestId,
      data: "BASE64DATA",
      mimeType: "image/png",
    });
    const result = await promise;
    expect(result).toEqual({ data: "BASE64DATA", mimeType: "image/png" });
  });

  it("rejects when the parent responds with file:image-error", async () => {
    const promise = requestEmbedImage("images/a.png");
    const [msg] = parent.postMessage.mock.calls[0];
    dispatchMessage({
      type: "file:image-error",
      requestId: msg.requestId,
      error: "ENOENT",
    });
    await expect(promise).rejects.toThrow(/ENOENT/);
  });

  it("rejects on timeout when the parent never responds", async () => {
    vi.useFakeTimers();
    const promise = requestEmbedImage("a.png", { timeoutMs: 50 });
    vi.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow(/timed out after 50ms/);
    vi.useRealTimers();
  });

  it("ignores messages with a mismatched requestId", async () => {
    vi.useFakeTimers();
    const promise = requestEmbedImage("a.png", { timeoutMs: 50 });
    dispatchMessage({ type: "file:image-data", requestId: "some-other-id", data: "X", mimeType: "image/png" });
    // Should not resolve — still waiting.
    vi.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it("handles concurrent requests without mixing up the responses", async () => {
    const p1 = requestEmbedImage("first.png");
    const p2 = requestEmbedImage("second.png");

    const [msg1] = parent.postMessage.mock.calls[0];
    const [msg2] = parent.postMessage.mock.calls[1];
    expect(msg1.requestId).not.toBe(msg2.requestId);

    // Respond to the SECOND one first
    dispatchMessage({
      type: "file:image-data",
      requestId: msg2.requestId,
      data: "SECOND",
      mimeType: "image/png",
    });
    dispatchMessage({
      type: "file:image-data",
      requestId: msg1.requestId,
      data: "FIRST",
      mimeType: "image/png",
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.data).toBe("FIRST");
    expect(r2.data).toBe("SECOND");
  });
});
