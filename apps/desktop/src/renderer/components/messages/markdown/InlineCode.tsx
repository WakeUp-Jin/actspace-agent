import { useContext, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { isAbsolutePath, resolveWorkspacePath } from "../../markdown-common/paths";
import { MarkdownHostContext } from "./host";
import { withFileIcon } from "./FileIconLead";

type InlineCodeProps = ComponentPropsWithoutRef<"code"> & {
  node?: unknown;
  "data-path"?: string;
  "data-line"?: string;
};

/**
 * 行内代码；rehype-inline-paths 认出的路径变成可点的文件（强调色 + 文件图标，规范 §5.1）。
 * 宿主没有提供 openPath 时，路径按普通行内代码显示，不可点。
 */
export function InlineCode({
  node: _node,
  children,
  "data-path": rawPath,
  "data-line": lineText,
  ...props
}: InlineCodeProps) {
  const { openPath, workspaceRoot } = useContext(MarkdownHostContext);
  const path = rawPath && isAbsolutePath(rawPath) ? resolveWorkspacePath(rawPath, { workspaceRoot }) : rawPath;
  if (!path || !openPath) return <code {...props}>{children}</code>;
  const line = lineText ? Number(lineText) : undefined;
  const open = () => (line ? openPath(path, line) : openPath(path));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  };
  return (
    <code
      {...props}
      className="md-path"
      role="button"
      tabIndex={0}
      title={`在 ActSpace 中打开${line ? `（第 ${line} 行）` : ""}`}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      {withFileIcon(children)}
    </code>
  );
}
