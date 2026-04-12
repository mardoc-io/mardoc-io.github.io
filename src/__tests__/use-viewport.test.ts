/**
 * Tests for useViewport / useIsMobile.
 *
 * Pins the contract that every mobile-aware component in MarDoc will
 * depend on: the hook must (a) return "mobile" below 768px and
 * "desktop" at or above, (b) re-render when the viewport crosses the
 * breakpoint, and (c) not crash when matchMedia is shaped like the
 * modern or legacy API.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewport, useIsMobile } from "@/lib/use-viewport";

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(max-width: 767px)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: (cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeListener: (cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
  };
  const mock = vi.fn().mockReturnValue(mql);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: mock,
  });
  const fire = (matches: boolean) => {
    mql.matches = matches;
    listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
  };
  return { mql, fire, mock };
}

describe("useViewport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'desktop' when matchMedia says the viewport is wide", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe("desktop");
  });

  it("returns 'mobile' when matchMedia says the viewport is narrow", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe("mobile");
  });

  it("re-renders when the viewport crosses the breakpoint", () => {
    const { fire } = mockMatchMedia(false);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe("desktop");
    act(() => fire(true));
    expect(result.current).toBe("mobile");
    act(() => fire(false));
    expect(result.current).toBe("desktop");
  });

  it("prefers addEventListener over the legacy addListener when both exist", () => {
    const { mql } = mockMatchMedia(false);
    const modernAdd = vi.spyOn(mql, "addEventListener");
    const legacyAdd = vi.spyOn(mql, "addListener");
    renderHook(() => useViewport());
    expect(modernAdd).toHaveBeenCalledTimes(1);
    expect(legacyAdd).not.toHaveBeenCalled();
  });

  it("cleans up the listener on unmount", () => {
    const { mql } = mockMatchMedia(true);
    const remove = vi.spyOn(mql, "removeEventListener");
    const { unmount } = renderHook(() => useViewport());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("useIsMobile", () => {
  it("is true when the viewport is mobile", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("is false when the viewport is desktop", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
