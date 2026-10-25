import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createCodeSource } from "./code-source-selection";
import { escapeHtml, highlightToLines } from "./highlight";
import { useCodeSelection } from "./use-code-selection";

const HIGHLIGHT_CHUNK_LINES = 64;
const MAX_CACHED_CHUNKS = 8;
const MAX_HIGHLIGHT_CHARS = 64 * 1024;

/** Bounded per-file LRU; no idle job continues highlighting after a tab is hidden. */
function createHighlightWindow(lines: readonly string[], language: string | undefined) {
  const cache = new Map<number, string[]>();
  return (index: number) => {
    const start = Math.floor(index / HIGHLIGHT_CHUNK_LINES) * HIGHLIGHT_CHUNK_LINES;
    let chunk = cache.get(start);
    if (chunk) cache.delete(start);
    else {
      const part = lines.slice(start, start + HIGHLIGHT_CHUNK_LINES);
      // Extremely long lines remain readable; syntax coloring must not monopolize the UI.
      chunk = part.reduce((sum, line) => sum + line.length, 0) <= MAX_HIGHLIGHT_CHARS
        ? highlightToLines(part.join("\n"), language) : part.map(escapeHtml);
    }
    cache.set(start, chunk);
    if (cache.size > MAX_CACHED_CHUNKS) cache.delete(cache.keys().next().value!);
    return chunk[index - start];
  };
}

export function VirtualCodeView({ lines, language, renderLine, children }: {
  lines: string[];
  language?: string;
  renderLine: (index: number, html: string) => ReactNode;
  children?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const source = useMemo(() => createCodeSource(lines), [lines]);
  const highlight = useMemo(() => createHighlightWindow(lines, language), [lines, language]);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    initialRect: { width: 400, height: 600 },
    overscan: 12,
    useFlushSync: false,
  });
  const handlers = useCodeSelection(source, scrollRef, line => virtualizer.scrollToIndex(line, { align: "auto" }));
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    virtualizer.measure();
  }, [source, virtualizer]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; virtualizer.measure(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualizer]);

  const items = virtualizer.getVirtualItems();
  const gutterWidth = `${String(lines.length).length + 2}ch`;
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-focus-ring"
      tabIndex={0} aria-label="文件内容" {...handlers}>
      <div className="act-code-hl relative w-full font-mono text-act-xs leading-[1.55]"
        data-code-total-lines={lines.length} data-code-visible-lines={items.length}
        style={{ height: virtualizer.getTotalSize() }}>
        {items.map(item => (
          <div key={item.key} ref={virtualizer.measureElement} data-index={item.index}
            className="absolute left-0 top-0 grid w-full min-w-0"
            style={{ gridTemplateColumns: `${gutterWidth} minmax(0, 1fr)`, transform: `translateY(${item.start}px)` }}>
            {renderLine(item.index, highlight(item.index))}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
