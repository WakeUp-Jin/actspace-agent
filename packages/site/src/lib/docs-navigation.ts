import { getCollection, type CollectionEntry } from "astro:content";

export const docsGroups = [
  { id: "getting-started", label: "开始使用" },
  { id: "core-concepts", label: "核心概念" },
  { id: "guides", label: "能力指南" },
  { id: "contributing", label: "开发与贡献" },
] as const;

export type DocsEntry = CollectionEntry<"docs">;

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
