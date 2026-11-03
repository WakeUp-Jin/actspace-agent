/**
 * 插件里用到的最小 hast / mdast 节点形状。
 * 聊天区 Markdown 的 unified 插件都是手写的小转换，不值得为它们引入 @types/hast、@types/mdast。
 */
export type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: object;
  position?: { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } };
};

/** 元素的 className（数组或字符串都见过）统一成字符串数组。 */
export function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}
