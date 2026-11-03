import { WidgetType } from "@codemirror/view";
import { fileIcon } from "./icons";

/** 路径、本地链接前面的文件图标（D12，强调色）。 */
export class FileIconWidget extends WidgetType {
  eq(_other: FileIconWidget): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "md-path-icon";
    el.append(fileIcon());
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
