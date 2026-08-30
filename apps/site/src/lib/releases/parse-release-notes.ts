import { readFile } from "node:fs/promises";
import type { Heading, List, ListItem, Paragraph, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { ReleaseEntry, ReleaseMonth, ReleaseSection, ReleaseSectionType } from "./model";
import { renderInlineMarkdown } from "./render-inline-markdown";
import { releaseSourceLabel, releaseSourcePath } from "./source-path";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RELEASE_HEADING_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/;
const SECTION_TYPES = new Map<string, ReleaseSectionType>([
  ["新功能", "feature"],
  ["改进", "improvement"],
  ["问题修复", "fix"],
]);

interface PendingRelease {
  date: string;
  month: string;
  title: string;
  sections: ReleaseSection[];
  line?: number;
}

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

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseListItem(item: ListItem, sourcePath: string, month: string, releaseLine: number | undefined): string {
  const line = lineOf(item) ?? releaseLine;
  if (item.children.length !== 1 || item.children[0]?.type !== "paragraph") {
    throw new ReleaseParseError(
      `${location(sourcePath, month, line)}：更新条目必须是单段、无嵌套的 Markdown 列表项。`,
    );
  }

  const paragraph = item.children[0] as Paragraph;
  if (!toString(paragraph).trim()) {
    throw new ReleaseParseError(`${location(sourcePath, month, line)}：更新条目不能为空。`);
  }
  return renderInlineMarkdown(paragraph.children);
}

export function parseReleaseNotes(markdown: string, sourcePath = releaseSourceLabel()): ReleaseEntry[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const entries: ReleaseEntry[] = [];
  const seenDates = new Set<string>();
  let currentMonth: string | undefined;
  let currentRelease: PendingRelease | undefined;
  let currentSection: ReleaseSection | undefined;

  const finishRelease = () => {
    if (!currentRelease) return;
    if (currentRelease.sections.length === 0) {
      throw new ReleaseParseError(
        `${location(sourcePath, currentRelease.month, currentRelease.line)}：发布日期下至少需要一个“新功能 / 改进 / 问题修复”分类。`,
      );
    }
    const emptySection = currentRelease.sections.find((section) => section.itemsHtml.length === 0);
    if (emptySection) {
      throw new ReleaseParseError(
        `${location(sourcePath, currentRelease.month, currentRelease.line)}：每个更新分类至少需要一个列表项。`,
      );
    }

    entries.push({
      date: currentRelease.date,
      month: currentRelease.month,
      title: currentRelease.title,
      sections: currentRelease.sections,
      anchor: `release-${currentRelease.date}`,
      sourcePath: releaseSourceLabel(),
    });
    currentRelease = undefined;
    currentSection = undefined;
  };

  for (const node of root.children) {
    if (node.type === "heading") {
      const heading = node as Heading;
      const text = toString(heading).trim();

      if (heading.depth === 2) {
        finishRelease();
        currentMonth = MONTH_PATTERN.test(text) ? text : undefined;
        continue;
      }

      if (heading.depth === 3 && currentMonth) {
        finishRelease();
        const match = RELEASE_HEADING_PATTERN.exec(text);
        const line = lineOf(heading);
        if (!match) {
          throw new ReleaseParseError(
            `${location(sourcePath, currentMonth, line)}：发布标题必须使用“YYYY-MM-DD — 标题”格式。`,
          );
        }

        const [, date, title] = match;
        if (!isRealDate(date)) {
          throw new ReleaseParseError(`${location(sourcePath, currentMonth, line)}：日期“${date}”不是合法的 YYYY-MM-DD。`);
        }
        if (!date.startsWith(`${currentMonth}-`)) {
          throw new ReleaseParseError(`${location(sourcePath, currentMonth, line)}：日期 ${date} 不属于标题月份 ${currentMonth}。`);
        }
        if (!title.trim()) {
          throw new ReleaseParseError(`${location(sourcePath, currentMonth, line)}：发布标题不能为空。`);
        }
        if (seenDates.has(date)) {
          throw new ReleaseParseError(`${location(sourcePath, currentMonth, line)}：日期 ${date} 只能对应一次发布。`);
        }
        seenDates.add(date);
        currentRelease = { date, month: currentMonth, title: title.trim(), sections: [], line };
        currentSection = undefined;
        continue;
      }

      if (heading.depth === 4 && currentRelease) {
        const type = SECTION_TYPES.get(text);
        const line = lineOf(heading);
        if (!type) {
          throw new ReleaseParseError(
            `${location(sourcePath, currentRelease.month, line)}：未知分类“${text}”，只支持“新功能 / 改进 / 问题修复”。`,
          );
        }
        if (currentRelease.sections.some((section) => section.type === type)) {
          throw new ReleaseParseError(
            `${location(sourcePath, currentRelease.month, line)}：同一次发布不能重复“${text}”分类。`,
          );
        }
        currentSection = { type, itemsHtml: [] };
        currentRelease.sections.push(currentSection);
        continue;
      }

      if (currentRelease) {
        throw new ReleaseParseError(
          `${location(sourcePath, currentRelease.month, lineOf(heading))}：发布日期下只允许四级分类标题和列表项。`,
        );
      }
      continue;
    }

    if (node.type === "list" && currentRelease) {
      if (!currentSection) {
        throw new ReleaseParseError(
          `${location(sourcePath, currentRelease.month, lineOf(node))}：列表项必须放在更新分类标题之后。`,
        );
      }
      const list = node as List;
      if (list.ordered) {
        throw new ReleaseParseError(
          `${location(sourcePath, currentRelease.month, lineOf(node))}：更新分类必须使用无序列表。`,
        );
      }
      currentSection.itemsHtml.push(
        ...list.children.map((item) => parseListItem(item, sourcePath, currentRelease!.month, currentRelease!.line)),
      );
      continue;
    }

    if (currentRelease) {
      throw new ReleaseParseError(
        `${location(sourcePath, currentRelease.month, lineOf(node))}：发布日期下只允许分类标题和无序列表。`,
      );
    }
  }

  finishRelease();

  if (entries.length === 0) {
    throw new ReleaseParseError(`${sourcePath}：没有找到“YYYY-MM-DD — 标题”格式的 release 记录。`);
  }

  return entries.sort((left, right) => right.date.localeCompare(left.date));
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
