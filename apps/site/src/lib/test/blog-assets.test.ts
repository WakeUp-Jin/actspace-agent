import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const siteRoot = fileURLToPath(new URL("../../../", import.meta.url));
const blogDirectory = join(siteRoot, "src/content/blog");
const sourceImagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;

describe("blog article assets", () => {
  it("uses deployment-base-neutral paths for repository-owned images", () => {
    const markdownFiles = readdirSync(blogDirectory).filter((name) => name.endsWith(".md"));
    const localImages: Array<{ file: string; href: string }> = [];

    for (const file of markdownFiles) {
      const markdown = readFileSync(join(blogDirectory, file), "utf8");
      for (const match of markdown.matchAll(sourceImagePattern)) {
        const href = match[1];
        if (href.includes("assets/blog/source/")) localImages.push({ file, href });
      }
    }

    expect(localImages.length).toBeGreaterThan(0);

    for (const { file, href } of localImages) {
      expect(href, `${file} must use Astro's source asset pipeline`).toMatch(/^\.\.\/\.\.\/assets\/blog\/source\//);

      const markdownPath = join(blogDirectory, file);
      const repositoryAsset = resolve(dirname(markdownPath), href);
      expect(existsSync(repositoryAsset), `${file} references missing asset ${href}`).toBe(true);
    }
  });
});
