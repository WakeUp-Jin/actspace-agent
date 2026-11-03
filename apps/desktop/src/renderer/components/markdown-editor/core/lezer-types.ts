/**
 * Lezer 语法树的节点类型。`@lezer/common` 不是本包的直接依赖，
 * 这里从 `@codemirror/language` 的 `syntaxTree` 返回值反推，避免新增依赖。
 */
import type { syntaxTree } from "@codemirror/language";

export type SyntaxTree = ReturnType<typeof syntaxTree>;

export type SyntaxNode = SyntaxTree["topNode"];
export type SyntaxNodeRef = Parameters<NonNullable<Parameters<SyntaxTree["iterate"]>[0]["enter"]>>[0];
