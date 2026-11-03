import type { ComponentPropsWithoutRef } from "react";

/** 宽表格在自己的容器里横向滚动，不撑宽整篇正文（规范 §6.6）。 */
export function MarkdownTable({ node: _node, ...props }: ComponentPropsWithoutRef<"table"> & { node?: unknown }) {
  return (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  );
}
