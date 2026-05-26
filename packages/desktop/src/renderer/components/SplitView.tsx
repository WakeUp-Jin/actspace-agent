import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type SplitSide = "left" | "right";

type SplitPanelBounds = {
  minWidth: number;
  maxWidth: number;
};

type DragState = {
  pointerId: number;
  side: SplitSide;
  startWidth: number;
  startX: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function SplitView({
  left,
  main,
  right,
  leftWidth,
  leftHidden = false,
  rightWidth,
  leftBounds,
  rightBounds,
  minMainWidth,
  leftSeparatorLabel,
  rightSeparatorLabel,
  onContainerWidthChange,
  onLeftResize,
  onRightResize,
  onLeftKeyResize,
  onRightKeyResize,
  onLeftResizeEnd,
  onRightResizeEnd,
  onLeftSeparatorDoubleClick,
  onRightSeparatorDoubleClick
}: {
  left: ReactNode;
  main: ReactNode;
  right?: ReactNode;
  leftWidth: number;
  /** 完全隐藏左侧 pane 与分隔条；Sidebar 折叠到 hidden 态时使用。 */
  leftHidden?: boolean;
  rightWidth: number;
  leftBounds: SplitPanelBounds;
  rightBounds: SplitPanelBounds;
  minMainWidth: number;
  leftSeparatorLabel: string;
  rightSeparatorLabel: string;
  onContainerWidthChange: (width: number) => void;
  onLeftResize: (width: number) => void;
  onRightResize: (width: number) => void;
  onLeftKeyResize?: (width: number) => void;
  onRightKeyResize?: (width: number) => void;
  onLeftResizeEnd?: () => void;
  onRightResizeEnd?: () => void;
  onLeftSeparatorDoubleClick?: () => void;
  onRightSeparatorDoubleClick?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rightOpen = right !== undefined;

  function getAvailableMaxWidth(side: SplitSide): number {
    const otherPanelWidth = side === "left" ? (rightOpen ? rightWidth : 0) : leftWidth;
    const containerLimit = containerWidth > 0 ? containerWidth - otherPanelWidth - minMainWidth : Number.POSITIVE_INFINITY;
    const bounds = side === "left" ? leftBounds : rightBounds;
    return Math.max(bounds.minWidth, Math.min(bounds.maxWidth, containerLimit));
  }

  function getBoundedWidth(side: SplitSide, width: number): number {
    const bounds = side === "left" ? leftBounds : rightBounds;
    return clamp(width, bounds.minWidth, getAvailableMaxWidth(side));
  }

  function resizeSide(side: SplitSide, width: number) {
    const nextWidth = getBoundedWidth(side, width);
    if (side === "left") {
      onLeftResize(nextWidth);
      return;
    }

    onRightResize(nextWidth);
  }

  function handleSeparatorKeyDown(side: SplitSide, event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 16;
    const bounds = side === "left" ? leftBounds : rightBounds;
    const currentWidth = side === "left" ? leftWidth : rightWidth;
    let nextWidth: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
        nextWidth = side === "left" ? currentWidth - step : currentWidth + step;
        break;
      case "ArrowRight":
        nextWidth = side === "left" ? currentWidth + step : currentWidth - step;
        break;
      case "Home":
        nextWidth = bounds.minWidth;
        break;
      case "End":
        nextWidth = getAvailableMaxWidth(side);
        break;
    }

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    const boundedWidth = getBoundedWidth(side, nextWidth);
    if (side === "left") {
      (onLeftKeyResize ?? onLeftResize)(boundedWidth);
      return;
    }

    (onRightKeyResize ?? onRightResize)(boundedWidth);
  }

  function handlePointerDown(side: SplitSide, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      side,
      startWidth: side === "left" ? leftWidth : rightWidth,
      startX: event.clientX
    });
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    function publishWidth(width: number) {
      const roundedWidth = Math.round(width);
      setContainerWidth(roundedWidth);
      onContainerWidthChange(roundedWidth);
    }

    publishWidth(root.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver((entries) => {
      publishWidth(entries[0]?.contentRect.width ?? root.getBoundingClientRect().width);
    });

    resizeObserver.observe(root);
    return () => resizeObserver.disconnect();
  }, [onContainerWidthChange]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const delta = event.clientX - dragState.startX;
      const nextWidth = dragState.side === "left" ? dragState.startWidth + delta : dragState.startWidth - delta;
      resizeSide(dragState.side, nextWidth);
    }

    function endDrag(event?: PointerEvent) {
      if (event && event.pointerId !== dragState.pointerId) {
        return;
      }

      if (dragState.side === "left") {
        onLeftResizeEnd?.();
      } else {
        onRightResizeEnd?.();
      }

      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, [
    dragState,
    leftBounds,
    leftWidth,
    minMainWidth,
    onLeftResize,
    onLeftResizeEnd,
    onRightResize,
    onRightResizeEnd,
    rightBounds,
    rightOpen,
    rightWidth
  ]);

  const effectiveLeftWidth = leftHidden ? 0 : leftWidth;
  let columns: string;
  if (leftHidden) {
    columns = rightOpen ? `minmax(0, 1fr) ${rightWidth}px` : `minmax(0, 1fr)`;
  } else {
    columns = rightOpen
      ? `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`
      : `${leftWidth}px minmax(0, 1fr)`;
  }
  const leftMaxWidth = getAvailableMaxWidth("left");
  const rightMaxWidth = getAvailableMaxWidth("right");
  const style = {
    "--split-left-width": `${effectiveLeftWidth}px`,
    "--split-right-width": `${rightWidth}px`,
    gridTemplateColumns: columns
  } as CSSProperties;

  return (
    <div className={`split-view${dragState ? " is-resizing" : ""}${leftHidden ? " is-left-hidden" : ""}`} ref={rootRef} style={style}>
      {leftHidden ? null : (
        <>
          <div className="split-view-pane split-view-left">{left}</div>
          <div
            className="split-view-separator split-view-left-separator"
            role="separator"
            tabIndex={0}
            aria-label={leftSeparatorLabel}
            aria-orientation="vertical"
            aria-valuemin={leftBounds.minWidth}
            aria-valuemax={Math.round(leftMaxWidth)}
            aria-valuenow={Math.round(leftWidth)}
            onDoubleClick={onLeftSeparatorDoubleClick}
            onKeyDown={(event) => handleSeparatorKeyDown("left", event)}
            onPointerDown={(event) => handlePointerDown("left", event)}
          >
            <span aria-hidden="true" />
          </div>
        </>
      )}
      <div className="split-view-pane split-view-main">{main}</div>
      {rightOpen ? (
        <>
          <div
            className="split-view-separator split-view-right-separator"
            role="separator"
            tabIndex={0}
            aria-label={rightSeparatorLabel}
            aria-orientation="vertical"
            aria-valuemin={rightBounds.minWidth}
            aria-valuemax={Math.round(rightMaxWidth)}
            aria-valuenow={Math.round(rightWidth)}
            onDoubleClick={onRightSeparatorDoubleClick}
            onKeyDown={(event) => handleSeparatorKeyDown("right", event)}
            onPointerDown={(event) => handlePointerDown("right", event)}
          >
            <span aria-hidden="true" />
          </div>
          <div className="split-view-pane split-view-right">{right}</div>
        </>
      ) : null}
    </div>
  );
}
