import { type EditorView, WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { ancestorsAt, fenceCode } from "../util";

/** 光标 / 位置所在的围栏代码块的代码原文（不含围栏）；不在围栏里返回 null。 */
export function fencedCodeAt(state: EditorState, pos: number): string | null {
  for (const node of ancestorsAt(state, pos)) {
    if (node.name === "FencedCode") return fenceCode(state, node);
  }
  return null;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 复制代码块：复制代码原文，不含围栏（规范 §5）。
 * 代码在点击时才从文档里读，widget 本身不持有大段文字。
 */
export async function copyFencedCode(state: EditorState, pos: number): Promise<boolean> {
  const code = fencedCodeAt(state, pos);
  return code === null ? false : writeClipboard(code);
}

/** 代码块头：语言名 + 复制按钮（D5）。围栏平时隐藏，光标进入时露出围栏、收起代码头。 */
export class CodeHeaderWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }

  eq(other: CodeHeaderWidget): boolean {
    return other.lang === this.lang;
  }

  toDOM(view: EditorView): HTMLElement {
    const head = document.createElement("span");
    head.className = "md-code-head";
    const lang = document.createElement("span");
    lang.className = "md-code-lang";
    lang.textContent = this.lang || "text";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "md-code-copy";
    copy.textContent = "复制";
    copy.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      void copyFencedCode(view.state, view.posAtDOM(head)).then((ok) => {
        copy.textContent = ok ? "已复制" : "复制失败";
        clearTimeout(timer);
        timer = setTimeout(() => {
          copy.textContent = "复制";
        }, 1200);
      });
    });
    // 点代码头的空白处：光标放进代码，露出围栏
    head.addEventListener("mousedown", (event) => {
      if (event.target === copy) return;
      event.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(head));
      view.dispatch({ selection: { anchor: Math.min(line.to + 1, view.state.doc.length) }, scrollIntoView: true });
      view.focus();
    });
    head.append(lang, copy);
    return head;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
