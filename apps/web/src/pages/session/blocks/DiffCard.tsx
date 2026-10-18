import { useState } from "react";
import { Pressable } from "../../../ui/Pressable";
import { ToolLine } from "./ToolLine";

export const DIFF_FOLD_LINES = 12;
type Row = { readonly kind: "add" | "del" | "meta" | "ctx"; readonly text: string };

export function parseDiff(diff: string): Row[] {
  return diff.replace(/\n$/, "").split("\n").map((line): Row => {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff ")) return { kind: "meta", text: line };
    if (line.startsWith("+")) return { kind: "add", text: line.slice(1) };
    if (line.startsWith("-")) return { kind: "del", text: line.slice(1) };
    return { kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line };
  });
}

type Props = {
  readonly kind: "edit_diff" | "write_diff";
  readonly filePath: string;
  readonly additions: number;
  readonly deletions: number;
  readonly diff: string;
  readonly status?: string;
  readonly errorMessage?: string;
};

/** 文件改动行「编辑 name +N -N」，点开看 diff；超过 12 行折叠，点「还有 N 行」展开。 */
export function DiffCard({ kind, filePath, additions, deletions, diff, status, errorMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const rows = diff ? parseDiff(diff) : [];
  const hidden = all ? 0 : Math.max(0, rows.length - DIFF_FOLD_LINES);
  const shown = hidden ? rows.slice(0, DIFF_FOLD_LINES) : rows;
  const name = filePath.split("/").pop() || filePath;
  const running = status === "running" || status === "pending";
  const failed = status === "failed" || Boolean(errorMessage);
  return (
    <ToolLine
      verb={status === "denied" ? "Denied" : kind === "write_diff" ? "写入" : "编辑"}
      target={name}
      title={filePath}
      running={running}
      error={failed}
      extra={status === "denied" ? null : <><span className="tl-add">+{additions}</span><span className="tl-del">-{deletions}</span></>}
      {...(rows.length || errorMessage ? { open, onToggle: () => setOpen(value => !value) } : {})}
    >
      <div className="tool-out">
        {errorMessage ? <p className="m-0 px-3 py-2 text-act-sm text-danger">{errorMessage}</p> : null}
        {rows.length ? (
          <div className="diff py-1" role="group" aria-label="文件改动">
            {shown.map((row, index) => (
              <div key={index} className="diff-row" data-kind={row.kind}>
                <span className="diff-gutter" aria-hidden>{row.kind === "add" ? "+" : row.kind === "del" ? "-" : ""}</span>
                <span className="diff-text">{row.text || " "}</span>
              </div>
            ))}
          </div>
        ) : null}
        {hidden ? <Pressable className="min-h-9 border-t border-line px-3 text-act-sm text-text-muted" onClick={() => setAll(true)}>还有 {hidden} 行</Pressable> : null}
      </div>
    </ToolLine>
  );
}
