"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquarePlus } from "lucide-react";

interface MobileCommentButtonProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onComment: (text: string) => void;
}

/**
 * A fixed-position "Comment on selection" button that sits at the
 * bottom of the viewport on mobile. Replaces the FloatingToolbar
 * (which fights with the native iOS/Android selection callout) with
 * a button that works WITH the OS selection UI: the user selects
 * text, sees the native Cut/Copy/Paste callout, and taps this button
 * below it to open the comment flow.
 *
 * Only visible when there's a valid selection (3+ characters) inside
 * the container. Uses `selectionchange` to track state without
 * fighting the native selection handles.
 *
 * Hidden on desktop (md:hidden) — the FloatingToolbar handles that.
 */
export default function MobileCommentButton({
  containerRef,
  onComment,
}: MobileCommentButtonProps) {
  const [hasSelection, setHasSelection] = useState(false);
  const selectionText = useRef("");

  const check = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setHasSelection(false);
      selectionText.current = "";
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 3) {
      setHasSelection(false);
      return;
    }
    const container = containerRef.current;
    if (!container) {
      setHasSelection(false);
      return;
    }
    try {
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setHasSelection(false);
        return;
      }
    } catch {
      setHasSelection(false);
      return;
    }
    selectionText.current = text;
    setHasSelection(true);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", check);
    return () => document.removeEventListener("selectionchange", check);
  }, [check]);

  if (!hasSelection) return null;

  return (
    <button
      onClick={() => {
        const text = selectionText.current;
        if (text) {
          onComment(text);
          window.getSelection()?.removeAllRanges();
          setHasSelection(false);
        }
      }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden flex items-center gap-2 px-5 py-3.5 bg-[var(--accent)] text-white text-sm font-medium rounded-full"
      style={{
        boxShadow: "0 8px 24px -4px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.1)",
        animation: "fadeInUp 0.2s ease-out",
      }}
    >
      <MessageSquarePlus size={16} />
      Comment on selection
    </button>
  );
}
