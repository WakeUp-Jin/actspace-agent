import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { firstArticleImage } from "../blog-presentation";

const blogDirectory = fileURLToPath(new URL("../../content/blog/", import.meta.url));
const assetsDirectory = fileURLToPath(new URL("../../assets/blog/", import.meta.url));

describe("firstArticleImage", () => {
  it("returns the first local article image, skipping code examples", () => {
    expect(firstArticleImage("正文\n\n```md\n![例子](../../assets/blog/source/x/fake.png)\n```\n\n![图](../../assets/blog/source/a/%E4%BA%8B.png)\n\n![二](../../assets/blog/source/a/2.png)"))
      .toBe("source/a/事.png");
    expect(firstArticleImage("没有图")).toBeUndefined();
  });

  it("finds an existing image for every post that has one", () => {
    for (const file of readdirSync(blogDirectory).filter((name) => name.endsWith(".md"))) {
      const image = firstArticleImage(readFileSync(join(blogDirectory, file), "utf8"));
      if (image) expect(() => readFileSync(join(assetsDirectory, image)), `${file}: ${image}`).not.toThrow();
    }
  });
});
