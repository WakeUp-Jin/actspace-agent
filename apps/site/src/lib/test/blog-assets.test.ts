import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, RootContent } from "mdast";
import { describe, expect, it } from "vitest";

const siteRoot = fileURLToPath(new URL("../../../", import.meta.url));
const blogDirectory = join(siteRoot, "src/content/blog");
const stripFrontmatter = (text: string) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

function imageUrls(markdown: string): string[] {
  const tree = unified().use(remarkParse).parse(stripFrontmatter(markdown));
  const urls: string[] = [];
  const definitions = new Map<string, string>();
  const references: string[] = [];
  function visit(node: Root | RootContent) {
    if (node.type === "image") urls.push(node.url);
    if (node.type === "definition") definitions.set(node.identifier, node.url);
    if (node.type === "imageReference") references.push(node.identifier);
    if (node.type === "html") {
      for (const tag of node.value.matchAll(/<img\b[^>]*>/gi)) {
        const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
        if (src) urls.push(src[1] ?? src[2] ?? src[3]);
      }
    }
    if ("children" in node) for (const child of node.children) visit(child as RootContent);
  }
  visit(tree);
  for (const id of references) {
    const url = definitions.get(id);
    if (!url) throw new Error(`Unresolved image reference: ${id}`);
    urls.push(url);
  }
  return urls;
}

describe("blog article assets", () => {
  it("recognizes parentheses, HTML images and reference images, excluding code examples", () => {
    expect(imageUrls('![图](./image/image%20(73).png)\n\n<img src="./html.png" />\n\n![图][diagram]\n\n[diagram]: ./reference.png\n\n```md\n![example](missing.png)\n```')).toEqual([
      "./image/image%20(73).png", "./html.png", "./reference.png",
    ]);
  });

  it("keeps every article image local and available through Astro's asset pipeline", () => {
    const files = readdirSync(blogDirectory).filter((name) => name.endsWith(".md"));
    let count = 0;
    for (const file of files) {
      const markdownPath = join(blogDirectory, file);
      const markdown = readFileSync(markdownPath, "utf8");
      for (const href of imageUrls(markdown)) {
        count++;
        expect(href, `${file}: avoid temporary authenticated image URLs`).toMatch(/^\.\.\/\.\.\/assets\/blog\/source\//);
        expect(existsSync(resolve(dirname(markdownPath), decodeURI(href))), `${file}: missing image ${href}`).toBe(true);
      }
      const cover = /^cover:\s*(.+)$/m.exec(markdown)?.[1]?.replace(/^['"]|['"]$/g, "");
      expect(cover, `${file}: missing cover`).toBeTruthy();
      expect(existsSync(join(siteRoot, "public", cover!)), `${file}: missing cover asset`).toBe(true);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("preserves the bytes of migrated article illustrations", () => {
    const manifest = JSON.parse(readFileSync(join(siteRoot, "blog-migration.json"), "utf8"));
    const assets: Array<{target: string; sha256: string}> = [
      ...manifest.articles.flatMap((article: { assets: unknown[] }) => article.assets),
      ...manifest.restoredImages,
    ];
    for (const asset of assets) {
      const digest = createHash("sha256").update(readFileSync(join(siteRoot, asset.target))).digest("hex");
      expect(digest, `Migrated image changed: ${asset.target}`).toBe(asset.sha256);
    }
  });
});
