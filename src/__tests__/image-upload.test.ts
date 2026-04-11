/**
 * Tests for the image-upload pure helpers. Keeps the validation, path
 * generation, and binary-to-base64 logic testable without touching the
 * GitHub API or the DOM.
 */
import { describe, it, expect } from "vitest";
import {
  validateImageFile,
  generateImagePath,
  arrayBufferToBase64,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/image-upload";

/** Build a File-shaped object without needing a real Blob. */
function mockFile(name: string, type: string, size: number): File {
  return { name, type, size } as unknown as File;
}

describe("validateImageFile", () => {
  it("accepts png", () => {
    const r = validateImageFile(mockFile("x.png", "image/png", 1024));
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("accepts jpeg and jpg", () => {
    expect(validateImageFile(mockFile("x.jpg", "image/jpeg", 1024)).ok).toBe(true);
    expect(validateImageFile(mockFile("x.jpeg", "image/jpeg", 1024)).ok).toBe(true);
  });

  it("accepts gif", () => {
    expect(validateImageFile(mockFile("x.gif", "image/gif", 1024)).ok).toBe(true);
  });

  it("accepts webp", () => {
    expect(validateImageFile(mockFile("x.webp", "image/webp", 1024)).ok).toBe(true);
  });

  it("accepts svg", () => {
    expect(validateImageFile(mockFile("x.svg", "image/svg+xml", 1024)).ok).toBe(true);
  });

  it("rejects non-image MIME types", () => {
    const r = validateImageFile(mockFile("doc.pdf", "application/pdf", 1024));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/image/i);
  });

  it("rejects empty files", () => {
    const r = validateImageFile(mockFile("empty.png", "image/png", 0));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/i);
  });

  it("rejects files above the size limit", () => {
    const r = validateImageFile(mockFile("big.png", "image/png", MAX_IMAGE_SIZE_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large|size/i);
  });

  it("accepts a file exactly at the size limit", () => {
    const r = validateImageFile(mockFile("edge.png", "image/png", MAX_IMAGE_SIZE_BYTES));
    expect(r.ok).toBe(true);
  });
});

describe("generateImagePath", () => {
  const fixedDate = new Date("2026-04-11T09:30:45Z");

  it("uses the docs/images directory by default", () => {
    expect(generateImagePath("photo.png", fixedDate)).toMatch(/^docs\/images\//);
  });

  it("prefixes the file with a sortable date", () => {
    const path = generateImagePath("photo.png", fixedDate);
    expect(path).toContain("2026-04-11");
  });

  it("preserves the original file extension", () => {
    expect(generateImagePath("photo.png", fixedDate)).toMatch(/\.png$/);
    expect(generateImagePath("icon.svg", fixedDate)).toMatch(/\.svg$/);
    expect(generateImagePath("banner.jpeg", fixedDate)).toMatch(/\.jpeg$/);
  });

  it("sanitizes spaces and special characters in the stem", () => {
    const path = generateImagePath("My Cool Photo!.png", fixedDate);
    expect(path).not.toContain(" ");
    expect(path).not.toContain("!");
    // Should still contain something recognizable from the original name.
    expect(path).toMatch(/my-cool-photo/i);
  });

  it("lowercases the stem", () => {
    const path = generateImagePath("BigPhoto.PNG", fixedDate);
    expect(path.toLowerCase()).toBe(path);
  });

  it("handles pasted images (name often just 'image.png' or blank)", () => {
    // Clipboard paste produces File objects with name "image.png" or
    // sometimes an empty string. Both must produce valid paths.
    expect(generateImagePath("image.png", fixedDate)).toMatch(/\.png$/);
    expect(generateImagePath("", fixedDate)).toMatch(/^docs\/images\/.+/);
  });

  it("falls back to a generic extension when the original name has none", () => {
    // Paste-only files sometimes have no extension at all.
    const path = generateImagePath("screenshot", fixedDate);
    // Accept either `.png` (sensible default) or no extension at all,
    // but the path must still be a valid filename.
    expect(path.length).toBeGreaterThan("docs/images/".length);
  });

  it("includes a random suffix so simultaneous uploads don't collide", () => {
    // Two calls with the same input should still produce different paths
    // when a suffix is used — otherwise a user uploading "screenshot.png"
    // twice in a row would clobber the first image.
    const a = generateImagePath("photo.png", fixedDate);
    const b = generateImagePath("photo.png", fixedDate);
    expect(a).not.toBe(b);
  });
});

describe("arrayBufferToBase64", () => {
  it("encodes an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("encodes a single byte", () => {
    const buf = new Uint8Array([0x41]).buffer; // "A"
    expect(arrayBufferToBase64(buf)).toBe("QQ==");
  });

  it("encodes ASCII bytes (round-trip via atob)", () => {
    const text = "Hello, world!";
    const bytes = new TextEncoder().encode(text);
    const encoded = arrayBufferToBase64(bytes.buffer);
    // Decode with the native atob and verify we got the same bytes back.
    const decoded = atob(encoded);
    expect(decoded).toBe(text);
  });

  it("encodes arbitrary binary bytes (round-trip)", () => {
    // Bytes that are NOT valid UTF-8 — proves we're treating the buffer
    // as raw binary, not as a string.
    const input = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0xc0, 0x01]);
    const encoded = arrayBufferToBase64(input.buffer);
    const decoded = atob(encoded);
    for (let i = 0; i < input.length; i++) {
      expect(decoded.charCodeAt(i)).toBe(input[i]);
    }
  });

  it("encodes a large buffer without stack overflow (chunked)", () => {
    // 100 KB is well past what String.fromCharCode(...spread) can handle
    // on most browsers when spread into an argument list.
    const size = 100 * 1024;
    const input = new Uint8Array(size);
    for (let i = 0; i < size; i++) input[i] = i & 0xff;

    let encoded = "";
    expect(() => {
      encoded = arrayBufferToBase64(input.buffer);
    }).not.toThrow();
    // Decode and verify length matches.
    expect(atob(encoded).length).toBe(size);
  });
});
