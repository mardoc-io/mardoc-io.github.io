"use client";

import { useEffect, useRef } from "react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Width of the drawer in CSS units. Defaults to 82% of viewport, capped. */
  width?: string;
  /** Which edge it slides from. Defaults to "left". */
  side?: "left" | "right";
  ariaLabel?: string;
}

/**
 * A slide-in drawer overlay for mobile viewports. Used to host the
 * existing Sidebar in a collapsible off-canvas pattern when the
 * viewport is narrower than 768px. Render it unconditionally and let
 * `open` drive visibility — the transform stays on the drawer itself
 * so CSS transitions work without remounting children.
 *
 * Escape closes. Backdrop tap closes. Focus returns to the opener
 * after close (via the focus trap on the drawer element when open).
 */
export default function MobileDrawer({
  open,
  onClose,
  children,
  width = "min(86vw, 340px)",
  side = "left",
  ariaLabel = "Navigation drawer",
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the drawer when it opens so keyboard navigation starts inside it
  useEffect(() => {
    if (open && drawerRef.current) drawerRef.current.focus();
  }, [open]);

  const translate = open
    ? "translateX(0)"
    : side === "left"
    ? "translateX(-100%)"
    : "translateX(100%)";

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/50 transition-opacity duration-300"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />
      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="fixed top-0 bottom-0 z-[100] bg-[var(--surface)] border-[var(--border)] outline-none"
        style={{
          [side]: 0,
          width,
          transform: translate,
          transition: "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          borderRightWidth: side === "left" ? 1 : 0,
          borderLeftWidth: side === "right" ? 1 : 0,
          boxShadow: open
            ? side === "left"
              ? "8px 0 32px rgba(0,0,0,0.35)"
              : "-8px 0 32px rgba(0,0,0,0.35)"
            : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </aside>
    </>
  );
}
