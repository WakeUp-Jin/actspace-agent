import { useMemo, useRef, type UIEvent } from "react";
import type { DiffHunk, TurnChangedFile } from "./turn-tail-data";

/**
 * 一个文件在本轮的改动对比，悬停浮层和 Review 标签共用。
 * 移植自 DeepSeek Harness `ui-deliverables/client/FileDiff.tsx`（MIT 许可，见 ../files/DEEPSEEK_HARNESS_LICENSE.txt）；
 * 数据来自本轮工具事件，不需要加载态。样式在 styles/diff.css 的 `.turn-diff*`。
 */

/** 每个文件最多绘制的行数。 */
export const MAX_RENDERED_LINES = 5000;

export type DiffRow = {
  kind: "add" | "del" | "context";
  old: number | undefined;
  new: number | undefined;
  text: string;
};

export type SplitRow = {
  left?: { no: number; text: string; kind: "del" | "context" };
  right?: { no: number; text: string; kind: "add" | "context" };
};

/** 给 hunk 的每行编号：上下文两侧都计数，删除只计旧侧，新增只计新侧。 */
export function hunkRows(hunk: DiffHunk): DiffRow[] {
  let oldNo = hunk.oldStart;
  let newNo = hunk.newStart;
  return hunk.lines.map((line) => {
    const text = line.slice(1);
    if (line[0] === "+") return { kind: "add", old: undefined, new: newNo++, text };
    if (line[0] === "-") return { kind: "del", old: oldNo++, new: undefined, text };
    return { kind: "context", old: oldNo++, new: newNo++, text };
  });
}

/** 左右对比的行：每段连续删除与紧随其后的连续新增逐行配对，上下文两侧都有。 */
export function splitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: NonNullable<SplitRow["left"]>[] = [];
  let adds: NonNullable<SplitRow["right"]>[] = [];
  const flush = () => {
    for (let at = 0; at < Math.max(dels.length, adds.length); at += 1) {
      rows.push({ ...(dels[at] ? { left: dels[at] } : {}), ...(adds[at] ? { right: adds[at] } : {}) });
    }
    dels = [];
    adds = [];
  };
  for (const row of hunkRows(hunk)) {
    if (row.kind === "del") dels.push({ no: row.old!, text: row.text, kind: "del" });
    else if (row.kind === "add") adds.push({ no: row.new!, text: row.text, kind: "add" });
    else {
      flush();
      rows.push({ left: { no: row.old!, text: row.text, kind: "context" }, right: { no: row.new!, text: row.text, kind: "context" } });
    }
  }
  flush();
  return rows;
}

/** 按 {@link MAX_RENDERED_LINES} 截断，返回保留的 hunk 和是否截断。 */
export function renderedHunks(hunks: readonly DiffHunk[]): { hunks: DiffHunk[]; truncated: boolean } {
  let budget = MAX_RENDERED_LINES;
  const kept: DiffHunk[] = [];
  for (const hunk of hunks) {
    if (budget === 0) return { hunks: kept, truncated: true };
    kept.push(hunk.lines.length <= budget ? hunk : { ...hunk, lines: hunk.lines.slice(0, budget) });
    budget -= Math.min(budget, hunk.lines.length);
  }
  return { hunks: kept, truncated: hunks.some((hunk, at) => kept[at] !== hunk) };
}

