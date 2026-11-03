/**
 * 文中路径的解析（规范 §8）。识别规则在共享模块 `components/markdown-common/paths.ts`（聊天区也用），
 * 这里只做“相对于当前文档”的那一层：
 * - 行内代码路径：工作区根目录；以 `./`、`../` 开头的相对于当前文档所在目录；
 * - Markdown 链接、图片：当前文档所在目录；
 * - 工作区内的绝对路径去掉工作区根前缀；工作区外的绝对路径、`~`、越界的 `..` 一律不识别。
 * 解析结果恒为不含 `..`、不是绝对路径的工作区相对路径（越界检查等价于 `isSafeWorkspaceRelativePath`）。
 */
import { classifyLinkTarget, parseInlinePath, resolveWorkspacePath } from "../../markdown-common/paths";
import type { PathContext } from "./context";

export interface ResolvedPath {
  relativePath: string;
  line?: number;
}

/** 点击链接后要做的事。`none` = 不可点（其他协议、越界、工作区外）。 */
export type LinkRoute =
  | { kind: "anchor"; id: string }
  | { kind: "external"; url: string }
  | { kind: "path"; relativePath: string; line?: number }
  | { kind: "none" };

/** 行内代码的文字是不是工作区里的文件路径（D12）；不是返回 null。 */
export function resolveCodePath(text: string, ctx: PathContext): ResolvedPath | null {
  // 工作区内的绝对路径也认（去掉根目录前缀）；没有工作区根时绝对路径无从判断，不认。
  const ref = parseInlinePath(text, { absolute: Boolean(ctx.workspaceRoot) });
  if (!ref) return null;
  const relativePath = resolveWorkspacePath(ref.path, { baseDir: ctx.baseDir, workspaceRoot: ctx.workspaceRoot, plainRelativeToBase: false });
  if (!relativePath) return null;
  return ref.line ? { relativePath, line: ref.line } : { relativePath };
}

/** Markdown 链接目标 → 路由。 */
export function routeHref(href: string, ctx: PathContext): LinkRoute {
  const target = classifyLinkTarget(href);
  switch (target.kind) {
    case "anchor":
      return target.id ? { kind: "anchor", id: target.id } : { kind: "none" };
    case "external":
      return { kind: "external", url: target.url };
    case "local": {
      const relativePath = resolveWorkspacePath(target.path, { baseDir: ctx.baseDir, workspaceRoot: ctx.workspaceRoot, plainRelativeToBase: true });
      if (!relativePath) return { kind: "none" };
      return target.line ? { kind: "path", relativePath, line: target.line } : { kind: "path", relativePath };
    }
    default:
      return { kind: "none" };
  }
}

/** 图片目标：只有解析成工作区相对路径的本地图片才加载（D10）；远程、越界、其他协议返回 null。 */
export function resolveImagePath(src: string, ctx: PathContext): string | null {
  const route = routeHref(src, ctx);
  return route.kind === "path" ? route.relativePath : null;
}

/** 远程图片（http / https / 协议相对）：显示原文，不发请求。 */
export function isRemoteImage(src: string): boolean {
  return /^(?:https?:)?\/\//i.test(src.trim());
}
