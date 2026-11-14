import { describe, expect, it } from "vitest";
import type { PathContext } from "../components/markdown-editor/core/context";
import { isRemoteImage, resolveCodePath, resolveImagePath, routeHref } from "../components/markdown-editor/core/paths";

const ctx: PathContext = { docPath: "docs/guide/note.md", baseDir: "docs/guide", workspaceRoot: "/work/space" };
const rootCtx: PathContext = { docPath: "note.md", baseDir: "", workspaceRoot: "/work/space" };

describe("resolveCodePath：行内代码路径（D12）", () => {
  it.each([
    ["src/app.ts", { relativePath: "src/app.ts" }],
    ["README.md", { relativePath: "README.md" }],
    ["./sibling.md", { relativePath: "docs/guide/sibling.md" }],
    ["../up.md", { relativePath: "docs/up.md" }],
    ["../../root.ts", { relativePath: "root.ts" }],
    ["src/app.ts:42", { relativePath: "src/app.ts", line: 42 }],
    ["src/app.ts:42-58", { relativePath: "src/app.ts", line: 42 }],
    // 规范 §8.2：工作区内的绝对路径去掉根目录前缀
    ["/work/space/a.ts", { relativePath: "a.ts" }],
    ["/work/space/docs/b.md:7", { relativePath: "docs/b.md", line: 7 }],
  ])("%s", (text, expected) => {
    expect(resolveCodePath(text, ctx)).toEqual(expected);
  });

  it.each([
    "1.2.3",
    "a/b",
    "console.log",
    "foo bar.ts",
    "https://x.com/a.ts",
    "../../../escape.ts",
    "/etc/passwd",
    "/etc/hosts.conf",
    "/work/space-x/a.ts",
    "~/a.ts",
    "",
  ])("不识别 %s", (text) => {
    expect(resolveCodePath(text, ctx)).toBeNull();
  });

  it("没有工作区根时，绝对路径一律不识别", () => {
    expect(resolveCodePath("/work/space/a.ts", { docPath: "a.md", baseDir: "" })).toBeNull();
  });

  it("文档在工作区根目录时，./ 相对于根", () => {
    expect(resolveCodePath("./a.md", rootCtx)).toEqual({ relativePath: "a.md" });
    expect(resolveCodePath("../a.md", rootCtx)).toBeNull();
  });
});

describe("routeHref：链接目标路由", () => {
  it("锚点", () => {
    expect(routeHref("#安装", ctx)).toEqual({ kind: "anchor", id: "安装" });
    expect(routeHref("#", ctx)).toEqual({ kind: "none" });
  });

  it("外链只放行 http / https / mailto", () => {
    expect(routeHref("https://example.com/a?b=1", ctx)).toEqual({ kind: "external", url: "https://example.com/a?b=1" });
    expect(routeHref("http://example.com", ctx)).toEqual({ kind: "external", url: "http://example.com" });
    expect(routeHref("mailto:a@b.c", ctx)).toEqual({ kind: "external", url: "mailto:a@b.c" });
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "vbscript:x", "//evil.com/a", ""])(
    "%s 不可点",
    (href) => {
      expect(routeHref(href, ctx)).toEqual({ kind: "none" });
    },
  );

  it("本地链接相对当前文档所在目录", () => {
    expect(routeHref("other.md", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/other.md" });
    expect(routeHref("./other.md", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/other.md" });
    expect(routeHref("../a.md", ctx)).toEqual({ kind: "path", relativePath: "docs/a.md" });
    expect(routeHref("sub/b.png", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/sub/b.png" });
  });

  it("百分号编码解码、带行号", () => {
    expect(routeHref("%E6%96%B9%E6%A1%88.md", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/方案.md" });
    expect(routeHref("sub/a.ts:12", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/sub/a.ts", line: 12 });
    expect(routeHref("a.ts#L7", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/a.ts", line: 7 });
  });

  it("本地链接带 #锚点：去掉锚点，只打开文件", () => {
    expect(routeHref("b.md#小节", ctx)).toEqual({ kind: "path", relativePath: "docs/guide/b.md" });
  });

  it("工作区内的绝对路径去掉根前缀", () => {
    expect(routeHref("/work/space/docs/a.md", ctx)).toEqual({ kind: "path", relativePath: "docs/a.md" });
  });

  it.each(["/etc/passwd", "/work/other/a.md", "~/a.md", "../../../x.md", "../../../../x.md"])(
    "工作区外 / 越界 %s 不可点",
    (href) => {
      expect(routeHref(href, ctx)).toEqual({ kind: "none" });
    },
  );

  it("没有工作区根目录就不认绝对路径", () => {
    expect(routeHref("/work/space/docs/a.md", { ...ctx, workspaceRoot: undefined })).toEqual({ kind: "none" });
  });
});

describe("图片路径（D10）", () => {
  it("本地图片解析成工作区相对路径", () => {
    expect(resolveImagePath("img/a.png", ctx)).toBe("docs/guide/img/a.png");
    expect(resolveImagePath("../shared/b.png", ctx)).toBe("docs/shared/b.png");
    expect(resolveImagePath("/work/space/pics/c.png", ctx)).toBe("pics/c.png");
  });

  it("远程、越界、其他协议、锚点都不加载", () => {
    expect(resolveImagePath("https://x.com/a.png", ctx)).toBeNull();
    expect(resolveImagePath("//x.com/a.png", ctx)).toBeNull();
    expect(resolveImagePath("../../../a.png", ctx)).toBeNull();
    expect(resolveImagePath("data:image/png;base64,AAAA", ctx)).toBeNull();
    expect(resolveImagePath("file:///a.png", ctx)).toBeNull();
    expect(resolveImagePath("#x", ctx)).toBeNull();
  });

  it("isRemoteImage：http、https、协议相对", () => {
    expect(isRemoteImage("http://a/b.png")).toBe(true);
    expect(isRemoteImage("HTTPS://a/b.png")).toBe(true);
    expect(isRemoteImage("//a/b.png")).toBe(true);
    expect(isRemoteImage("img/a.png")).toBe(false);
    expect(isRemoteImage("data:image/png;base64,AA")).toBe(false);
  });
});
