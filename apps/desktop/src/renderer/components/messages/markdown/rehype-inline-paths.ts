import { isAbsolutePath, parseInlinePath, resolveWorkspacePath } from "../../markdown-common/paths";
import type { HastNode } from "./hast-types";

/**
 * 行内代码里的文件路径（规范 §5.1）：整段是一个路径，才给 `<code>` 打上 `data-path`（相对工作区根）和 `data-line`。
 * 识别规则来自共享的 paths.ts（与「文档」面板同一份）；聊天没有“当前文档”，一律相对工作区根，越出根目录的不识别。
 * 绝对路径原样放进 `data-path`，由 InlineCode 按宿主的工作区根解析（工作区外的不可点）。
 * 代码块里的 `<code>` 和链接里的 `<code>` 不处理（链接已经是可点的了，不能嵌套）。
 */
export function rehypeInlinePaths() {
  return (tree: HastNode) => {
    const walk = (node: HastNode, skip: boolean) => {
      for (const child of node.children ?? []) {
        if (child.type !== "element") continue;
        if (child.tagName === "code" && !skip) {
          mark(child);
          continue;
        }
        walk(child, skip || child.tagName === "pre" || child.tagName === "a");
      }
    };
    walk(tree, false);
  };
}

function mark(code: HastNode) {
  if (!code.children?.every((child) => child.type === "text")) return;
  const text = code.children.map((child) => child.value ?? "").join("");
  const hit = parseInlinePath(text, { absolute: true });
  if (!hit) return;
  // 绝对路径原样带下去：这里拿不到工作区根，由 InlineCode 用宿主的 workspaceRoot 判断是否在工作区内。
  const path = isAbsolutePath(hit.path) ? hit.path : resolveWorkspacePath(hit.path);
  if (!path) return;
  code.properties = { ...code.properties, dataPath: path, ...(hit.line ? { dataLine: String(hit.line) } : {}) };
}
