/** 系统提示词差异：按行 LCS，带 3 行上下文分块，输出形态同 DSH 的 `promptDiffLines`。 */
export type PromptDiffLine = { readonly kind: "meta" | "context" | "added" | "removed"; readonly text: string };

type Op = { readonly sign: " " | "+" | "-"; readonly text: string };

const CONTEXT = 3;
/** 中间段 LCS 表的最大格数；超出时退化为整段删除再整段新增。 */
const MAX_LCS_CELLS = 4_000_000;

function lineOps(before: readonly string[], after: readonly string[]): Op[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const a = before.slice(head, before.length - tail);
  const b = after.slice(head, after.length - tail);
  const ops: Op[] = before.slice(0, head).map(text => ({ sign: " ", text }));
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
    ops.push(...a.map((text): Op => ({ sign: "-", text })), ...b.map((text): Op => ({ sign: "+", text })));
  } else {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { ops.push({ sign: " ", text: a[i]! }); i += 1; j += 1; }
      else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) { ops.push({ sign: "-", text: a[i]! }); i += 1; }
      else { ops.push({ sign: "+", text: b[j]! }); j += 1; }
    }
    for (; i < a.length; i += 1) ops.push({ sign: "-", text: a[i]! });
    for (; j < b.length; j += 1) ops.push({ sign: "+", text: b[j]! });
  }
  ops.push(...after.slice(after.length - tail).map((text): Op => ({ sign: " ", text })));
  return ops;
}

/** 文本相同返回空数组；否则每个分块先有一行 `@@ -a,b +c,d @@`，分块之间空一行。 */
export function promptDiffLines(before: string, after: string): readonly PromptDiffLine[] {
  const ops = lineOps(before.split("\n"), after.split("\n"));
  const changed = ops.flatMap((op, index) => (op.sign === " " ? [] : [index]));
  if (changed.length === 0) return [];
  const ranges: [number, number][] = [];
  for (const index of changed) {
    const last = ranges.at(-1);
    if (last && index - last[1] <= CONTEXT * 2 + 1) last[1] = index;
    else ranges.push([index, index]);
  }
  const oldAt: number[] = [];
  const newAt: number[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const op of ops) {
    oldAt.push(oldLine);
    newAt.push(newLine);
    if (op.sign !== "+") oldLine += 1;
    if (op.sign !== "-") newLine += 1;
  }
  return ranges.flatMap(([first, last], hunk) => {
    const from = Math.max(0, first - CONTEXT);
    const to = Math.min(ops.length - 1, last + CONTEXT);
    const slice = ops.slice(from, to + 1);
    const oldLines = slice.filter(op => op.sign !== "+").length;
    const newLines = slice.filter(op => op.sign !== "-").length;
    const oldStart = oldLines === 0 ? oldAt[from]! - 1 : oldAt[from]!;
    const newStart = newLines === 0 ? newAt[from]! - 1 : newAt[from]!;
    const lines = slice.map((op): PromptDiffLine => ({
      kind: op.sign === "+" ? "added" : op.sign === "-" ? "removed" : "context",
      text: `${op.sign}${op.text}`,
    }));
    return [
      ...(hunk === 0 ? [] : [{ kind: "meta", text: "" } as const]),
      { kind: "meta", text: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@` } as const,
      ...lines,
    ];
  });
}
