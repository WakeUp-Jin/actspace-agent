import { getCollection, type CollectionEntry } from "astro:content";

export type BlogEntry = CollectionEntry<"blog">;

export async function getPublicPosts(): Promise<BlogEntry[]> {
  return (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (left, right) => right.data.publishedAt.getTime() - left.data.publishedAt.getTime(),
  );
}

export function blogHref(entry: BlogEntry): string {
  return `/blog/${entry.id.replace(/\.(md|mdx)$/i, "")}/`;
}

export function readingTime(markdown: string): number {
  const chineseCharacters = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (markdown.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? []).length;
  return Math.max(1, Math.ceil(chineseCharacters / 350 + latinWords / 220));
}
