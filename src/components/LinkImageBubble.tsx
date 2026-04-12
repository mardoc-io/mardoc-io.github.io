"use client";

import React, { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  Pencil,
  Trash2,
  ExternalLink,
  Unlink,
  Link2,
  Link2Off,
} from "lucide-react";
import { parseImageDimension, formatImageDimension } from "@/lib/image-resize";
import { computeDragResize } from "@/lib/image-drag-resize";

// ─── Link / Image Edit Bubble ───────────────────────────────────────────

export interface BubbleTarget {
  type: "link" | "image";
  href: string;
  alt?: string;
  element: HTMLElement;
  // For images: the current width/height attribute values (raw strings
  // like "300" or "50%"), passed through so the editing popover shows
  // what's already set instead of starting blank.
  width?: string;
  height?: string;
  // Whether the image is currently marked centered (data-center="true").
  center?: boolean;
}

export interface LinkImageBubbleProps {
  containerRef: React.RefObject<HTMLElement | null>;
  editor: Editor | null;
  target: BubbleTarget | null;
  onDismiss: () => void;
  onFollowLink: (href: string) => void;
}

export default function LinkImageBubble({
  containerRef,
  editor,
  target,
  onDismiss,
  onFollowLink,
}: LinkImageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editCenter, setEditCenter] = useState(false);
  const [lockAspect, setLockAspect] = useState(true);
  // Drag-to-resize state. Captured on mousedown on the handle, read on
  // mousemove. dragStart is non-null while a drag is active.
  const dragStart = useRef<{
    startWidth: number;
    startHeight: number;
    startX: number;
    startY: number;
  } | null>(null);
  // Natural image aspect ratio (intrinsic width / height) captured from
  // the rendered <img>. Used to auto-fill the other dimension when the
  // aspect lock is on.
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Reset edit state when target changes
  useEffect(() => {
    setEditing(false);
  }, [target]);

  // Dismiss on Escape or click outside
  useEffect(() => {
    if (!target) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        setEditing(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("keydown", handleKey);
    // Use setTimeout so the current click doesn't immediately dismiss
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
      clearTimeout(timer);
    };
  }, [target, onDismiss]);

  if (!target || !editor) return null;

  const container = containerRef.current;
  if (!container) return null;

  // Dismiss if the target element was removed from the DOM (stale ref)
  if (!document.contains(target.element)) {
    // Can't call onDismiss during render — schedule it
    requestAnimationFrame(onDismiss);
    return null;
  }

  const rect = target.element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const bubbleWidth = 280;
  const top = rect.bottom - containerRect.top + 6;
  const rawLeft = rect.left - containerRect.left + rect.width / 2 - bubbleWidth / 2;
  const left = Math.max(0, Math.min(rawLeft, containerRect.width - bubbleWidth));

  const startEdit = () => {
    setEditUrl(target.href);
    setEditAlt(target.alt || "");
    setEditWidth(target.width || "");
    setEditHeight(target.height || "");
    setEditCenter(!!target.center);

    // Capture the natural aspect ratio of the rendered <img> so the
    // aspect lock can drive one input from the other. Fall back to the
    // displayed dimensions if naturalWidth/Height aren't available yet.
    if (target.type === "image" && target.element instanceof HTMLImageElement) {
      const img = target.element;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        setNaturalRatio(w / h);
      } else {
        setNaturalRatio(null);
      }
    }

    setEditing(true);
  };

  // When the aspect lock is on and the user types in one field, auto-
  // fill the other based on the natural ratio. Only applies when both
  // sides are pure pixel values — percentage mixes don't have a
  // meaningful aspect relationship.
  const handleWidthChange = (raw: string) => {
    setEditWidth(raw);
    if (!lockAspect || !naturalRatio) return;
    const parsed = parseImageDimension(raw);
    if (parsed && parsed.unit === "px") {
      const h = Math.round(parsed.value / naturalRatio);
      setEditHeight(String(h));
    } else if (parsed && parsed.unit === "%") {
      setEditHeight(`${parsed.value}%`);
    }
  };
  const handleHeightChange = (raw: string) => {
    setEditHeight(raw);
    if (!lockAspect || !naturalRatio) return;
    const parsed = parseImageDimension(raw);
    if (parsed && parsed.unit === "px") {
      const w = Math.round(parsed.value * naturalRatio);
      setEditWidth(String(w));
    } else if (parsed && parsed.unit === "%") {
      setEditWidth(`${parsed.value}%`);
    }
  };

  const applyEdit = () => {
    if (target.type === "link") {
      // Update the link href — select the link node, then set new href
      const { from, to } = editor.state.selection;
      editor.chain().focus()
        .extendMarkRange("link")
        .setLink({ href: editUrl })
        .run();
      // Restore selection position
      editor.commands.setTextSelection({ from, to });
    } else {
      // Update image src + alt + dimensions. parseImageDimension
      // normalizes each value; invalid input falls back to null which
      // means "remove the attribute" so the image reverts to natural
      // size.
      const widthParsed = parseImageDimension(editWidth);
      const heightParsed = parseImageDimension(editHeight);
      const attrs: Record<string, string | boolean | null> = {
        src: editUrl,
        alt: editAlt,
        width: widthParsed ? formatImageDimension(widthParsed) : null,
        height: heightParsed ? formatImageDimension(heightParsed) : null,
        center: editCenter,
      };
      editor.chain().focus().setImage(attrs as any).run();

      // setImage in TipTap's Image extension ignores non-standard
      // attributes on some versions. Force width/height/center via
      // updateAttributes on the current node as a safety net.
      editor
        .chain()
        .focus()
        .updateAttributes("image", {
          width: attrs.width,
          height: attrs.height,
          center: attrs.center,
        })
        .run();
    }
    onDismiss();
    setEditing(false);
  };

  const remove = () => {
    if (target.type === "link") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      // Delete the image node
      editor.chain().focus().deleteSelection().run();
    }
    onDismiss();
    setEditing(false);
  };

  // Drag-to-resize handlers. On mousedown we snapshot the image's
  // current rendered dimensions and the pointer position, then
  // listen for mousemove / mouseup at the window level so the drag
  // keeps working even if the pointer leaves the handle element.
  const onDragStart = (e: React.MouseEvent) => {
    if (target.type !== "image") return;
    if (!(target.element instanceof HTMLImageElement)) return;
    e.preventDefault();
    e.stopPropagation();
    const img = target.element;
    // Use rendered bounding-box dimensions as the starting point so
    // drag math matches what the user sees. Fall back to natural size.
    const rect = img.getBoundingClientRect();
    dragStart.current = {
      startWidth: Math.round(rect.width) || img.naturalWidth || 0,
      startHeight: Math.round(rect.height) || img.naturalHeight || 0,
      startX: e.clientX,
      startY: e.clientY,
    };
    const onMove = (ev: MouseEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const next = computeDragResize({
        startWidth: start.startWidth,
        startHeight: start.startHeight,
        dx: ev.clientX - start.startX,
        dy: ev.clientY - start.startY,
        lockAspectRatio: lockAspect,
      });
      // Push new dimensions into the image node's attributes. The
      // node is whatever is currently selected — we assume the click
      // that opened the bubble also selected the image.
      editor
        .chain()
        .updateAttributes("image", {
          width: String(next.width),
          height: String(next.height),
        })
        .run();
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Drag handle position — only for image targets. Rendered absolute
  // in the same coordinate space as the bubble, positioned on the
  // image's bottom-right corner so the user can drag it to resize.
  const showHandle = target.type === "image";
  const handleSize = 12;
  const handleTop =
    rect.bottom - containerRect.top - handleSize / 2;
  const handleLeft =
    rect.right - containerRect.left - handleSize / 2;

  return (
    <>
      {showHandle && (
        <div
          className="absolute z-50 bg-[var(--accent)] border-2 border-white dark:border-[var(--surface)] rounded-sm shadow-md cursor-nwse-resize hover:scale-125 transition-transform"
          style={{
            top: handleTop,
            left: handleLeft,
            width: handleSize,
            height: handleSize,
          }}
          onMouseDown={onDragStart}
          title="Drag to resize"
          aria-label="Resize image"
        />
      )}
    <div
      ref={bubbleRef}
      className="absolute z-50"
      style={{ top, left, minWidth: 280 }}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-2"
        style={{ animation: "fadeInUp 0.1s ease-out" }}
      >
        {editing ? (
          <div className="space-y-2 p-1">
            <div>
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                {target.type === "link" ? "URL" : "Image URL"}
              </label>
              <input
                autoFocus
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyEdit();
                  if (e.key === "Escape") { setEditing(false); }
                }}
                className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {target.type === "image" && (
              <>
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                    Alt text
                  </label>
                  <input
                    type="text"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyEdit();
                      if (e.key === "Escape") { setEditing(false); }
                    }}
                    className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                {/* Width / height inputs with an aspect-lock toggle
                    between them. Blank means "natural size" — the
                    attribute gets removed on apply. */}
                <div>
                  <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                    Size
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editWidth}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyEdit();
                        if (e.key === "Escape") { setEditing(false); }
                      }}
                      placeholder="Width"
                      className="w-20 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
                      title="Width in pixels (e.g. 300) or percent (e.g. 50%)"
                    />
                    <button
                      type="button"
                      onClick={() => setLockAspect((v) => !v)}
                      className={`p-1 rounded transition-colors ${
                        lockAspect
                          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                      }`}
                      title={lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                      aria-pressed={lockAspect}
                    >
                      {lockAspect ? <Link2 size={12} /> : <Link2Off size={12} />}
                    </button>
                    <input
                      type="text"
                      value={editHeight}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyEdit();
                        if (e.key === "Escape") { setEditing(false); }
                      }}
                      placeholder="Height"
                      className="w-20 text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
                      title="Height in pixels (e.g. 200) or percent (e.g. 50%)"
                    />
                    <span className="text-[9px] text-[var(--text-muted)] ml-1">
                      px or %
                    </span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editCenter}
                      onChange={(e) => setEditCenter(e.target.checked)}
                    />
                    <span>
                      Center image{" "}
                      <span className="text-[var(--text-muted)]">
                        (wraps in {"<div align=\"center\">"})
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="text-[10px] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyEdit}
                disabled={!editUrl.trim()}
                className="text-[10px] px-2.5 py-1 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-xs text-[var(--text-secondary)] font-mono truncate px-1 max-w-[180px]" title={target.href}>
              {target.type === "image" ? "🖼 " : ""}{target.href || "(no url)"}
            </span>
            <button
              onClick={startEdit}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] rounded transition-colors"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            {target.type === "link" && (
              <button
                onClick={() => { onFollowLink(target.href); onDismiss(); }}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] rounded transition-colors"
                title="Follow link"
              >
                <ExternalLink size={13} />
              </button>
            )}
            <button
              onClick={remove}
              className="p-1.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--surface-hover)] rounded transition-colors"
              title={target.type === "link" ? "Remove link" : "Remove image"}
            >
              {target.type === "link" ? <Unlink size={13} /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
