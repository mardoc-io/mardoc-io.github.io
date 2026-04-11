/**
 * Tests for the pure drag-resize math. The helper takes the image's
 * starting dimensions, the total pointer delta since the drag began,
 * and a few constraints, and returns the new dimensions.
 *
 * Constraints:
 *   - lockAspectRatio: preserve width/height ratio, drive from the
 *     dimension with the larger relative change
 *   - minWidth / minHeight: floor, default 20
 *   - maxWidth / maxHeight: ceiling, optional
 */
import { describe, it, expect } from "vitest";
import { computeDragResize } from "@/lib/image-drag-resize";

describe("computeDragResize — aspect ratio unlocked", () => {
  it("zero delta returns unchanged dimensions", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 0,
      dy: 0,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });

  it("positive dx expands width only", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 50,
      dy: 0,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(450);
    expect(r.height).toBe(300);
  });

  it("positive dy expands height only", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 0,
      dy: 100,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(400);
    expect(r.height).toBe(400);
  });

  it("negative dx shrinks width", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: -100,
      dy: 0,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(300);
    expect(r.height).toBe(300);
  });

  it("combined dx and dy change both dimensions", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 60,
      dy: 40,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(460);
    expect(r.height).toBe(340);
  });
});

describe("computeDragResize — aspect ratio locked", () => {
  it("zero delta with lock returns unchanged dimensions", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 0,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
  });

  it("positive dx drives the resize and height follows the ratio", () => {
    // startRatio = 400/300 = 4/3. dx=80 → newWidth=480 → newHeight=360.
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 80,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(480);
    expect(r.height).toBe(360);
  });

  it("negative dx shrinks proportionally", () => {
    // 400/300 ratio, dx=-100 → newWidth=300 → newHeight=225.
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: -100,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(300);
    expect(r.height).toBe(225);
  });

  it("the larger relative delta wins (dy dominant)", () => {
    // startRatio = 400/300 = 1.333.
    // dx=10 → relative change 10/400 = 2.5%
    // dy=60 → relative change 60/300 = 20%  ← dominant
    // height = 360 → width = 360 * 400/300 = 480
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 10,
      dy: 60,
      lockAspectRatio: true,
    });
    expect(r.height).toBe(360);
    expect(r.width).toBe(480);
  });

  it("the larger relative delta wins (dx dominant)", () => {
    // dx=80 → 20% vs dy=10 → 3.3% → dx wins.
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 80,
      dy: 10,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(480);
    expect(r.height).toBe(360);
  });

  it("a square image maintains squareness under lock", () => {
    const r = computeDragResize({
      startWidth: 200,
      startHeight: 200,
      dx: 50,
      dy: 50,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(r.height);
  });

  it("a wide landscape image maintains aspect ratio", () => {
    // 16:9 → 1600:900. dx=320 → newWidth=1920 → newHeight=1080.
    const r = computeDragResize({
      startWidth: 1600,
      startHeight: 900,
      dx: 320,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });
});

describe("computeDragResize — minimum size clamping", () => {
  it("clamps width to minWidth when shrinking too far", () => {
    const r = computeDragResize({
      startWidth: 100,
      startHeight: 100,
      dx: -200,
      dy: 0,
      lockAspectRatio: false,
      minWidth: 20,
    });
    expect(r.width).toBe(20);
  });

  it("default minimum is 20 pixels", () => {
    const r = computeDragResize({
      startWidth: 100,
      startHeight: 100,
      dx: -200,
      dy: 0,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(20);
  });

  it("clamps height to minimum when shrinking", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 100,
      dx: 0,
      dy: -200,
      lockAspectRatio: false,
      minWidth: 20,
    });
    expect(r.height).toBe(20);
  });

  it("when locked, clamping width also clamps height proportionally", () => {
    // startRatio = 400/200 = 2. If width clamps to 40, height should
    // become 20 to maintain the ratio.
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 200,
      dx: -1000,
      dy: 0,
      lockAspectRatio: true,
      minWidth: 40,
    });
    expect(r.width).toBe(40);
    expect(r.height).toBe(20);
  });
});

describe("computeDragResize — maximum size clamping", () => {
  it("clamps width to maxWidth when expanding too far", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 10000,
      dy: 0,
      lockAspectRatio: false,
      maxWidth: 1200,
    });
    expect(r.width).toBe(1200);
  });

  it("no maxWidth = unbounded", () => {
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 5000,
      dy: 0,
      lockAspectRatio: false,
    });
    expect(r.width).toBe(5400);
  });

  it("when locked, clamping to max width keeps the aspect ratio", () => {
    // startRatio = 4/3. maxWidth=600 → newHeight should be 450.
    const r = computeDragResize({
      startWidth: 400,
      startHeight: 300,
      dx: 10000,
      dy: 0,
      lockAspectRatio: true,
      maxWidth: 600,
    });
    expect(r.width).toBe(600);
    expect(r.height).toBe(450);
  });
});

describe("computeDragResize — edge cases", () => {
  it("returns integer dimensions (HTML width/height wants integers)", () => {
    const r = computeDragResize({
      startWidth: 333,
      startHeight: 111,
      dx: 17,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });

  it("handles a zero-height input (degenerate) without NaN", () => {
    const r = computeDragResize({
      startWidth: 100,
      startHeight: 0,
      dx: 50,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(Number.isFinite(r.width)).toBe(true);
    expect(Number.isFinite(r.height)).toBe(true);
  });

  it("handles a zero-width input without NaN", () => {
    const r = computeDragResize({
      startWidth: 0,
      startHeight: 100,
      dx: 50,
      dy: 0,
      lockAspectRatio: true,
    });
    expect(Number.isFinite(r.width)).toBe(true);
    expect(Number.isFinite(r.height)).toBe(true);
  });
});
