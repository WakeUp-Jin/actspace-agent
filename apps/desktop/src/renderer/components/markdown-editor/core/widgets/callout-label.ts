import { WidgetType } from "@codemirror/view";
import { CALLOUT_LABEL, type CalloutType } from "../../../markdown-common/callouts";

/** 提示框首行 `[!TYPE]` 换成的中文标签（说明 / 提示 / 重要 / 注意 / 警告）。 */
export class CalloutLabelWidget extends WidgetType {
  constructor(readonly type: CalloutType) {
    super();
  }

  eq(other: CalloutLabelWidget): boolean {
    return other.type === this.type;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "md-callout-label";
    el.textContent = CALLOUT_LABEL[this.type];
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
