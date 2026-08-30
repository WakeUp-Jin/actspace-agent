import { describe, expect, it } from "vitest";
import { listMappedLanguages } from "../../main/workspace-fs-service";
import {
  highlightToLines,
  isSupportedLanguage,
  listRegisteredLanguages,
} from "../components/right-panel/highlight";

describe("按需注册的语言覆盖面", () => {
  // 防漂移锁（renderer 侧一端）：main 按扩展名 / basename 派发的每个语言，
  // 这个实例都必须能高亮，否则文件会静默回退成纯文本，且没人会发现。
  // main 侧另有一条测试保证这些 id 是 highlight.js 真实存在的语言。
  it("覆盖 main 侧映射用到的全部语言", () => {
    const missing = listMappedLanguages().filter((language) => !isSupportedLanguage(language));
    expect(missing).toEqual([]);
  });

  it("只注册用得到的语言，不把全量语法拖进来", () => {
    const registered = listRegisteredLanguages();
    // 全量 highlight.js 是 192 种；这里应该远小于它。
    expect(registered.length).toBeLessThan(100);
    // 抽查几个确定用不到的语法确实没被注册。
    for (const unused of ["brainfuck", "vhdl", "fortran", "erlang", "mathematica"]) {
      expect(registered).not.toContain(unused);
    }
  });

  it("toml 通过 ini 的 alias 生效，不需要单独注册模块", () => {
    expect(listRegisteredLanguages()).not.toContain("toml");
    expect(isSupportedLanguage("toml")).toBe(true);
  });
});

describe("highlightToLines", () => {
  it("行数恒等于逻辑行数", () => {
    const content = "const a = 1;\nconst b = 2;\nconst c = 3;";
    expect(highlightToLines(content, "typescript")).toHaveLength(3);
  });

  it("末尾空行也算一行，行号不会少一行", () => {
    expect(highlightToLines("a\nb\n", "typescript")).toHaveLength(3);
  });

  it("跨行 span 在每行内自闭合，不产生未闭合标签", () => {
    const content = "/*\n 块注释跨三行\n*/\nconst a = 1;";
    const lines = highlightToLines(content, "typescript");
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const opened = (line.match(/<span/g) ?? []).length;
      const closed = (line.match(/<\/span>/g) ?? []).length;
      expect(opened).toBe(closed);
    }
    // 前三行都应带上注释 token 的着色，而不是只有第一行有。
    expect(lines[0]).toContain("hljs-comment");
    expect(lines[1]).toContain("hljs-comment");
    expect(lines[2]).toContain("hljs-comment");
  });

  it("无语言或未注册语言时回退为转义纯文本", () => {
    expect(highlightToLines("a < b & c", undefined)).toEqual(["a &lt; b &amp; c"]);
    expect(highlightToLines("<x>", "no-such-language")).toEqual(["&lt;x&gt;"]);
  });

  it("转义纯文本分支也保持一行一项", () => {
    expect(highlightToLines("1\n2\n3", undefined)).toEqual(["1", "2", "3"]);
  });
});