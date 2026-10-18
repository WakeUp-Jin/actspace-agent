import { useState } from "react";
import { ToolLine } from "./ToolLine";

/** 思考过程：默认折叠，点开看内容；进行中扫光。title 来自共享选择器，是英文，不显示。 */
export function ThinkingRow({ content, running }: { readonly title?: string; readonly content: string; readonly running: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <ToolLine verb={<span className={running ? undefined : "text-text-faint"}>{running ? "思考中" : "思考过程"}</span>} running={running} open={open} onToggle={() => setOpen(value => !value)}>
      {content ? <p className="tl-body m-0">{content}</p> : null}
    </ToolLine>
  );
}
