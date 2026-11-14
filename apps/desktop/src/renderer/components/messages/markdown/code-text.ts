import { Children, isValidElement, type ReactNode } from "react";

/** 取一段 React 子树里的纯文本（代码块复制、Mermaid 源码都靠它）。 */
export function codeText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return codeText(child.props.children);
      return "";
    })
    .join("");
}

type CodeElementProps = { className?: string; "data-meta"?: string };

function codeElementProps(children: ReactNode): CodeElementProps | undefined {
  const codeElement = Children.toArray(children).find(isValidElement);
  return isValidElement<CodeElementProps>(codeElement) ? codeElement.props : undefined;
}

/** 围栏代码块的语言标注（`language-ts` → `ts`）。 */
export function fenceLanguage(children: ReactNode): string | undefined {
  return codeElementProps(children)?.className?.match(/language-([\w-]+)/)?.[1];
}

/** remark-code-meta 带到 `<code>` 上的围栏 meta（` ```ts title="a.ts" ` 里语言后面的部分）。 */
export function fenceMeta(children: ReactNode): string | undefined {
  return codeElementProps(children)?.["data-meta"];
}
