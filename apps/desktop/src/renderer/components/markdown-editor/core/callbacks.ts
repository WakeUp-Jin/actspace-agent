/**
 * 外壳回调：放进 facet，用 Compartment 随时换，React 重新渲染换了闭包也不用重建 view。
 *
 * - `onChange`：用户输入引起的文档变化，**每帧最多通知一次**（requestAnimationFrame 合并），
 *   参数是最新的全文；外部替换（`replaceDocument`）不通知，避免“草稿 → 编辑器 → 草稿”的循环；
 * - `onSave`：⌘S / Ctrl+S；只读时不响应。保存前会先把还没通知的变化补发出去，保证草稿是最新的。
 */
import { Annotation, Facet } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface EditorCallbacks {
  onChange?(doc: string): void;
  onSave?(): void;
}

export const callbacksFacet = Facet.define<EditorCallbacks, EditorCallbacks>({
  combine: (values) => values[values.length - 1] ?? {},
});

/** 标记“外部整份替换”的 transaction：不触发 `onChange`，也不进撤销历史。 */
export const externalReplace = Annotation.define<boolean>();

class ChangeNotifier {
  private frame: number | null = null;
  private dirty = false;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged) return;
    if (update.transactions.some((tr) => tr.annotation(externalReplace))) {
      // 外部替换把草稿换掉了，之前没发出去的变化作废
      this.cancel();
      return;
    }
    this.dirty = true;
    if (this.frame === null) this.frame = requestAnimationFrame(() => this.flush());
  }

  /** 立刻补发还没通知的变化。 */
  flush(): void {
    this.cancelFrame();
    if (!this.dirty) return;
    this.dirty = false;
    this.view.state.facet(callbacksFacet).onChange?.(this.view.state.doc.toString());
  }

  private cancelFrame(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private cancel(): void {
    this.cancelFrame();
    this.dirty = false;
  }

  /** 卸载时把最后一帧的变化补发出去，不丢字。 */
  destroy(): void {
    this.flush();
  }
}

export const changeNotifier = ViewPlugin.fromClass(ChangeNotifier);

/** 把还没通知的变化立刻发出去（保存、卸载前调用）。 */
export function flushPendingChange(view: EditorView): void {
  view.plugin(changeNotifier)?.flush();
}
