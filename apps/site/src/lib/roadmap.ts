import { readFile } from "node:fs/promises";
import type { Heading, List, ListItem, Paragraph, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { roadmapSourceLabel, roadmapSourcePath } from "./roadmap/source-path";

const LIST_HEADING = "功能清单";
const COMPLETED_PATTERN = /^(.+?)\s+—\s+完成于\s+(\d{4}-\d{2}-\d{2})$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type RoadmapStatus = "open" | "completed";

export interface RoadmapItem {
  title: string;
  status: RoadmapStatus;
  completedAt?: string;
}

export class RoadmapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoadmapParseError";
  }
}

function lineOf(node: { position?: { start?: { line?: number } } }): number | undefined {
  return node.position?.start?.line;
}

function location(sourcePath: string, line: number | undefined): string {
  return line ? `${sourcePath} · 第 ${line} 行` : sourcePath;
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseTask(item: ListItem, sourcePath: string): RoadmapItem {
  const line = lineOf(item);
  if (typeof item.checked !== "boolean") {
    throw new RoadmapParseError(`${location(sourcePath, line)}：开发计划条目必须使用 Markdown 任务复选框。`);
  }
  if (item.children.length !== 1 || item.children[0]?.type !== "paragraph") {
    throw new RoadmapParseError(`${location(sourcePath, line)}：开发计划条目必须是单段、无嵌套的列表项。`);
  }

  const text = toString(item.children[0] as Paragraph).trim();
  if (!text) {
    throw new RoadmapParseError(`${location(sourcePath, line)}：开发计划标题不能为空。`);
  }

  if (!item.checked) {
    if (COMPLETED_PATTERN.test(text)) {
      throw new RoadmapParseError(`${location(sourcePath, line)}：未完成项目不能填写完成日期。`);
    }
    return { title: text, status: "open" };
  }

  const match = COMPLETED_PATTERN.exec(text);
  if (!match) {
    throw new RoadmapParseError(
      `${location(sourcePath, line)}：已完成项目必须使用“标题 — 完成于 YYYY-MM-DD”格式。`,
    );
  }
  const [, title, completedAt] = match;
  if (!title.trim()) {
    throw new RoadmapParseError(`${location(sourcePath, line)}：开发计划标题不能为空。`);
  }
  if (!isRealDate(completedAt)) {
    throw new RoadmapParseError(`${location(sourcePath, line)}：完成日期“${completedAt}”不是合法日期。`);
  }
  return { title: title.trim(), status: "completed", completedAt };
}

export function parseRoadmap(markdown: string, sourcePath = roadmapSourceLabel()): RoadmapItem[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const headingIndex = root.children.findIndex(
    (node) => node.type === "heading" && (node as Heading).depth === 2 && toString(node).trim() === LIST_HEADING,
  );
  if (headingIndex === -1) {
    throw new RoadmapParseError(`${sourcePath}：缺少“## ${LIST_HEADING}”标题。`);
  }

  const listNode = root.children.slice(headingIndex + 1).find((node) => node.type === "list") as List | undefined;
  if (!listNode || listNode.ordered) {
    throw new RoadmapParseError(`${sourcePath}：“${LIST_HEADING}”下必须包含无序任务列表。`);
  }

  const items = listNode.children.map((item) => parseTask(item, sourcePath));
  if (items.length === 0) {
    throw new RoadmapParseError(`${sourcePath}：开发计划至少需要一个条目。`);
  }

  const seenTitles = new Set<string>();
  for (const item of items) {
    if (seenTitles.has(item.title)) {
      throw new RoadmapParseError(`${sourcePath}：开发计划标题“${item.title}”重复。`);
    }
    seenTitles.add(item.title);
  }
  return items;
}

export async function loadRoadmap(): Promise<RoadmapItem[]> {
  const markdown = await readFile(roadmapSourcePath(), "utf8");
  return parseRoadmap(markdown, roadmapSourceLabel());
}
