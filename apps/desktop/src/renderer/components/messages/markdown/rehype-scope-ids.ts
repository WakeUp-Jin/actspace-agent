import type { HastNode } from "./hast-types";

/**
 * 原始 HTML 里的 `id` / `name` 加上这条回复的稳定前缀，同回复内指向它们的 `#片段` 链接一起改（规范 §5.6）。
 * 这样回复里写的 `<a id="x">` 不会覆盖页面上的同名元素或 `window.x`，也不会和别的回复串跳。
 * 排在 rehype-sanitize 后面：sanitize 的 clobber 被置空，由这里统一加前缀；
 * 已经带前缀的（脚注）不动，脚注标题 `footnote-label` 由链接 / 标题组件映射。
 */
export function rehypeScopeIds({ prefix }: { prefix: string }) {
  const scope = (value: string) => (value.startsWith(prefix) || value === "footnote-label" ? value : `${prefix}${value}`);
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      for (const child of node.children ?? []) {
        if (child.type !== "element") continue;
        const properties = child.properties;
        if (properties) {
          for (const key of ["id", "name"] as const) {
            if (typeof properties[key] === "string") properties[key] = scope(properties[key] as string);
          }
          for (const key of ["ariaDescribedBy", "ariaLabelledBy"] as const) {
            const value = properties[key];
            if (Array.isArray(value)) properties[key] = value.map((item) => scope(String(item)));
            else if (typeof value === "string") properties[key] = value.split(/\s+/).filter(Boolean).map(scope).join(" ");
          }
          if (typeof properties.href === "string" && properties.href.startsWith("#") && properties.href.length > 1) {
            const target = properties.href.slice(1);
            properties.href = `#${scope(target)}`;
          }
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
