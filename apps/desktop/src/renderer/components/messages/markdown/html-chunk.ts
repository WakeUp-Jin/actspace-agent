/**
 * 原始 HTML chunk：rehype-raw、rehype-sanitize 和白名单 schema（规范 §9.2、§5.6）。
 * 由 lazy-plugins.ts 动态 import，不进主包。
 */
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Options } from "react-markdown";
import { rehypeScopeIds } from "./rehype-scope-ids";
import { SANITIZE_SCHEMA } from "./sanitize-schema";

/** 解析并清理原始 HTML；顺序固定：先 raw 解析，再按白名单清理，最后给剩下的 id / name 加前缀。 */
export function htmlRehypePlugins(prefix: string): NonNullable<Options["rehypePlugins"]> {
  return [rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA], [rehypeScopeIds, { prefix }]];
}
