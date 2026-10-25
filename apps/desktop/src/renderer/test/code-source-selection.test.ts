import { describe, expect, it } from "vitest";
import { caretInCode, createCodeSource, moveCodeCaret, selectedCode, sourceOffsetAt } from "../components/right-panel/code-source-selection";

describe("virtual code source selection", () => {
  it("maps UTF-16 offsets through empty lines, CRLF and the last line", () => {
    const source = createCodeSource(["中文😀\r", "", "last"]);
    for (let offset = 0; offset <= source.text.length; offset++) {
      const point = source.position(offset);
      expect(source.offset(point.line, point.column)).toBe(offset);
    }
    expect(selectedCode(source, { anchor: source.text.length, focus: 0 })).toBe("中文😀\r\n\nlast");
    expect(source.offset(-2, -1)).toBe(0);
    expect(source.offset(100, Infinity)).toBe(source.text.length);
  });

  it("moves by complete code points and keeps the column for line/page navigation", () => {
    const source = createCodeSource(["a😀中", "second", "", "tail"]);
    expect(moveCodeCaret(source, 1, "ArrowRight")).toBe(3);
    expect(moveCodeCaret(source, 3, "ArrowLeft")).toBe(1);
    expect(moveCodeCaret(source, 0, "ArrowLeft")).toBe(0);
    expect(moveCodeCaret(source, source.text.length, "ArrowRight")).toBe(source.text.length);
    expect(moveCodeCaret(source, 3, "ArrowDown")).toBe(source.offset(1, 3));
    expect(moveCodeCaret(source, 3, "PageDown", false, 2)).toBe(source.offset(2, 0));
    expect(moveCodeCaret(source, source.offset(3, 2), "Home")).toBe(source.offset(3, 0));
    expect(moveCodeCaret(source, 3, "End", true)).toBe(source.text.length);
  });

  it("maps highlighted token spans without copying line numbers or empty-line placeholders", () => {
    const source = createCodeSource(["const 中文 = '😀';", "", "end"]);
    const row = document.createElement("div");
    row.innerHTML = '<span data-line-number="1">1</span><code data-line-index="0"><span>const</span> 中文 = <span>\'😀\'</span>;</code><code data-line-index="1">\u200b</code>';
    const code = row.querySelector("code")!;
    const emoji = code.querySelectorAll("span")[1].firstChild!;
    const offset = sourceOffsetAt(source, emoji, 3)!;
    expect(offset).toBe("const 中文 = '😀".length);
    expect(caretInCode(code, offset)).toEqual({ node: emoji, offset: 3 });
    expect(sourceOffsetAt(source, row.querySelector("[data-line-number]")!.firstChild!, 1)).toBeNull();
    expect(sourceOffsetAt(source, row.querySelectorAll("code")[1].firstChild!, 1)).toBe(source.starts[1]);
    expect(selectedCode(source, { anchor: offset, focus: source.text.length })).toBe("';\n\nend");
  });
});
