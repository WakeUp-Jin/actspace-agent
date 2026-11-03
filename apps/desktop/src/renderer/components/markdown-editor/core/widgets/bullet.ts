import { WidgetType } from "@codemirror/view";

/** 无序列表的圆点：三层依次是实心点、空心点、方点（D2）；光标碰到时还原成原文标记。 */
export class BulletWidget extends WidgetType {
  readonly depth: number;

  constructor(depth: number) {
    super();
    this.depth = Math.min(Math.max(depth, 1), 3);
  }

  eq(other: BulletWidget): boolean {
    return other.depth === this.depth;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = `md-bullet md-bullet-${this.depth}`;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  /** 单击要能把光标放到标记上，交给编辑器处理。 */
  ignoreEvent(): boolean {
    return false;
  }
}
