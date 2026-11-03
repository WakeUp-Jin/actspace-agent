import { describe, expect, it } from "vitest";
import { CALLOUT_LABEL, parseCalloutMarker } from "../components/markdown-common/callouts";
import { classifyLinkTarget, dirnameOf, parseInlinePath, resolveWorkspacePath } from "../components/markdown-common/paths";

describe("parseInlinePath", () => {
  it.each([
    ["src/app.ts", { path: "src/app.ts" }],
    ["apps/desktop/src/renderer/components/messages/MarkdownProse.tsx", { path: "apps/desktop/src/renderer/components/messages/MarkdownProse.tsx" }],
    ["README.md", { path: "README.md" }],
    ["package.json", { path: "package.json" }],
    ["docs/设计/方案.md", { path: "docs/设计/方案.md" }],
    ["./notes/a.md", { path: "./notes/a.md" }],
    ["../shared/b.ts", { path: "../shared/b.ts" }],
    ["src/app.ts:42", { path: "src/app.ts", line: 42 }],
    ["src/app.ts:42-58", { path: "src/app.ts", line: 42, lineEnd: 58 }],
    ["@scope/pkg/index.d.ts", { path: "@scope/pkg/index.d.ts" }],
    ["docs/front-Markdown编辑与渲染规范.md:80", { path: "docs/front-Markdown编辑与渲染规范.md", line: 80 }],
  ])("识别 %s", (text, expected) => {
    expect(parseInlinePath(text)).toEqual(expected);
  });

  it.each([
    "1.2.3",
    "v1.2.3",
    "a/b",
    "src/components",
    "console.log",
    "obj.method",
    "foo bar.ts",
    "https://example.com/a.ts",
    "file:///tmp/a.ts",
    "/Users/me/a.ts",
    "~/a.ts",
    "C:\\work\\a.ts",
    "npm install",
    "useState",
    ".gitignore",
    "",
  ])("不识别 %s", (text) => {
    expect(parseInlinePath(text)).toBeNull();
  });
});

describe("parseInlinePath 的 absolute 选项", () => {
  it("认出绝对路径并原样返回，交给 resolveWorkspacePath 判断是否在工作区内", () => {
    expect(parseInlinePath("/work/repo/src/a.ts:12", { absolute: true })).toEqual({ path: "/work/repo/src/a.ts", line: 12 });
    expect(parseInlinePath("C:\\repo\\src\\a.ts", { absolute: true })).toEqual({ path: "C:/repo/src/a.ts" });
    expect(parseInlinePath("/work/repo/Makefile.mk", { absolute: true })).toEqual({ path: "/work/repo/Makefile.mk" });
    expect(resolveWorkspacePath("/work/repo/src/a.ts", { workspaceRoot: "/work/repo" })).toBe("src/a.ts");
  });

  it("仍然不认 URL、协议相对、~、目录和带空格的", () => {
    for (const text of ["//cdn/a.js", "~/a.ts", "/usr/local/bin", "/a b.ts", "https://x.dev/a.ts", "/"]) {
      expect(parseInlinePath(text, { absolute: true })).toBeNull();
    }
  });

  it("默认不认绝对路径", () => {
    expect(parseInlinePath("/work/repo/src/a.ts")).toBeNull();
  });
});

