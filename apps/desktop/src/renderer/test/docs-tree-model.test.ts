import { describe, expect, it } from "vitest";
import { ancestorDirs, buildDocsTree, editedMarkdownPaths, nameMatchRange, pruneDocsTree, type DocsDirNode } from "../components/right-panel/docs/docs-tree-model";

const FILES = [
  "README.md",
  "docs/b.md",
  "docs/a.md",
  "docs/deep/x/y.md",
  "docs/deep/z.md",
  "10-notes/2.md",
  "2-notes/1.md",
];

describe("buildDocsTree", () => {
  it("文件夹在前、文件在后，各自排序；文件夹篇数是其下 Markdown 总数", () => {
    const tree = buildDocsTree(FILES);
    expect(tree.map((node) => node.name)).toEqual(["2-notes", "10-notes", "docs", "README.md"]);
    const docs = tree.find((node) => node.name === "docs") as DocsDirNode;
    expect(docs.count).toBe(4);
    expect(docs.children.map((node) => node.name)).toEqual(["deep", "a.md", "b.md"]);
    expect((docs.children[0] as DocsDirNode).count).toBe(2);
  });

  it("清单里没有的文件夹不会出现（没有 Markdown 的文件夹天然被隐藏）", () => {
    expect(buildDocsTree(["a/b.md"]).map((node) => node.path)).toEqual(["a"]);
    expect(buildDocsTree([])).toEqual([]);
  });
});

describe("pruneDocsTree", () => {
  const tree = buildDocsTree(FILES);

  it("无筛选时原样返回，不自动展开", () => {
    const result = pruneDocsTree(tree, { filter: "all", query: "", editedPaths: new Set() });
    expect(result.matchedFiles).toBe(FILES.length);
    expect(result.autoExpand.size).toBe(0);
  });

  it("搜索只看文件名且不分大小写，命中项的所有祖先自动展开", () => {
    const result = pruneDocsTree(tree, { filter: "all", query: "Y.MD", editedPaths: new Set() });
    expect(result.matchedFiles).toBe(1);
    expect([...result.autoExpand].sort()).toEqual(["docs", "docs/deep", "docs/deep/x"]);
    // 目录名不参与匹配。
    expect(pruneDocsTree(tree, { filter: "all", query: "deep", editedPaths: new Set() }).matchedFiles).toBe(0);
  });

  it("「本会话改过」只留改过的文件并展开祖先", () => {
    const result = pruneDocsTree(tree, { filter: "session", query: "", editedPaths: new Set(["docs/a.md", "README.md"]) });
    expect(result.matchedFiles).toBe(2);
    expect(result.nodes.map((node) => node.name)).toEqual(["docs", "README.md"]);
    expect([...result.autoExpand]).toEqual(["docs"]);
    expect((result.nodes[0] as DocsDirNode).children.map((node) => node.name)).toEqual(["a.md"]);
  });

  it("裁剪不改变文件夹自身的总篇数", () => {
    const result = pruneDocsTree(tree, { filter: "session", query: "", editedPaths: new Set(["docs/a.md"]) });
    expect((result.nodes[0] as DocsDirNode).count).toBe(4);
  });
});

describe("nameMatchRange / ancestorDirs", () => {
  it("返回命中区间，空查询或没命中返回 null", () => {
    expect(nameMatchRange("Readme.md", "ADM")).toEqual([2, 5]);
    expect(nameMatchRange("a.md", "")).toBeNull();
    expect(nameMatchRange("a.md", "zz")).toBeNull();
  });

  it("列出祖先文件夹", () => {
    expect(ancestorDirs("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(ancestorDirs("c.md")).toEqual([]);
  });
});

describe("editedMarkdownPaths", () => {
  it("绝对路径转工作区相对路径，只保留工作区内的 Markdown", () => {
    const result = editedMarkdownPaths(
      ["/ws/docs/a.md", "/ws/docs/b.MARKDOWN", "/ws/src/app.ts", "/other/c.md", "docs/d.md", "./e.md", "file:///ws/f.md"],
      "/ws/",
    );
    expect([...result].sort()).toEqual(["docs/a.md", "docs/b.MARKDOWN", "docs/d.md", "e.md", "f.md"]);
  });

  it("没有工作区根时，绝对路径一律丢弃", () => {
    expect([...editedMarkdownPaths(["/ws/a.md", "b.md"], undefined)]).toEqual(["b.md"]);
  });
});
