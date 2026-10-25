import { useLayoutEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent, MouseEvent, PointerEvent, RefObject } from "react";
import { caretInCode, moveCodeCaret, selectedCode, sourceOffsetAt, type CodeSelection, type CodeSource } from "./code-source-selection";

/** Preserve source selection while the virtualizer removes its native anchor DOM. */
export function useCodeSelection(
  source: CodeSource,
  scrollRef: RefObject<HTMLDivElement>,
  reveal: (line: number) => void,
) {
  const state = useRef({ source, selection: { anchor: 0, focus: 0 } as CodeSelection, active: false });
  if (state.current.source !== source) state.current = { source, selection: { anchor: 0, focus: 0 }, active: false };
  const drag = useRef<{ pointerId: number; x: number; y: number; frame: number } | null>(null);

  const project = () => {
    const root = scrollRef.current;
    if (!root || !state.current.active || (root.ownerDocument.activeElement !== root && !drag.current)) return;
    const codes = Array.from(root.querySelectorAll<HTMLElement>("[data-line-index]"));
    if (!codes.length) return;
    const first = Number(codes[0].dataset.lineIndex);
    const last = Number(codes[codes.length - 1].dataset.lineIndex);
    const point = (offset: number) => {
      const position = source.position(offset);
      const line = Math.max(first, Math.min(last, position.line));
      const code = codes[line - first];
      const column = position.line < first ? 0 : position.line > last ? source.lines[last].length : position.column;
      return caretInCode(code, column);
    };
    const anchor = point(state.current.selection.anchor);
    const focus = point(state.current.selection.focus);
    root.ownerDocument.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  };

  const set = (selection: CodeSelection) => {
    state.current.selection = selection;
    state.current.active = true;
    project();
  };
  const atPoint = (x: number, y: number) => {
    const root = scrollRef.current;
    if (!root) return null;
    const bounds = root.getBoundingClientRect();
    // Clamp outside-pointer drags to the viewport while auto-scroll advances the window.
    x = Math.max(bounds.left + 1, Math.min(bounds.right - 1, x));
    y = Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y));
    const doc = root.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range || !root.contains(range.startContainer)) return null;
    return sourceOffsetAt(source, range.startContainer, range.startOffset);
  };
  const extendDrag = () => {
    const pointer = drag.current;
    const root = scrollRef.current;
    if (!pointer || !root) return;
    const next = atPoint(pointer.x, pointer.y);
    if (next !== null) set({ anchor: state.current.selection.anchor, focus: next });
  };
  const autoScroll = () => {
    const pointer = drag.current;
    const root = scrollRef.current;
    if (!pointer || !root) return;
    const bounds = root.getBoundingClientRect();
    const delta = pointer.y < bounds.top ? pointer.y - bounds.top : pointer.y > bounds.bottom ? pointer.y - bounds.bottom : 0;
    if (delta) { root.scrollTop += Math.max(-60, Math.min(60, delta)); extendDrag(); }
    pointer.frame = requestAnimationFrame(autoScroll);
  };
  const stopDrag = () => {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
  };

  // Recreate only the visible intersection. Copy always uses the full source offsets.
  useLayoutEffect(() => { if (drag.current) extendDrag(); else project(); });
  useLayoutEffect(() => {
    const root = scrollRef.current;
    return () => {
      stopDrag();
      const selection = root?.ownerDocument.getSelection();
      if (selection?.anchorNode && root?.contains(selection.anchorNode)) selection.removeAllRanges();
    };
  }, [source]);

  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const offset = atPoint(event.clientX, event.clientY);
      if (offset === null) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      set({ anchor: event.shiftKey && state.current.active ? state.current.selection.anchor : offset, focus: offset });
      stopDrag();
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, frame: requestAnimationFrame(autoScroll) };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (drag.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      drag.current.x = event.clientX; drag.current.y = event.clientY;
      extendDrag();
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (drag.current?.pointerId !== event.pointerId) return;
      extendDrag(); stopDrag();
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag,
    onDoubleClick(event: MouseEvent<HTMLDivElement>) {
      const offset = atPoint(event.clientX, event.clientY);
      if (offset === null) return;
      // Use the browser's Unicode word boundaries, including Chinese text.
      const segments = new Intl.Segmenter(undefined, { granularity: "word" }).segment(source.lines[source.position(offset).line]);
      const { line, column } = source.position(offset);
      for (const segment of segments) {
        if (column >= segment.index && column < segment.index + segment.segment.length) {
          set({ anchor: source.offset(line, segment.index), focus: source.offset(line, segment.index + segment.segment.length) });
          break;
        }
      }
    },
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); set({ anchor: 0, focus: source.text.length }); return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
      event.preventDefault();
      const previous = state.current.selection;
      let key = event.key;
      if (event.metaKey && key === "ArrowLeft") key = "Home";
      if (event.metaKey && key === "ArrowRight") key = "End";
      const collapse = !event.shiftKey && previous.anchor !== previous.focus && (key === "ArrowLeft" || key === "ArrowRight");
      const next = collapse ? (key === "ArrowLeft" ? Math.min(previous.anchor, previous.focus) : Math.max(previous.anchor, previous.focus))
        : moveCodeCaret(source, previous.focus, key, (event.metaKey || event.ctrlKey) && (key === "Home" || key === "End") && event.key === key,
          Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / 20)));
      set({ anchor: event.shiftKey ? previous.anchor : next, focus: next });
      reveal(source.position(next).line);
    },
    onCopy(event: ClipboardEvent<HTMLDivElement>) {
      if (!state.current.active || state.current.selection.anchor === state.current.selection.focus) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", selectedCode(source, state.current.selection));
    },
  };
}
