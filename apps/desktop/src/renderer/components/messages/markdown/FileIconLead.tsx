import { FileText } from "lucide-react";
import { Children, type ReactNode } from "react";

/**
 * 路径、本地链接前面的文件图标（规范 §5.1）。
 *
 * 图标是行内块，它和后面的文字之间天然有断行机会；路径又是 `overflow-wrap: anywhere`，
 * 窄的时候图标会单独留在上一行末尾、路径挪到下一行。这里把图标和正文第一个字符包进不换行的
 * `.md-path-lead`，两者总在同一行；`textContent` 不变，复制和批注不受影响。
 * 第一个子节点不是文字时（流式末尾的渐显 span 等），只包图标。
 */
export function withFileIcon(children: ReactNode): ReactNode {
  const icon = <FileText className="md-path-icon" size={12} strokeWidth={2} aria-hidden="true" />;
  const list = Children.toArray(children);
  const first = list[0];
  if (typeof first !== "string" || !first) {
    return (
      <>
        <span className="md-path-lead">{icon}</span>
        {children}
      </>
    );
  }
  const lead = String.fromCodePoint(first.codePointAt(0)!);
  return (
    <>
      <span className="md-path-lead">{icon}{lead}</span>
      {first.slice(lead.length)}
      {list.slice(1)}
    </>
  );
}
