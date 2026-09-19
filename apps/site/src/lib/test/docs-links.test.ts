import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { satteri } from "@astrojs/markdown-satteri";
import { describe, expect, it } from "vitest";
import { docsLinks } from "../docs-links.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = join(root, "src/content/docs");
const files = readdirSync(dir).filter(file => file.endsWith(".md"));

describe("public documentation links", () => {
  it.each(["/", "/actspace-agent", "/preview/site/"])("renders links under %s, including the welcome alias", async (base) => {
    const prefix = base === "/" ? "" : base.replace(/\/$/, "");
    const routes = new Set(files.map(file => `${prefix}/docs/${file.replace(/\.md$/, "")}/`));
    const renderer = await satteri({mdastPlugins:[docsLinks({base})]}).createRenderer({syntaxHighlight:false});
    for (const file of files) {
      const markdown = readFileSync(join(dir, file), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
      const {code} = await renderer.render(markdown, {fileURL:pathToFileURL(join(dir,file))});
      for (const [, href] of code.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
        expect(href, `${file}: unresolved relative link`).not.toMatch(/^\.{1,2}\//);
        if (href.startsWith("/")) expect(routes.has(href.split("#")[0]), `${file}: unknown document ${href}`).toBe(true);
      }
      if(file === "what-is-actspace.md") expect(code).toContain(`href="${prefix}/docs/getting-started/"`);
    }
  });

  it("does not rewrite blog article links", async () => {
    const renderer = await satteri({mdastPlugins:[docsLinks({base:"/actspace-agent"})]}).createRenderer({syntaxHighlight:false});
    const {code} = await renderer.render('[original](../source/)', {fileURL:pathToFileURL(join(root,"src/content/blog/example.md"))});
    expect(code).toContain('href="../source/"');
  });
});
