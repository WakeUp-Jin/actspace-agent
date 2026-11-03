/**
 * 「文档」Markdown 编辑器的宿主接口（规范 §3.2）。
 *
 * core 不直接调用 `api/*`、React Context 或 `window`：需要外部能力时都经过这个接口，
 * 由 `MarkdownEditor.tsx`（T9）实现；单测里传一个假宿主即可。
 */
import type { MermaidRenderResult } from "../messages/mermaid-renderer";

export type { MermaidRenderResult };

export interface MarkdownEditorHost {
  /** 当前文档的工作区相对路径（如 `docs/a.md`）；用来把文中的相对路径解析成工作区路径。 */
  docPath: string;
  /** 工作区根目录的绝对路径；用来把工作区内的绝对路径转成相对路径。没有就不识别绝对路径。 */
  workspaceRoot?: string;
  /** 在 ActSpace 里打开工作区文件；`relativePath` 已规范化、已做越界检查。`line` 只对 Markdown 有意义。 */
  openPath(relativePath: string, line?: number): void;
  /** 打开外链（只会传 http / https / mailto）。 */
  openUrl(url: string): void;
  /** 读取工作区本地图片，返回 data URL；读不到返回 null。 */
  loadImage(relativePath: string): Promise<string | null>;
  /** 渲染 Mermaid（结果里的 SVG 已清理）；失败时 reject，带 `MermaidRenderError`。 */
  renderMermaid(source: string): Promise<MermaidRenderResult>;
  /** 查看大图；不提供时图上不出现「查看大图」。 */
  previewMermaid?(result: MermaidRenderResult): void;
}
