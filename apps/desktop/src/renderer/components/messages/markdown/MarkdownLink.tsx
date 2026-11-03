import { useContext, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { classifyLinkTarget, resolveWorkspacePath } from "../../markdown-common/paths";
import { FootnoteNumbersContext, IdPrefixContext } from "./contexts";
import { footnoteKeyFromHref } from "./definitions";
import { MarkdownHostContext } from "./host";
import { withFileIcon } from "./FileIconLead";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

/** `#片段`：只在当前回复内查找、滚动、转移焦点；不让 Electron 导航到 file URL 或别的回复。 */
function followFragment(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault();
  let id: string;
  try { id = decodeURIComponent(href.slice(1)); } catch { return; }
  const reply = event.currentTarget.closest(".markdown-prose");
  const target = Array.from(reply?.querySelectorAll<HTMLElement>("[id]") ?? []).find((element) => element.id === id);
  if (!target) return;
  target.scrollIntoView({ block: "center" });
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
}

/**
 * 回复里的链接（规范 §5.1）：
 * - 网页链接只放行 http / https / mailto，新窗口打开，由主进程交给系统浏览器；
 * - 工作区内的本地链接：文字前加文件图标，单击经宿主打开；没有宿主或路径越界时按普通文字显示；
 * - 脚注引用：编号换成全文顺序的编号；
 * - 其余协议不可点。
 */
export function MarkdownLink({ href, children, node: _node, ...rest }: LinkProps) {
  const { openPath, workspaceRoot } = useContext(MarkdownHostContext);
  const prefix = useContext(IdPrefixContext);
  const footnoteNumbers = useContext(FootnoteNumbersContext);
  const target = href ? classifyLinkTarget(href) : ({ kind: "blocked" } as const);
  const describedBy = rest["aria-describedby"]?.split(/\s+/).map((id) => (id === "footnote-label" ? `${prefix}footnote-label` : id)).join(" ");

  if (target.kind === "anchor" && href) {
    const number = (rest as Record<string, unknown>)["data-footnote-ref"] !== undefined ? footnoteNumbers.get(footnoteKeyFromHref(href, prefix) ?? "") : undefined;
    return <a {...rest} href={href} aria-describedby={describedBy} onClick={(event) => followFragment(event, href)}>{number ?? children}</a>;
  }
  if (target.kind === "external") {
    return <a {...rest} href={target.url} target="_blank" rel="noreferrer noopener">{children}</a>;
  }
  if (target.kind === "local") {
    const path = resolveWorkspacePath(target.path, { workspaceRoot });
    if (path && openPath) {
      return (
        <a
          {...rest}
          href={href}
          className="md-link-file"
          title={`在 ActSpace 中打开${target.line ? `（第 ${target.line} 行）` : ""}`}
          onClick={(event) => {
            event.preventDefault();
            if (target.line) openPath(path, target.line);
            else openPath(path);
          }}
        >
          {withFileIcon(children)}
        </a>
      );
    }
  }
  // 不可点：不留 href，避免点击后导航走。
  return <span>{children}</span>;
}
