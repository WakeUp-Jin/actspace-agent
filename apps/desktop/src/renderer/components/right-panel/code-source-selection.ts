/** UTF-16 source offsets are independent of the currently mounted line window. */
export type CodeSelection = { anchor: number; focus: number };
export type CodeSource = ReturnType<typeof createCodeSource>;

export function createCodeSource(lines: readonly string[]) {
  const starts: number[] = [];
  let length = 0;
  for (const line of lines) { starts.push(length); length += line.length + 1; }
  const text = lines.join("\n");
  const clamp = (offset: number) => Math.max(0, Math.min(text.length, offset));
  const position = (offset: number) => {
    offset = clamp(offset);
    let low = 0; let high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= offset) low = middle; else high = middle;
    }
    return { line: low, column: offset - starts[low] };
  };
  const offset = (line: number, column: number) => {
    line = Math.max(0, Math.min(lines.length - 1, line));
    return starts[line] + Math.max(0, Math.min(lines[line].length, column));
  };
  return { text, starts, lines, position, offset, clamp };
}

export function selectedCode(source: CodeSource, selection: CodeSelection): string {
  return source.text.slice(Math.min(selection.anchor, selection.focus), Math.max(selection.anchor, selection.focus));
}

/** DOM token spans do not own selection; empty-line placeholders are not source text. */
export function sourceOffsetAt(source: CodeSource, node: Node, offset: number): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const code = element?.closest<HTMLElement>("[data-line-index]");
  if (!code) return null;
  const index = Number(code.dataset.lineIndex);
  if (!Number.isInteger(index) || !source.lines[index]) {
    return source.lines[index] === "" ? source.starts[index] : null;
  }
  const range = code.ownerDocument.createRange();
  range.setStart(code, 0); range.setEnd(node, offset);
  return source.offset(index, range.toString().length);
}

export function caretInCode(code: HTMLElement, column: number): { node: Node; offset: number } {
  const walker = code.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (column <= length) return { node, offset: column };
    column -= length;
    const next = walker.nextNode();
    if (!next) return { node, offset: length };
    node = next;
  }
  return { node: code, offset: 0 };
}

export function moveCodeCaret(source: CodeSource, from: number, key: string, documentEdge = false, pageLines = 20): number {
  const { line, column } = source.position(from);
  if (key === "Home") return documentEdge ? 0 : source.offset(line, 0);
  if (key === "End") return documentEdge ? source.text.length : source.offset(line, Infinity);
  if (key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown") {
    const direction = key === "ArrowUp" || key === "PageUp" ? -1 : 1;
    return source.offset(line + direction * (key.startsWith("Page") ? pageLines : 1), column);
  }
  // Never stop inside a surrogate pair (emoji and supplementary CJK characters).
  if (key === "ArrowRight") return source.clamp(from + ((source.text.codePointAt(from) ?? 0) > 0xffff ? 2 : 1));
  const previous = source.text.charCodeAt(from - 1);
  return source.clamp(from - (previous >= 0xdc00 && previous <= 0xdfff ? 2 : 1));
}
