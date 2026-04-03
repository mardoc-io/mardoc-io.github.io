"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquarePlus,
  Copy,
  Quote,
  ExternalLink,
  MessageSquare,
  Pencil,
} from "lucide-react";

interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  separator?: false;
}

interface ContextMenuSeparator {
  separator: true;
}

type MenuItem = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onComment: (selectedText: string) => void;
  onBlockComment?: (blockIndex: number) => void;
  onSuggestChange?: (selectedText: string) => void;
}

export default function ContextMenu({
  containerRef,
  onComment,
  onSuggestChange,
}: ContextMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Only intercept right-click within our container
      if (!container.contains(e.target as Node)) {
        setVisible(false);
        return;
      }

      const sel = window.getSelection();
      const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length >= 2;

      // If there's a selection, always show our custom menu
      // If no selection, also show our menu with block-level options
      e.preventDefault();
      e.stopPropagation();

      setSelectedText(hasSelection ? sel!.toString().trim() : "");
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
    },
    [containerRef]
  );

  const handleClick = useCallback(() => {
    setVisible(false);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setVisible(false);
  }, []);

  useEffect(() => {
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleContextMenu, handleClick, handleKeyDown]);

  // Adjust position to stay in viewport
  useEffect(() => {
    if (visible && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newPos = { ...position };

      if (rect.right > window.innerWidth) {
        newPos.x = window.innerWidth - rect.width - 8;
      }
      if (rect.bottom > window.innerHeight) {
        newPos.y = window.innerHeight - rect.height - 8;
      }
      if (newPos.x !== position.x || newPos.y !== position.y) {
        setPosition(newPos);
      }
    }
  }, [visible, position]);

  if (!visible) return null;

  const items: MenuItem[] = [];

  if (selectedText) {
    items.push({
      label: "Comment on selection",
      icon: <MessageSquarePlus size={14} />,
      action: () => {
        onComment(selectedText);
        setVisible(false);
      },
    });
    items.push({
      label: "Quote in comment",
      icon: <Quote size={14} />,
      action: () => {
        onComment(selectedText);
        setVisible(false);
      },
    });
    if (onSuggestChange) {
      items.push({
        label: "Suggest change",
        icon: <Pencil size={14} />,
        action: () => {
          onSuggestChange(selectedText);
          setVisible(false);
        },
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Copy text",
      icon: <Copy size={14} />,
      action: () => {
        navigator.clipboard.writeText(selectedText);
        setVisible(false);
      },
    });
    items.push({
      label: `Copy as quote`,
      icon: <Quote size={14} />,
      action: () => {
        navigator.clipboard.writeText(`> ${selectedText}`);
        setVisible(false);
      },
    });
  } else {
    items.push({
      label: "Add block comment",
      icon: <MessageSquare size={14} />,
      action: () => {
        // Trigger block-level comment on the nearest block
        setVisible(false);
      },
    });
    items.push({ separator: true });
    items.push({
      label: "Copy link to section",
      icon: <ExternalLink size={14} />,
      action: () => {
        navigator.clipboard.writeText(window.location.href);
        setVisible(false);
      },
    });
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {items.map((item, idx) => {
        if ("separator" in item && item.separator) {
          return <div key={idx} className="context-menu-separator" />;
        }
        const menuItem = item as ContextMenuItem;
        return (
          <button
            key={idx}
            className="context-menu-item"
            onClick={menuItem.action}
            disabled={menuItem.disabled}
          >
            <span className="icon">{menuItem.icon}</span>
            {menuItem.label}
          </button>
        );
      })}
    </div>
  );
}
