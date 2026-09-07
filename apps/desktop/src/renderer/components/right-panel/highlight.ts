/**
 * 右侧面板代码高亮：按需注册的 highlight.js 实例 + 按行切分的高亮输出。
 *
 * 为什么不用 `import hljs from "highlight.js"`：
 * 那是全量入口，会把 192 种语法全部打进 renderer bundle（实测构建产物里能搜到
 * Brainfuck / VHDL / Fortran 等永远用不到的语法），而实际可达语言只有下面这些。
 * 这里从 `highlight.js/lib/core` 起，逐个注册真正会用到的语言。
 *
 * 注册表的**值域必须覆盖** main 侧 `workspace-fs-service.ts` 的 `LANGUAGE_BY_EXT` /
 * `LANGUAGE_BY_BASENAME`，否则文件会静默回退成纯文本。两侧各有一条单测锁住这个约束。
 */

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cmake from "highlight.js/lib/languages/cmake";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import dos from "highlight.js/lib/languages/dos";
import elixir from "highlight.js/lib/languages/elixir";
import go from "highlight.js/lib/languages/go";
import gradle from "highlight.js/lib/languages/gradle";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import protobuf from "highlight.js/lib/languages/protobuf";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import scss from "highlight.js/lib/languages/scss";
// `shell` 是独立模块（shell 会话），不是 bash 的 alias。Markdown 里 ```shell 很常见，必须带上。
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import vim from "highlight.js/lib/languages/vim";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * 本仓库实际可达的语法集合。
 *
 * 同时被两处消费：本模块的 hljs 实例（文件视图），以及 `MarkdownRenderView` 里
 * `rehype-highlight` 的 `languages`（Markdown fenced code）。后者默认只有 lowlight 的
 * `common`，覆盖面比这里窄（缺 dockerfile / protobuf / dart 等），共用一份能让两处对齐。
 *
 * `toml` 不是独立模块，它是 ini 的 alias；register 会连 alias 一起注册。
 */
export const LANGUAGE_MODULES = {
  bash,
  c,
  cmake,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  dos,
  elixir,
  go,
  gradle,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  perl,
  php,
  plaintext,
  powershell,
  protobuf,
  python,
  r,
  ruby,
  rust,
  scala,
  scss,
  shell,
  sql,
  swift,
  typescript,
  vim,
  xml,
  yaml,
} as const;

for (const [name, definition] of Object.entries(LANGUAGE_MODULES)) {
  hljs.registerLanguage(name, definition);
}

/**
 * 本实例显式注册的语言名（**不含 alias**）。
 * 只用于「没把全量语法拖进来」这类体积断言；判断某个 id 能否高亮请用 `isSupportedLanguage`。
 */
export function listRegisteredLanguages(): string[] {
  return hljs.listLanguages().sort();
}

/** 是否能高亮该语言 id。走 `getLanguage` 才能解析 alias（例如 `toml` 是 `ini` 的 alias）。 */
export function isSupportedLanguage(language: string | undefined): boolean {
  return typeof language === "string" && Boolean(hljs.getLanguage(language));
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 按逻辑行返回高亮后的 HTML 片段。
 *
 * 为什么必须按行拆：行号 gutter 用 CSS grid 每行一个 row，需要「一行 HTML = 一个逻辑行」
 * 的结构。而 hljs 的输出里 span 可以跨行
 * （块注释、模板字符串、多行字符串），直接按 `\n` 切会切出未闭合标签。
 * 这里在换行处把当前所有未闭合的 span 收尾，并在下一行重新打开同样的栈。
 *
 * 返回数组长度恒等于 `content.split("\n").length`；一旦拆分结果与逻辑行数不一致
 * （语法定义的边界情况），整体降级为转义纯文本，宁可丢高亮也不能让行号错位。
 */
export function highlightToLines(content: string, language?: string): string[] {
  const plainLines = content.split("\n");
  if (!language || !hljs.getLanguage(language)) {
    return plainLines.map(escapeHtml);
  }
  let html: string;
  try {
    html = hljs.highlight(content, { language, ignoreIllegals: true }).value;
  } catch {
    return plainLines.map(escapeHtml);
  }
  const highlighted = splitHighlightedLines(html);
  return highlighted.length === plainLines.length ? highlighted : plainLines.map(escapeHtml);
}

/** 只匹配 hljs 产出的两种标记：带 class 的 span 开标签，和 span 闭标签。 */
const HLJS_TAG_PATTERN = /<span class="([^"]*)">|<\/span>/g;

function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const openTags: string[] = [];
  let current = "";

  const appendText = (text: string) => {
    const segments = text.split("\n");
    for (let index = 0; index < segments.length; index += 1) {
      if (index > 0) {
        current += "</span>".repeat(openTags.length);
        lines.push(current);
        current = openTags.join("");
      }
      current += segments[index];
    }
  };

  let cursor = 0;
  HLJS_TAG_PATTERN.lastIndex = 0;
  let match = HLJS_TAG_PATTERN.exec(html);
  while (match) {
    appendText(html.slice(cursor, match.index));
    if (match[1] === undefined) {
      openTags.pop();
      current += "</span>";
    } else {
      const tag = `<span class="${match[1]}">`;
      openTags.push(tag);
      current += tag;
    }
    cursor = HLJS_TAG_PATTERN.lastIndex;
    match = HLJS_TAG_PATTERN.exec(html);
  }
  appendText(html.slice(cursor));
  lines.push(current);
  return lines;
}
