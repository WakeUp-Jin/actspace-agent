import { Download, Maximize, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../ui/IconButton";
import {
  instantiateMermaidSvg,
  nextMermaidInstanceId,
  type MermaidRenderResult,
  type MermaidThemePreset,
} from "./mermaid-renderer";

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const ZOOM_MAX = 5;
const VIEWPORT_PADDING = 48;
const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Fit never upscales: small diagrams open at 100%, large ones shrink to the viewport. */
export function fitZoom(viewport: { width: number; height: number }, diagram: { width: number; height: number }): number {
  if (viewport.width <= 0 || viewport.height <= 0 || diagram.width <= 0 || diagram.height <= 0) return 1;
  const fit = Math.min(1, (viewport.width - VIEWPORT_PADDING) / diagram.width, (viewport.height - VIEWPORT_PADDING) / diagram.height);
  return Math.max(0.05, fit);
}

/** Next preset step in `direction`, with the fit level treated as one of the steps. */
export function stepZoom(current: number, direction: 1 | -1, fit: number): number {
  const minimum = Math.min(ZOOM_STEPS[0], fit);
  const steps = [...new Set([...ZOOM_STEPS, fit])].sort((a, b) => a - b);
  const next = direction > 0
    ? steps.find((step) => step > current + 0.001)
    : [...steps].reverse().find((step) => step < current - 0.001);
  return Math.min(ZOOM_MAX, Math.max(minimum, next ?? current));
}

type ZoomAnchor = { x: number; y: number; from: number };

/**
 * Full-window diagram viewer: opens fitted to the window, zooms with the
 * buttons, keyboard (+ / - / 0) or Ctrl/⌘ + wheel around the cursor, and pans
 * by dragging or with the scrollbars.
 */
export function MermaidPreviewDialog({ result, theme, onClose, onDownload }: {
  result: MermaidRenderResult;
  theme: MermaidThemePreset;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [instanceId] = useState(nextMermaidInstanceId);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<ZoomAnchor | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; pointerId: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const zoomTo = useCallback((next: number, point?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const current = zoomRef.current;
    const clamped = Math.min(ZOOM_MAX, Math.max(0.05, next));
    if (Math.abs(clamped - current) < 0.0001) return;
    anchorRef.current = {
      x: point?.x ?? (viewport ? viewport.clientWidth / 2 : 0),
      y: point?.y ?? (viewport ? viewport.clientHeight / 2 : 0),
      from: current,
    };
    setZoom(clamped);
  }, []);

  // Keep the point under the cursor (or the viewport centre) stationary while zooming.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!viewport || !anchor) return;
    const ratio = zoom / anchor.from;
    viewport.scrollLeft = (viewport.scrollLeft + anchor.x) * ratio - anchor.x;
    viewport.scrollTop = (viewport.scrollTop + anchor.y) * ratio - anchor.y;
  }, [zoom]);

  const resetToFit = useCallback(() => {
    const viewport = viewportRef.current;
    const nextFit = viewport ? fitZoom({ width: viewport.clientWidth, height: viewport.clientHeight }, result) : 1;
    setFit(nextFit);
    anchorRef.current = null;
    setZoom(nextFit);
    viewport?.scrollTo?.(0, 0);
  }, [result]);

  useLayoutEffect(() => {
    resetToFit();
  }, [resetToFit]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(stepZoom(zoomRef.current, 1, fit)); return; }
      if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomTo(stepZoom(zoomRef.current, -1, fit)); return; }
      if (event.key === "0") { event.preventDefault(); resetToFit(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fit, onClose, resetToFit, zoomTo]);

  // React's wheel listener is passive; Ctrl/⌘ + wheel must preventDefault to stop page zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      const rect = viewport.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp((-event.deltaY * unit) / 200), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pointerId: event.pointerId };
    viewport.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    viewportRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const percent = Math.round(zoom * 100);
  const width = Math.max(1, result.width * zoom);
  const height = Math.max(1, result.height * zoom);

  return createPortal(
    <div className="fixed inset-0 z-(--act-z-modal)">
      <div aria-hidden="true" className="absolute inset-0 bg-overlay backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mermaid 图表预览"
        className="absolute inset-4 flex flex-col overflow-hidden rounded-act-xl border border-line bg-surface shadow-act-float sm:inset-8"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div className="min-w-0 truncate pl-1 text-act-sm font-semibold text-text-main">
            Mermaid 图表
            <span className="ml-2 font-mono text-act-xs font-normal text-text-muted">{result.diagramType}</span>
          </div>
          <div className="flex items-center gap-1">
            <IconButton size="sm" label="缩小" tooltip="缩小（-）" onClick={() => zoomTo(stepZoom(zoom, -1, fit))} disabled={zoom <= Math.min(ZOOM_STEPS[0], fit) + 0.001}>
              <Minus size={15} aria-hidden="true" />
            </IconButton>
            <span className="min-w-[46px] text-center font-mono text-act-xs tabular-nums text-text-muted" aria-live="polite">{percent}%</span>
            <IconButton size="sm" label="放大" tooltip="放大（+）" onClick={() => zoomTo(stepZoom(zoom, 1, fit))} disabled={zoom >= ZOOM_MAX - 0.001}>
              <Plus size={15} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="适应窗口" tooltip="适应窗口（0）" onClick={resetToFit}>
              <Maximize size={15} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="实际大小" onClick={() => zoomTo(1)}>
              <span aria-hidden="true" className="font-mono text-act-xxs font-semibold">1:1</span>
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
            <IconButton size="sm" label="下载 PNG" onClick={onDownload}>
              <Download size={15} aria-hidden="true" />
            </IconButton>
            <IconButton ref={closeRef} size="sm" label="关闭预览" tooltip="关闭（Esc）" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        <div
          ref={viewportRef}
          data-testid="mermaid-preview-viewport"
          className="mermaid-preview-viewport flex min-h-0 flex-1 cursor-grab select-none overflow-auto active:cursor-grabbing"
          style={{ background: theme.canvas }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="mermaid-preview-content m-auto shrink-0 p-6"
            style={{ width: width + 48, height: height + 48 }}
            role="img"
            aria-label={`Mermaid 图表：${result.diagramType}`}
            dangerouslySetInnerHTML={{ __html: instantiateMermaidSvg(result, instanceId) }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
