/**
 * Tests for BottomSheet.
 *
 * Matches MobileDrawer's contract: children always mounted, backdrop
 * and Escape close the sheet, body scroll locks while open. The sheet
 * additionally has an optional header region that stays pinned while
 * the body scrolls.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BottomSheet from "@/components/BottomSheet";

const e = React.createElement;

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function mount(props: Partial<React.ComponentProps<typeof BottomSheet>> & { open: boolean; onClose?: () => void }) {
  return render(
    e(
      BottomSheet,
      {
        open: props.open,
        onClose: props.onClose ?? (() => {}),
        header: props.header,
      } as React.ComponentProps<typeof BottomSheet>,
      e("div", null, "sheet body")
    )
  );
}

describe("BottomSheet", () => {
  it("renders children even when closed", () => {
    mount({ open: false });
    expect(screen.getByText("sheet body")).toBeTruthy();
  });

  it("translates off-screen when closed", () => {
    mount({ open: false });
    const sheet = screen.getByRole("dialog");
    expect(sheet.style.transform).toBe("translateY(100%)");
  });

  it("is at zero translate when open", () => {
    mount({ open: true });
    const sheet = screen.getByRole("dialog");
    expect(sheet.style.transform).toBe("translateY(0)");
  });

  it("fires onClose on backdrop click", () => {
    const onClose = vi.fn();
    mount({ open: true, onClose });
    const backdrop = document.querySelector('[aria-hidden="true"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose on Escape when open", () => {
    const onClose = vi.fn();
    mount({ open: true, onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when closed", () => {
    const onClose = vi.fn();
    mount({ open: false, onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open", () => {
    const { rerender } = mount({ open: false });
    expect(document.body.style.overflow).toBe("");
    rerender(
      e(
        BottomSheet,
        { open: true, onClose: () => {} },
        e("div", null, "sheet body")
      )
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("renders an optional header above the body", () => {
    render(
      e(
        BottomSheet,
        {
          open: true,
          onClose: () => {},
          header: e("div", null, "custom header"),
        } as React.ComponentProps<typeof BottomSheet>,
        e("div", null, "sheet body")
      )
    );
    expect(screen.getByText("custom header")).toBeTruthy();
    expect(screen.getByText("sheet body")).toBeTruthy();
  });
});
