import { readFile } from "node:fs/promises";
import type { Heading, Root, Table, TableCell, TableRow } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { ReleaseEntry, ReleaseMonth } from "./model";
import { renderInlineMarkdown } from "./render-inline-markdown";
import { releaseSourceLabel, releaseSourcePath } from "./source-path";

const EXPECTED_HEADERS = ["日期", "功能域", "用户价值", "变更摘要"];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ReleaseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseParseError";
  }
}

function lineOf(node: { position?: { start?: { line?: number } } }): number | undefined {
  return node.position?.start?.line;
}

function location(sourcePath: string, month: string | undefined, line: number | undefined): string {
  return [sourcePath, month ? `月份 ${month}` : undefined, line ? `第 ${line} 行` : undefined]
    .filter(Boolean)
    .join(" · ");
}

function cellText(cell: TableCell | undefined): string {
  return cell ? toString(cell).trim() : "";
}

function isExpectedTable(table: Table): boolean {
  const header = table.children[0];
  if (!header || header.children.length !== EXPECTED_HEADERS.length) return false;
  return EXPECTED_HEADERS.every((expected, index) => cellText(header.children[index]) === expected);
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseRow(
  row: TableRow,
  month: string,
  sourcePath: string,
  sourceIndex: number,
  dayCounts: Map<string, number>,
): ReleaseEntry & { sourceIndex: number } {
  const line = lineOf(row);
  if (row.children.length !== EXPECTED_HEADERS.length) {
    throw new ReleaseParseError(
      `${location(sourcePath, month, line)}：更新记录必须包含 4 列，实际为 ${row.children.length} 列。`,
    );
  }

  const [dateCell, areaCell, userValueCell, summaryCell] = row.children;
  const date = cellText(dateCell);
  const area = cellText(areaCell);
  const userValue = cellText(userValueCell);
  const summary = cellText(summaryCell);

  if (!isRealDate(date)) {
    throw new ReleaseParseError(`${location(sourcePath, month, line)}：日期“${date || "<空>"}”不是合法的 YYYY-MM-DD。`);
  }
  if (!date.startsWith(`${month}-`)) {
    throw new ReleaseParseError(`${location(sourcePath, month, line)}：日期 ${date} 不属于标题月份 ${month}。`);
  }
  if (!area || !userValue || !summary) {
    throw new ReleaseParseError(`${location(sourcePath, month, line)}：功能域、用户价值和变更摘要都不能为空。`);
  }

  const dayIndex = (dayCounts.get(date) ?? 0) + 1;
  dayCounts.set(date, dayIndex);

  return {
    date,
    month,
    area,
    userValueHtml: renderInlineMarkdown(userValueCell),
    summaryHtml: renderInlineMarkdown(summaryCell),
    anchor: `release-${date}-${dayIndex}`,
    sourcePath: releaseSourceLabel(),
    sourceIndex,
  };
}

export function parseReleaseNotes(markdown: string, sourcePath = releaseSourceLabel()): ReleaseEntry[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const entries: Array<ReleaseEntry & { sourceIndex: number }> = [];
  const dayCounts = new Map<string, number>();
  let currentMonth: string | undefined;
  let sourceIndex = 0;

  for (const node of root.children) {
    if (node.type === "heading" && (node as Heading).depth === 2) {
      const candidate = toString(node).trim();
      currentMonth = MONTH_PATTERN.test(candidate) ? candidate : undefined;
      continue;
    }

    if (node.type !== "table" || !currentMonth || !isExpectedTable(node as Table)) continue;

    for (const row of (node as Table).children.slice(1)) {
      entries.push(parseRow(row, currentMonth, sourcePath, sourceIndex, dayCounts));
      sourceIndex += 1;
    }
  }

  if (entries.length === 0) {
    throw new ReleaseParseError(
      `${sourcePath}：没有找到“日期 / 功能域 / 用户价值 / 变更摘要”格式的 release 表格。`,
    );
  }

  return entries
    .sort((left, right) => right.date.localeCompare(left.date) || left.sourceIndex - right.sourceIndex)
    .map(({ sourceIndex: _sourceIndex, ...entry }) => entry);
}

export async function loadReleaseNotes(): Promise<ReleaseEntry[]> {
  const path = releaseSourcePath();
  const markdown = await readFile(path, "utf8");
  return parseReleaseNotes(markdown, releaseSourceLabel());
}

export function groupReleaseNotes(entries: ReleaseEntry[]): ReleaseMonth[] {
  const groups = new Map<string, ReleaseEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.month) ?? [];
    group.push(entry);
    groups.set(entry.month, group);
  }
  return Array.from(groups, ([month, monthEntries]) => ({ month, entries: monthEntries }));
}
