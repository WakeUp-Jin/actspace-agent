/**
 * 焦点与“露出”判断（规范 §5、§9.4）。
 *
 * 编辑器失去焦点时一律不露出语法标记，即纯阅读状态，光标留在哪里都不影响显示；
 * 获得焦点后，光标或选区碰到哪个语法节点，就露出这个节点的标记（D1）。
 */
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const setFocusEffect = StateEffect.define<boolean>();

export const focusField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFocusEffect)) value = effect.value;
    return value;
  },
});

/** 焦点变化时发一个 transaction，把焦点写进 `focusField`。 */
export const focusExtension = [
  focusField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocusEffect.of(focusing)),
];

export function isEditorFocused(state: EditorState): boolean {
  return state.field(focusField, false) ?? false;
}

/** 选区碰到 [from, to]：光标含两端，非空选区按重叠算。 */
export function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) =>
    range.empty ? range.from >= from && range.from <= to : range.from < to && range.to > from,
  );
}

/** 选区是否落在 [from, to] 所在的任意一行里（引用 `>`、分隔线按行露出）。 */
export function selectionTouchesLines(state: EditorState, from: number, to: number): boolean {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  return state.selection.ranges.some(
    (range) => state.doc.lineAt(range.from).number <= last && state.doc.lineAt(range.to).number >= first,
  );
}

/** 标记是否露出：有焦点，并且选区碰到这个节点。 */
export function revealed(state: EditorState, from: number, to: number): boolean {
  return isEditorFocused(state) && selectionTouches(state, from, to);
}

/** 同 `revealed`，按整行判断。 */
export function revealedLines(state: EditorState, from: number, to: number): boolean {
  return isEditorFocused(state) && selectionTouchesLines(state, from, to);
}
