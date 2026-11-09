import { type EditorView, WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { checkIcon } from "./icons";

const TASK_MARKER = /^\[[ xX]\]$/;

/** 任务复选框要做的改动：`[ ]` ↔ `[x]`，只改中间那个字符；`pos` 不在 `[ ]` 上返回 null。 */
export function taskToggleChange(state: EditorState, pos: number): { from: number; to: number; insert: string } | null {
  const marker = state.sliceDoc(pos, pos + 3);
  if (!TASK_MARKER.test(marker)) return null;
  return { from: pos + 1, to: pos + 2, insert: marker[1] === " " ? "x" : " " };
}

/** 单击改写原文；只读时不改。返回是否改了。 */
export function toggleTask(view: EditorView, pos: number): boolean {
  if (view.state.readOnly) return false;
  const change = taskToggleChange(view.state, pos);
  if (!change) return false;
  view.dispatch({ changes: change, userEvent: "input.toggle" });
  return true;
}

/** 任务列表的复选框（D3）。 */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  private paint(box: HTMLElement): void {
    box.className = `md-checkbox${this.checked ? " is-checked" : ""}`;
    box.setAttribute("aria-checked", String(this.checked));
    box.replaceChildren(...(this.checked ? [checkIcon()] : []));
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.setAttribute("role", "checkbox");
    this.paint(box);
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      toggleTask(view, view.posAtDOM(box));
    });
    return box;
  }

  updateDOM(dom: HTMLElement): boolean {
    this.paint(dom);
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
