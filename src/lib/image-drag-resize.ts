/**
 * Pure math for drag-to-resize handles on images.
 *
 * Takes the starting dimensions + total pointer delta since the drag
 * began + constraints, returns the new dimensions. The caller is
 * responsible for DOM events, event listeners, and committing the new
 * dimensions to the TipTap node via updateAttributes.
 *
 * Tested in image-drag-resize.test.ts.
 */

export interface DragResizeInput {
  /** Image width at the moment the drag started, in pixels. */
  startWidth: number;
  /** Image height at the moment the drag started, in pixels. */
  startHeight: number;
  /** Total horizontal pointer delta since drag start. */
  dx: number;
  /** Total vertical pointer delta since drag start. */
  dy: number;
  /** When true, preserve the start width/height ratio. */
  lockAspectRatio: boolean;
  /** Minimum allowed pixel size for either dimension. Defaults to 20. */
  minWidth?: number;
  /** Maximum allowed pixel width. Unbounded when omitted. */
  maxWidth?: number;
}

export interface DragResizeOutput {
  width: number;
  height: number;
}

/**
 * Compute the new image dimensions for a drag handle in the bottom-
 * right corner. Both dimensions are clamped to `minWidth` and
 * (optionally) `maxWidth`. With `lockAspectRatio` on, the axis with
 * the larger RELATIVE change drives the resize, and the other axis
 * is computed from the original ratio so clamping stays proportional.
 */
export function computeDragResize(input: DragResizeInput): DragResizeOutput {
  const { startWidth, startHeight, dx, dy, lockAspectRatio } = input;
  const minWidth = input.minWidth ?? 20;
  const maxWidth = input.maxWidth;

  // Defensive guards: a zero-sized source has no ratio to preserve and
  // no meaningful drag response — return the deltas directly so the
  // caller gets finite numbers instead of NaN.
  if (startWidth <= 0 || startHeight <= 0) {
    return {
      width: Math.max(minWidth, Math.round(Math.max(1, startWidth) + dx)),
      height: Math.max(minWidth, Math.round(Math.max(1, startHeight) + dy)),
    };
  }

  let newWidth = startWidth + dx;
  let newHeight = startHeight + dy;

  if (lockAspectRatio) {
    const ratio = startWidth / startHeight;
    // Pick whichever axis moved more proportionally and drive from it.
    // This is the standard Figma / Photoshop corner-handle behavior:
    // the user's dominant motion wins, the other axis follows the ratio.
    const widthScale = Math.abs(newWidth - startWidth) / startWidth;
    const heightScale = Math.abs(newHeight - startHeight) / startHeight;
    if (widthScale >= heightScale) {
      newHeight = newWidth / ratio;
    } else {
      newWidth = newHeight * ratio;
    }

    // Clamp on the width axis only — height derives from width, so
    // a second independent clamp would either be redundant or would
    // break the ratio. The minWidth floor applies to width; height
    // is whatever the ratio gives.
    if (newWidth < minWidth) newWidth = minWidth;
    if (maxWidth !== undefined && newWidth > maxWidth) newWidth = maxWidth;
    newHeight = newWidth / ratio;
  } else {
    // Axes are independent — clamp each separately. The same minimum
    // floor applies to both (a 5-pixel-tall image is never what the
    // user wanted).
    if (newWidth < minWidth) newWidth = minWidth;
    if (maxWidth !== undefined && newWidth > maxWidth) newWidth = maxWidth;
    if (newHeight < minWidth) newHeight = minWidth;
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}
