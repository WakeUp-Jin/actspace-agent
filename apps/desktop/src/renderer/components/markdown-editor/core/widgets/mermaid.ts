import { type EditorView, WidgetType } from "@codemirror/view";
import { instantiateMermaidSvg, nextMermaidInstanceId, type MermaidRenderResult } from "../../../messages/mermaid-renderer";
import { hostOf } from "../context";
import { expandIcon } from "./icons";

/** 源码改动后的防抖（规范 §5：300ms）。第一次出现时不等。 */
export const MERMAID_DEBOUNCE_MS = 300;

export type MermaidMode = "replace" | "below";

/** 每个 DOM 节点上的渲染状态：定时器、请求序号、上一张成功的图。`updateDOM` 复用 DOM 时沿用。 */
interface MermaidState {
  timer: ReturnType<typeof setTimeout> | undefined;
  token: number;
  result: MermaidRenderResult | null;
  widget: MermaidWidget;
  status: HTMLElement;
  figure: HTMLElement;
  expand: HTMLButtonElement;
}

const states = new WeakMap<HTMLElement, MermaidState>();

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message.split("\n")[0].trim() : "";
  return message ? `Mermaid：${message}` : "Mermaid 渲染失败";
}

/**
 * Mermaid 图（D8）。
 * - `replace`：平时整块围栏替换成图，点一下把光标放进围栏，露出源码；
 * - `below`：光标在围栏里时，源码显示出来，图放在源码下方，随输入实时更新（防抖 300ms）。
 * 渲染经 `host.renderMermaid`（SVG 已清理，每份拷贝用独立的 id）；出错时保留上一张图，状态条显示错误。
 */
export class MermaidWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly mode: MermaidMode,
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.code === this.code && other.mode === this.mode;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = `md-mermaid md-mermaid-${this.mode}`;
    const status = document.createElement("div");
    status.className = "md-mermaid-status";
    status.textContent = "渲染中…";
    const figure = document.createElement("div");
    figure.className = "md-mermaid-figure";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "md-mermaid-expand";
    expand.title = "查看大图";
    expand.setAttribute("aria-label", "查看大图");
    expand.append(expandIcon());
    expand.hidden = true;
    el.append(expand, status, figure);
    const state: MermaidState = { timer: undefined, token: 0, result: null, widget: this, status, figure, expand };
    states.set(el, state);

    expand.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    expand.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.result) hostOf(view.state)?.previewMermaid?.(state.result);
    });
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (state.widget.mode !== "replace") return;
      const doc = view.state.doc;
      const line = doc.lineAt(view.posAtDOM(el));
      view.dispatch({ selection: { anchor: Math.min(line.to + 1, doc.length) }, scrollIntoView: true });
      view.focus();
    });
    this.schedule(el, view, 0);
    return el;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = states.get(dom);
    if (!state || !dom.classList.contains(`md-mermaid-${this.mode}`)) return false;
    state.widget = this;
    this.schedule(dom, view, MERMAID_DEBOUNCE_MS);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = states.get(dom);
    if (!state) return;
    clearTimeout(state.timer);
    state.token += 1;
    states.delete(dom);
  }

  private schedule(el: HTMLElement, view: EditorView, delay: number): void {
    const state = states.get(el);
    if (!state) return;
    clearTimeout(state.timer);
    state.token += 1;
    const token = state.token;
    const run = (): void => {
      const host = hostOf(view.state);
      if (!host) return;
      host.renderMermaid(this.code).then(
        (result) => {
          if (state.token !== token || !states.has(el)) return;
          state.result = result;
          // 预渲染的 SVG 已被 renderer 清理；这里只改 id，让同一张图的多份拷贝互不冲突
          state.figure.innerHTML = instantiateMermaidSvg(result, nextMermaidInstanceId());
          state.status.textContent = "";
          el.classList.remove("has-error");
          state.expand.hidden = !host.previewMermaid;
          view.requestMeasure();
        },
        (error: unknown) => {
          if (state.token !== token || !states.has(el)) return;
          el.classList.add("has-error");
          state.status.textContent = errorText(error);
          view.requestMeasure();
        },
      );
    };
    if (delay > 0) state.timer = setTimeout(run, delay);
    else run();
  }

  ignoreEvent(): boolean {
    return true;
  }
}
