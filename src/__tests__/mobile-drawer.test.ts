/**
 * Tests for MobileDrawer.
 *
 * Pins the core contract of the off-canvas drawer that hosts the
 * sidebar on mobile:
 *   - children are always mounted (so focus/scroll state survives)
 *   - open=false hides visually but does not unmount
 *   - backdrop click closes
 *   - Escape closes
 *   - body scroll is locked while open, restored on close
 *
 * We use React.createElement instead of JSX because the MarDoc
 * vitest config doesn't include @vitejs/plugin-react — adding it
 * would be a new dependency that needs a separate conversation.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MobileDrawer from "@/components/MobileDrawer";

const e = React.createElement;

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function mount(
  props: Partial<React.ComponentProps<typeof MobileDrawer>> & { open: boolean; onClose?: () => void },
  childText = "drawer content"
) {
  return render(
    e(
      MobileDrawer,
      {
        open: props.open,
        onClose: props.onClose ?? (() => {}),
        side: props.side,
      } as React.ComponentProps<typeof MobileDrawer>,
      e("div", null, childText)
    )
  );
}

describe("MobileDrawer", () => {
  it("renders children even when closed", () => {
    mount({ open: false });
    expect(screen.getByText("drawer content")).toBeTruthy();
  });

  it("applies an off-screen transform when closed", () => {
    mount({ open: false });
    const drawer = screen.getByRole("dialog");
    expect(drawer.style.transform).toBe("translateX(-100%)");
  });

  it("applies a zero transform when open", () => {
    mount({ open: true });
    const drawer = screen.getByRole("dialog");
    expect(drawer.style.transform).toBe("translateX(0)");
  });

  it("fires onClose when the backdrop is clicked", () => {
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

  it("does NOT fire onClose on Escape when closed", () => {
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
        MobileDrawer,
        { open: true, onClose: () => {} },
        e("div", null, "drawer content")
      )
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll on close", () => {
    const { rerender } = mount({ open: true });
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      e(
        MobileDrawer,
        { open: false, onClose: () => {} },
        e("div", null, "drawer content")
      )
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("supports a right-side variant", () => {
    mount({ open: false, side: "right" });
    const drawer = screen.getByRole("dialog");
    expect(drawer.style.transform).toBe("translateX(100%)");
  });
});
