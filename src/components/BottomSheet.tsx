"use client";

import { useEffect, useRef } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional header content shown above the body (stays fixed while body scrolls). */
  header?: React.ReactNode;
  /** Max height of the sheet. Defaults to 86% of viewport. */
  maxHeight?: string;
  ariaLabel?: string;
}

/**
 * A slide-up bottom sheet overlay for mobile viewports. Used to host
 * the DiffViewer's comment panel on narrow screens, where a 288px
 * right rail would eat more than the screen itself. Children are
 * always mounted so scroll state and input focus survive across
 * open/close cycles.
 *
 * Escape closes. Backdrop tap closes. Body scroll locks while open.
 * A drag handle is always visible at the top — purely decorative
 * here (no real drag-dismiss gesture yet — we want the primitive
 * to be reliable before we layer on physics).
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  header,
  maxHeight = "86%",
  ariaLabel = "Bottom sheet",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open && sheetRef.current) sheetRef.current.focus();
  }, [open]);

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
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="fixed left-0 right-0 bottom-0 z-[100] bg-[var(--surface)] border-t border-[var(--border)] outline-none flex flex-col"
        style={{
          maxHeight,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: open ? "0 -16px 40px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2 shrink-0" aria-hidden="true">
          <div
            style={{
              width: 44,
              height: 5,
              borderRadius: 3,
              background: "var(--border)",
            }}
          />
        </div>
        {header && (
          <div className="px-4 pb-2 shrink-0 border-b border-[var(--border)]">
            {header}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
