"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { List, X } from "lucide-react";
import { extractHeadings, type OutlineHeading } from "@/lib/outline";

interface OutlineProps {
  /** Current markdown — outline re-extracts on every change. */
  markdown: string;
  /** The scrollable editor container used for scroll-spy. */
  editorContainerRef: React.RefObject<HTMLElement>;
  /** Called to close the outline panel. */
  onClose: () => void;
}

/**
 * Document outline / table of contents with click-to-jump and
 * scroll-spy highlight of the currently-visible heading.
 *
 * Heading extraction is delegated to @/lib/outline (pure, tested).
 * Click-to-jump looks up the heading's rendered element inside the
 * editor container by its slug (TipTap + showdown both emit stable
 * id attributes for headings), falling back to a text-match walk if
 * the id isn't set.
 *
 * Scroll-spy uses IntersectionObserver to find the topmost visible
 * heading and highlights its outline entry.
 */
export default function Outline({ markdown, editorContainerRef, onClose }: OutlineProps) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll-spy. Observe every heading in the editor container and
  // track which one is closest to the top of the visible area.
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || headings.length === 0) return;

    const headingEls: HTMLElement[] = Array.from(
      container.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
    if (headingEls.length === 0) return;

    // Map each DOM element to a heading slug by matching text content
    // against the extracted headings. We don't rely on id attributes
    // because TipTap doesn't always set them.
    const elToSlug = new Map<Element, string>();
    for (let i = 0; i < Math.min(headingEls.length, headings.length); i++) {
      elToSlug.set(headingEls[i], headings[i].slug);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const slug = elToSlug.get(visible[0].target);
        if (slug) setActiveSlug(slug);
      },
      {
        root: container,
        // The "hot zone" is the top third of the viewport — the
        // heading whose top is in that band is the active one.
        rootMargin: "0px 0px -66% 0px",
        threshold: 0,
      }
    );

    for (const el of headingEls) observer.observe(el);
    return () => observer.disconnect();
  }, [headings, markdown, editorContainerRef]);

  const jumpTo = (h: OutlineHeading) => {
    const container = editorContainerRef.current;
    if (!container) return;
    // Try id first, then fall back to position (N-th heading of this level).
    let target: HTMLElement | null = container.querySelector(`#${CSS.escape(h.slug)}`);
    if (!target) {
      const all = Array.from(
        container.querySelectorAll<HTMLElement>(`h${h.level}`)
      );
      target = all.find((el) => (el.textContent || "").trim() === h.text) || null;
    }
    if (!target) {
      // Final fallback: match by position in the full heading list.
      const all = Array.from(
        container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
      );
      const idx = headings.findIndex((x) => x.slug === h.slug);
      if (idx >= 0 && all[idx]) target = all[idx];
    }
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSlug(h.slug);
    }
  };

  return (
    <aside
      ref={panelRef}
      className="w-full md:w-56 md:shrink-0 md:border-r md:border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col h-full overflow-hidden"
      aria-label="Document outline"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <List size={12} className="text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-primary)]">
            Outline
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          aria-label="Close outline"
          title="Close outline"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {headings.length === 0 ? (
          <p className="text-[10px] text-[var(--text-muted)] px-3 py-4 italic">
            No headings in this document. Add a <code>#</code> heading to start
            the outline.
          </p>
        ) : (
          <ul className="text-xs">
            {headings.map((h) => {
              const isActive = activeSlug === h.slug;
              return (
                <li key={h.slug}>
                  <button
                    onClick={() => jumpTo(h)}
                    className={`block w-full text-left px-3 py-1 truncate transition-colors ${
                      isActive
                        ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    }`}
                    style={{ paddingLeft: `${0.75 + (h.level - 1) * 0.75}rem` }}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