describe("classifyLinkTarget", () => {
  it("区分锚点、外链、本地、不可点", () => {
    expect(classifyLinkTarget("#安装")).toEqual({ kind: "anchor", id: "安装" });
    expect(classifyLinkTarget("https://example.com/x?y=1")).toEqual({ kind: "external", url: "https://example.com/x?y=1" });
    expect(classifyLinkTarget("mailto:a@b.c")).toEqual({ kind: "external", url: "mailto:a@b.c" });
    expect(classifyLinkTarget("javascript:alert(1)")).toEqual({ kind: "blocked" });
    expect(classifyLinkTarget("data:text/html,x")).toEqual({ kind: "blocked" });
    expect(classifyLinkTarget("//evil.com/a")).toEqual({ kind: "blocked" });
    expect(classifyLinkTarget("")).toEqual({ kind: "blocked" });
  });

  it("本地链接解码、带行号", () => {
    expect(classifyLinkTarget("docs/%E6%96%B9%E6%A1%88.md")).toEqual({ kind: "local", path: "docs/方案.md" });
    expect(classifyLinkTarget("src/a.ts:12")).toEqual({ kind: "local", path: "src/a.ts", line: 12 });
    expect(classifyLinkTarget("a.ts:12")).toEqual({ kind: "local", path: "a.ts", line: 12 });
    expect(classifyLinkTarget("README.md:3-9")).toEqual({ kind: "local", path: "README.md", line: 3 });
    expect(classifyLinkTarget("mailto:a@b.c")).toEqual({ kind: "external", url: "mailto:a@b.c" });
    expect(classifyLinkTarget("src/a.ts#L7")).toEqual({ kind: "local", path: "src/a.ts", line: 7 });
    expect(classifyLinkTarget("./b.md#小节")).toEqual({ kind: "local", path: "./b.md" });
    expect(classifyLinkTarget("file:///work/a.md")).toEqual({ kind: "local", path: "/work/a.md" });
  });
});

describe("resolveWorkspacePath", () => {
  it("行内代码路径默认相对工作区根，./ ../ 相对当前文档", () => {
    expect(resolveWorkspacePath("src/a.ts", { baseDir: "docs/notes" })).toBe("src/a.ts");
    expect(resolveWorkspacePath("./b.md", { baseDir: "docs/notes" })).toBe("docs/notes/b.md");
    expect(resolveWorkspacePath("../c.md", { baseDir: "docs/notes" })).toBe("docs/c.md");
  });

  it("链接和图片相对当前文档", () => {
    expect(resolveWorkspacePath("img/a.png", { baseDir: "docs", plainRelativeToBase: true })).toBe("docs/img/a.png");
  });

  it("工作区内绝对路径去掉根目录，工作区外和越界的不可点", () => {
    expect(resolveWorkspacePath("/work/repo/src/a.ts", { workspaceRoot: "/work/repo/" })).toBe("src/a.ts");
    expect(resolveWorkspacePath("/work/other/a.ts", { workspaceRoot: "/work/repo" })).toBeNull();
    expect(resolveWorkspacePath("/work/repo-x/a.ts", { workspaceRoot: "/work/repo" })).toBeNull();
    expect(resolveWorkspacePath("/a.ts")).toBeNull();
    expect(resolveWorkspacePath("~/a.ts")).toBeNull();
    expect(resolveWorkspacePath("../a.ts")).toBeNull();
    expect(resolveWorkspacePath("../../a.md", { baseDir: "docs" })).toBeNull();
    expect(resolveWorkspacePath("a/../../b.md")).toBeNull();
    expect(resolveWorkspacePath("a/./b/../c.md")).toBe("a/c.md");
    expect(resolveWorkspacePath("C:\\repo\\a.ts", { workspaceRoot: "C:\\repo" })).toBe("a.ts");
  });

  it("dirnameOf", () => {
    expect(dirnameOf("docs/a.md")).toBe("docs");
    expect(dirnameOf("a.md")).toBe("");
  });
});

describe("parseCalloutMarker", () => {
  it("五种类型，大小写不敏感", () => {
    for (const type of ["NOTE", "tip", "Important", "WARNING", "caution"]) {
      const hit = parseCalloutMarker(`[!${type}]\n正文`);
      expect(hit?.type).toBe(type.toLowerCase());
      expect(CALLOUT_LABEL[hit!.type]).toBeTruthy();
    }
  });

  it("标签后紧跟正文、只有标签、非提示框", () => {
    expect(parseCalloutMarker("[!NOTE] 后面就是正文")).toEqual({ type: "note", length: 8 });
    expect(parseCalloutMarker("[!WARNING]")).toEqual({ type: "warning", length: 10 });
    expect(parseCalloutMarker("[!INFO] x")).toBeNull();
    expect(parseCalloutMarker("说明 [!NOTE]")).toBeNull();
  });
});
