/**
 * 宿主上下文：把 `MarkdownEditorHost` 作为 facet 放进编辑器状态，
 * 装饰、widget、点击处理都从 `state.facet(hostFacet)` 取，core 里没有任何全局变量。
 * 宿主换了（比如换了一篇文档，`docPath` 变了），`setHost` 重新配置 Compartment，装饰随之重算。
 */
import { Facet, type EditorState } from "@codemirror/state";
import type { MarkdownEditorHost } from "../host";
import { dirnameOf } from "../../markdown-common/paths";

export const hostFacet = Facet.define<MarkdownEditorHost, MarkdownEditorHost | null>({
  combine: (values) => values[values.length - 1] ?? null,
});

export function hostOf(state: EditorState): MarkdownEditorHost | null {
  return state.facet(hostFacet);
}

/** 解析相对路径要用到的上下文。没有宿主时按“文档在工作区根目录”处理，也认不出工作区内的绝对路径。 */
export interface PathContext {
  docPath: string;
  baseDir: string;
  workspaceRoot?: string;
}

export function pathContextOf(state: EditorState): PathContext {
  const host = hostOf(state);
  const docPath = host?.docPath ?? "";
  return { docPath, baseDir: dirnameOf(docPath), workspaceRoot: host?.workspaceRoot };
}
