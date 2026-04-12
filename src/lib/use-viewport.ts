"use client";

import { useEffect, useState } from "react";

export type Viewport = "mobile" | "desktop";

const MOBILE_MAX = 767;
const QUERY = `(max-width: ${MOBILE_MAX}px)`;

/**
 * Returns the current viewport bucket: "mobile" below 768px, "desktop"
 * at or above. Listens for resize / orientation changes via `matchMedia`
 * so components re-render when the user rotates or drags a desktop
 * window narrow.
 *
 * SSR-safe: returns "desktop" on the server (Next.js static export runs
 * the initial render without a window) and resolves to the true value
 * on mount. The mismatch is a single frame and only affects the static
 * prerender, which is a welcome screen with no layout cost either way.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(QUERY);
    const update = () => setViewport(mql.matches ? "mobile" : "desktop");

    update();

    // Safari <14 used addListener / removeListener; modern browsers use
    // addEventListener. Prefer the modern path and fall back.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, []);

  return viewport;
}

export function useIsMobile(): boolean {
  return useViewport() === "mobile";
}
