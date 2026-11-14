import { type EditorView, WidgetType } from "@codemirror/view";
import { hostOf } from "../context";
import { imageCacheGeneration, loadImageCached, peekImage } from "./image-cache";

/**
 * 工作区本地图片（D10）。图片经 `host.loadImage` 读成 data URL，按路径缓存；
 * 读不到（文件不存在、越界、不是图片）就显示原文（`raw`，如 `![alt](a.png)`），不显示破图。
 */
export class ImageWidget extends WidgetType {
  /** 构造时的缓存代次：缓存被清空后新建的 widget 与旧的不相等，DOM 会重建、图片重新读取。 */
  private readonly generation = imageCacheGeneration();

  constructor(
    readonly relativePath: string,
    readonly alt: string,
    readonly raw: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.relativePath === this.relativePath &&
      other.alt === this.alt &&
      other.raw === this.raw &&
      other.generation === this.generation
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "md-img";
    const host = hostOf(view.state);
    if (!host) {
      this.showRaw(wrap);
      return wrap;
    }
    const cached = peekImage(host, this.relativePath);
    if (cached !== undefined) {
      this.show(wrap, cached, view, false);
      return wrap;
    }
    wrap.classList.add("is-loading");
    void loadImageCached(host, this.relativePath).then((dataUrl) => {
      wrap.classList.remove("is-loading");
      this.show(wrap, dataUrl, view, true);
    });
    return wrap;
  }

  private show(wrap: HTMLElement, dataUrl: string | null, view: EditorView, measure: boolean): void {
    if (dataUrl === null) {
      this.showRaw(wrap);
    } else {
      const img = document.createElement("img");
      img.alt = this.alt;
      img.src = dataUrl;
      img.addEventListener("load", () => view.requestMeasure());
      img.addEventListener("error", () => this.showRaw(wrap));
      wrap.classList.remove("is-missing");
      wrap.replaceChildren(img);
    }
    if (measure) view.requestMeasure();
  }

  private showRaw(wrap: HTMLElement): void {
    wrap.classList.add("is-missing");
    wrap.title = "图片读不到";
    wrap.textContent = this.raw;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
