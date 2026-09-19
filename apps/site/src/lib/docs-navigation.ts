import { getCollection, type CollectionEntry } from "astro:content";

export const docsGroups = [
  { id: "getting-started", label: "开始使用" },
  { id: "workspace-sessions", label: "工作区与会话" },
  { id: "models-context", label: "模型与上下文" },
  { id: "tools-execution", label: "工具与执行" },
  { id: "workbench", label: "工作台" },
  { id: "extensions", label: "扩展" },
  { id: "settings-development", label: "设置与开发" },
] as const;

export type DocsEntry = CollectionEntry<"docs">;
export type DocsGroupId = (typeof docsGroups)[number]["id"];

export async function getPublicDocs(): Promise<DocsEntry[]> {
  return (await getCollection("docs", ({ data }) => !data.draft)).sort(
    (left, right) =>
      docsGroups.findIndex((group) => group.id === left.data.group) -
        docsGroups.findIndex((group) => group.id === right.data.group) ||
      left.data.order - right.data.order ||
      left.data.title.localeCompare(right.data.title),
  );
}

export function docsHref(entry: DocsEntry): string {
  return `/docs/${entry.id.replace(/\.(md|mdx)$/i, "")}/`;
}

export function docsGroupHref(groupId: DocsGroupId, docs: DocsEntry[]): string {
  if (groupId === "getting-started") return "/docs/";
  const firstEntry = docs.find((entry) => entry.data.group === groupId);
  return firstEntry ? docsHref(firstEntry) : "/docs/";
}
