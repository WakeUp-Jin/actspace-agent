/**
 * 键位（规范 §9.1）：
 * - Enter / Backspace：列表、任务列表、引用续行与结束（`@codemirror/lang-markdown` 的 `markdownKeymap`）；
 * - Tab / Shift+Tab：在列表里缩进 / 反缩进（宽度是该项列表标记加一个空格，`-` 是 2，`1.` 是 3），其他位置插入两个空格；
 *   按 Esc 之后再按 Tab 焦点移出编辑器，这是 CM 视图层自带的无障碍行为，这里不用处理；
 * - ⌘S / Ctrl+S：保存；
 * - ⌘Z / ⌘⇧Z、⌘F / ⌘G / ⇧⌘G / Esc：撤销重做、查找（`@codemirror/commands`、`@codemirror/search` 的默认键位）。
 */
import { markdownKeymap } from "@codemirror/lang-markdown";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { Prec, type ChangeSpec, type EditorState } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import { callbacksFacet, flushPendingChange } from "./callbacks";
import { ancestorsAt } from "./util";

/** `pos` 所在列表项的缩进宽度；不在列表里返回 null。 */
export function listIndentWidth(state: EditorState, pos: number): number | null {
  for (const node of ancestorsAt(state, pos)) {
    if (node.name !== "ListItem") continue;
    const mark = node.getChild("ListMark");
    return mark ? mark.to - mark.from + 1 : 2;
  }
  return null;
}

/** 选区碰到的所有行（去重）。 */
function touchedLines(state: EditorState): { from: number; to: number; text: string }[] {
  const lines = new Map<number, { from: number; to: number; text: string }>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
      const line = state.doc.line(n);
      // 选区终点正好在下一行行首时，那一行不算
      if (n > state.doc.lineAt(range.from).number && n === last && range.to === line.from && !range.empty) continue;
      lines.set(n, line);
    }
  }
  return [...lines.values()];
}

function indentPos(line: { from: number; text: string }): number {
  return line.from + (line.text.length - line.text.trimStart().length);
}

export const indentCommand: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const lines = touchedLines(state);
  const changes: ChangeSpec[] = [];
  const inList = lines.some((line) => listIndentWidth(state, indentPos(line)) !== null);
  if (!inList) {
    view.dispatch(state.replaceSelection("  "), { scrollIntoView: true, userEvent: "input" });
    return true;
  }
  for (const line of lines) {
    const width = listIndentWidth(state, indentPos(line));
    if (width !== null && line.text.trim()) changes.push({ from: line.from, insert: " ".repeat(width) });
  }
  if (changes.length === 0) return true;
  view.dispatch({ changes, userEvent: "input.indent", scrollIntoView: true });
  return true;
};

export const outdentCommand: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const changes: ChangeSpec[] = [];
  for (const line of touchedLines(state)) {
    const width = listIndentWidth(state, indentPos(line)) ?? 2;
    const leading = line.text.length - line.text.trimStart().length;
    const remove = Math.min(width, leading);
    if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
  }
  if (changes.length === 0) return true;
  view.dispatch({ changes, userEvent: "delete.dedent", scrollIntoView: true });
  return true;
};

export const saveCommand: Command = (view) => {
  if (view.state.readOnly) return false;
  const onSave = view.state.facet(callbacksFacet).onSave;
  if (!onSave) return false;
  flushPendingChange(view);
  onSave();
  return true;
};

export const editorKeymap = [
  Prec.high(keymap.of([{ key: "Mod-s", run: saveCommand, preventDefault: true }])),
  Prec.high(keymap.of(markdownKeymap)),
  keymap.of([
    { key: "Tab", run: indentCommand, shift: outdentCommand },
    ...historyKeymap,
    ...searchKeymap,
    ...defaultKeymap,
  ]),
];