function hunkHeader(hunk: DiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

function splitRowKind(row: SplitRow): DiffRow["kind"] {
  return row.left?.kind === "del" ? "del" : row.right?.kind === "add" ? "add" : "context";
}

function noteOf(file: TurnChangedFile): string | undefined {
  if (file.deleted) return "本轮删除的文件";
  if (file.created) return "本轮新建的文件";
  if (file.hunks.length === 0) return "两侧内容相同";
  return undefined;
}

/**
 * @param split 左右对比；只有新增或只有删除时始终单栏。
 * @param preview 悬停浮层：隐藏 hunk 头和说明行。
 */
export function TurnFileDiff({ file, split, wrap, preview = false }: {
  file: TurnChangedFile;
  split: boolean;
  wrap: boolean;
  preview?: boolean;
}) {
  const { hunks, truncated } = useMemo(() => renderedHunks(file.hunks), [file.hunks]);
  const hasAdditions = hunks.some((hunk) => hunk.lines.some((line) => line[0] === "+"));
  const hasDeletions = hunks.some((hunk) => hunk.lines.some((line) => line[0] === "-"));
  const sideBySide = split && hasAdditions === hasDeletions;
  const note = noteOf(file);
  return (
    <div className="turn-diff min-h-0 flex-1" data-preview={preview || undefined}>
      <div className="turn-diff-body" data-view={sideBySide ? "split" : "unified"} data-wrap={wrap || undefined}>
        {note ? <p className="turn-diff-note" data-note={hunks.length === 0 ? "empty" : "metadata"}>{note}</p> : null}
        {truncated ? <p className="turn-diff-note">只显示前 {MAX_RENDERED_LINES} 行</p> : null}
        {sideBySide && !wrap ? <SplitColumns hunks={hunks} /> : hunks.map((hunk, position) => (
          <section key={position} className="turn-diff-hunk">
            <div className="turn-diff-hunk-header">{hunkHeader(hunk)}</div>
            {sideBySide ? splitRows(hunk).map((row, at) => (
              <div key={at} className="turn-diff-split-line" data-diff-line={splitRowKind(row)}>
                <span className={`turn-diff-cell ${row.left ? `is-${row.left.kind}` : "is-empty"}`}>
                  <span className="turn-diff-number">{row.left?.no ?? ""}</span>
                  <span className="turn-diff-text">{row.left?.text ?? ""}</span>
                </span>
                <span className={`turn-diff-cell ${row.right ? `is-${row.right.kind}` : "is-empty"}`}>
                  <span className="turn-diff-number">{row.right?.no ?? ""}</span>
                  <span className="turn-diff-text">{row.right?.text ?? ""}</span>
                </span>
              </div>
            )) : hunkRows(hunk).map((row, at) => (
              <div key={at} className={`turn-diff-line is-${row.kind}`} data-diff-line={row.kind}>
                <span className="turn-diff-number">{row.old ?? ""}</span>
                <span className="turn-diff-number">{row.new ?? ""}</span>
                <span className="turn-diff-sign">{row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}</span>
                <span className="turn-diff-text">{row.text}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * 不换行的左右对比：两栏各自裁掉长行，横纵两个方向互相跟随滚动，
 * 这样一侧的长行不会盖到另一侧，两侧始终显示相同的行与列。
 */
function SplitColumns({ hunks }: { hunks: readonly DiffHunk[] }) {
  const paired = useMemo(() => hunks.map((hunk) => ({ header: hunkHeader(hunk), rows: splitRows(hunk) })), [hunks]);
  const columns = useRef<Record<"left" | "right", HTMLDivElement | null>>({ left: null, right: null });
  const offsets = useRef({ left: { scrollLeft: 0, scrollTop: 0 }, right: { scrollLeft: 0, scrollTop: 0 } });
  const follow = (side: "left" | "right") => (event: UIEvent<HTMLDivElement>) => {
    const peer = side === "left" ? "right" : "left";
    const other = columns.current[peer];
    if (!other) return;
    for (const axis of ["scrollLeft", "scrollTop"] as const) {
      const value = event.currentTarget[axis];
      if (offsets.current[side][axis] === value) continue;
      offsets.current[side][axis] = value;
      other[axis] = value;
      // 记下浏览器夹紧后的值，避免对侧的滚动事件把源头拉回去。
      offsets.current[peer][axis] = other[axis];
    }
  };
  return (
    <div className="turn-diff-columns">
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          className="turn-diff-column"
          data-diff-side={side}
          ref={(element) => { columns.current[side] = element; }}
          onScroll={follow(side)}
        >
          {paired.map((hunk, position) => (
            <section key={position} className="turn-diff-hunk">
              <div className="turn-diff-hunk-header">{hunk.header}</div>
              {hunk.rows.map((row, at) => {
                const cell = row[side];
                return (
                  <div key={at} className={`turn-diff-side-line ${cell ? `is-${cell.kind}` : "is-empty"}`} data-diff-line={splitRowKind(row)}>
                    <span className="turn-diff-number">{cell?.no ?? ""}</span>
                    <span className="turn-diff-text">{cell?.text ?? ""}</span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
