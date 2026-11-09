import { type EditorView, WidgetType } from "@codemirror/view";
import { KATEX_OPTIONS, loadKatex } from "../../../markdown-common/katex";

type Katex = Awaited<ReturnType<typeof loadKatex>>;

/** KaTeX 载入完成后记在这里：之后创建的 widget 同步渲染，避免先闪一下原文再变公式。 */
let katex: Katex | null = null;
const CACHE_LIMIT = 200;
const rendered = new Map<string, string | null>();

function cacheKey(tex: string, display: boolean): string {
  return `${display ? "d" : "i"}\u0000${tex}`;
}

/**
 * 公式 → HTML（按 TeX 源码缓存）。KaTeX 用 `throwOnError: false` + `trust: false`：
 * 写错的公式不抛错，KaTeX 输出原文并标成危险色；意外抛错返回 null，由调用方显示原文。
 * 输出是 KaTeX 自己生成的受限 HTML（不信任 `\href`、`\includegraphics` 等），可以直接写入 innerHTML。
 */
export function renderTex(tex: string, display: boolean, engine: Katex): string | null {
  const key = cacheKey(tex, display);
  if (rendered.has(key)) return rendered.get(key) ?? null;
  let html: string | null;
  try {
    html = engine.renderToString(tex, { ...KATEX_OPTIONS, displayMode: display, errorColor: "var(--act-color-danger)" });
  } catch {
    html = null;
  }
  if (rendered.size >= CACHE_LIMIT) rendered.delete(rendered.keys().next().value as string);
  rendered.set(key, html);
  return html;
}

/** 测试用：重置 KaTeX 状态。 */
export function resetMathStateForTests(): void {
  katex = null;
  rendered.clear();
}

/** 公式 widget：`display` 为真是块公式（居中独占一行），否则行内。 */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "md-math md-math-block" : "md-math md-math-inline";
    this.fill(el, view);
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const pos = view.posAtDOM(el);
      const doc = view.state.doc;
      const anchor = this.display ? Math.min(doc.lineAt(pos).to + 1, doc.length) : pos + 1;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
    return el;
  }

  /** 显示公式；KaTeX 还没载入时先显示源码（等宽、淡色），载入后换成渲染结果。 */
  private fill(el: HTMLElement, view: EditorView): void {
    const apply = (engine: Katex): void => {
      const html = renderTex(this.tex, this.display, engine);
      if (html === null) {
        this.showSource(el, true);
        return;
      }
      el.classList.remove("is-pending", "is-error");
      el.innerHTML = html;
    };
    if (katex) {
      apply(katex);
      return;
    }
    this.showSource(el, false);
    el.classList.add("is-pending");
    loadKatex().then(
      (engine) => {
        katex = engine;
        apply(engine);
        view.requestMeasure();
      },
      () => this.showSource(el, true),
    );
  }

  private showSource(el: HTMLElement, error: boolean): void {
    el.classList.toggle("is-error", error);
    el.textContent = this.tex;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
