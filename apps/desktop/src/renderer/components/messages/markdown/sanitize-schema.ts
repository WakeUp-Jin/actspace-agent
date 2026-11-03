import { defaultSchema, type Options } from "rehype-sanitize";

/**
 * 聊天回复里原始 HTML 的白名单（规范 §5.6、§10）：GitHub 的 `defaultSchema`，只多放行本组件自己加的东西。
 * 默认就会去掉 `script`、`style`、`iframe`、事件属性、`style` 属性和 `javascript:` 之类的协议。
 * - `clobber` 置空：脚注 id 的前缀由 remark-rehype 的 clobberPrefix 给，其余 id / name 由 rehype-scope-ids 加；
 * - 额外放行：代码的 `math-*` 类名（remark-math 输出）、围栏 meta、提示框的类名和标签。
 *   `data-path` / `data-line` 不放行：它们由 rehype-inline-paths 在清理之后才加，回复自己写的不算数。
 */
const base = defaultSchema.attributes ?? {};

export const SANITIZE_SCHEMA: Options = {
  ...defaultSchema,
  clobber: [],
  attributes: {
    ...base,
    code: [...(base.code ?? []), ["className", /^language-./, "math-inline", "math-display"], "dataMeta"],
    blockquote: [...(base.blockquote ?? []), ["className", "md-callout", /^md-callout-/], "dataCalloutLabel"],
  },
};
