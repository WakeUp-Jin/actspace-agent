// 文档与博客正文的构建期结构变换（Sätteri hast 插件，运行在 Shiki 高亮之后、标题 id 之前）。
// 只改结构、不改原文；样式由 docs.css（文档）与 blog-article.css（博客 M2）分别决定。
import { fileURLToPath } from "node:url";
import { HEADING_TAGS, SKIP_TAGS, spacedTextValue } from "./cjk-spacing.mjs";

/** @typedef {NonNullable<import('@astrojs/markdown-satteri').SatteriProcessorOptions['hastPlugins']>[number]} HastPlugin */

const LANGUAGE_LABELS = {
  bash: "Bash", sh: "Shell", shell: "Shell", zsh: "Shell", console: "Shell",
  js: "JavaScript", javascript: "JavaScript", jsx: "JSX",
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX",
  json: "JSON", jsonc: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
  md: "Markdown", markdown: "Markdown", html: "HTML", xml: "XML", css: "CSS",
  go: "Go", python: "Python", py: "Python", rust: "Rust", diff: "Diff", sql: "SQL",
  plaintext: "Text", text: "Text", txt: "Text", plain: "Text",
};
const EMOJI_START = /^\s*(\p{Extended_Pictographic}️?)\s*/u;
const HEADING_NUMBER = /^(\s*)(\d+(?:\.\d+)*)([、.．]\s*)/;

/** @param {string} tagName @param {Record<string, unknown>} properties @param {any[]} children */
const h = (tagName, properties, children) => ({ type: "element", tagName, properties, children });
/** @param {string} value */
const text = (value) => ({ type: "text", value });
/** @param {any} node */
const isBlankText = (node) => node.type === "text" && !node.value.trim();

/** @param {any} node */
function plainText(node) {
  if (node.type === "text") return node.value ?? "";
  return Array.isArray(node.children) ? node.children.map(plainText).join("") : "";
}

/** 单图段落 → figure，alt 作图注；复用原 img 节点，保留 Astro 的图片优化。 */
function toFigure(node) {
  const content = node.children.filter((child) => !isBlankText(child));
  if (content.length !== 1 || content[0].type !== "element" || content[0].tagName !== "img") return undefined;
  const img = content[0];
  const alt = typeof img.properties?.alt === "string" ? img.properties.alt.trim() : "";
  return h("figure", {}, alt ? [img, h("figcaption", {}, [text(alt)])] : [img]);
}

/** emoji 开头的顶层段落 → 提示块，emoji 进左侧槽位。 */
function toCallout(node) {
  const [first, ...rest] = node.children;
  if (first?.type !== "text") return undefined;
  const match = EMOJI_START.exec(first.value);
  if (!match) return undefined;
  const remainder = first.value.slice(match[0].length);
  return h("div", { className: ["callout"] }, [
    h("span", { className: ["ico"], ariaHidden: "true" }, [text(match[1])]),
    h("div", {}, [...(remainder ? [text(remainder)] : []), ...rest]),
  ]);
}

/** 标题里手写的「2、」「3.1.」编号拆出来；原分隔符留在 .hn-sep 里，标题文字（锚点 slug）不变。 */
function splitHeadingNumber(node) {
  const [first, ...rest] = node.children;
  if (first?.type !== "text") return undefined;
  const match = HEADING_NUMBER.exec(first.value);
  if (!match) return undefined;
  const remainder = first.value.slice(match[0].length);
  return h(node.tagName, node.properties ?? {}, [
    h("span", { className: ["hn"] }, [text(match[1] + match[2]), h("span", { className: ["hn-sep"] }, [text(match[3])])]),
    h("span", { className: ["ht"] }, [...(remainder ? [text(remainder)] : []), ...rest]),
  ]);
}

/** Shiki 的 pre → 代码卡：顶栏（语言 / 行数 / 复制）+ 行号槽 + pre。 */
function toCodeCard(node) {
  const code = node.children.find((child) => child.type === "element" && child.tagName === "code");
  if (!code) return undefined;
  const props = node.properties ?? {};
  const className = [props.className, code.properties?.className].flat().filter(Boolean).join(" ");
  const lang = String(props.dataLanguage ?? /language-([\w-]+)/.exec(className)?.[1] ?? "plaintext").toLowerCase();
  const lines = plainText(code).replace(/\n$/, "").split("\n").length;
  const { style: _style, ...preProps } = props;
  return h("div", { className: ["code"], dataLang: lang }, [
    h("div", { className: ["code-bar"] }, [
      h("span", { className: ["code-lang"] }, [text(LANGUAGE_LABELS[lang] ?? lang)]),
      h("span", { className: ["code-lines"] }, [text(`${lines} 行`)]),
      h("button", { type: "button", className: ["code-copy"], ariaLabel: "复制代码", hidden: true }, [text("复制")]),
    ]),
    h("div", { className: ["code-body"] }, [
      h("div", { className: ["code-gutter"], ariaHidden: "true" }, [text(Array.from({ length: lines }, (_, i) => i + 1).join("\n"))]),
      h("pre", preProps, node.children),
    ]),
  ]);
}

/** @returns {HastPlugin} */
export function proseStructure() {
  return {
    name: "site-prose-structure",
    element: {
      filter: ["p", "h2", "h3", "pre"],
      visit(node, ctx) {
        if (node.tagName === "pre") return toCodeCard(node);
        if (node.tagName !== "p") return splitHeadingNumber(node);
        const parent = ctx.parent(node);
        if (parent?.type === "element" && parent.tagName === "blockquote" && !plainText(node).trim() && !node.children.some((c) => c.type === "element")) {
          ctx.removeNode(node);
          return undefined;
        }
        return toFigure(node) ?? (parent?.type === "root" ? toCallout(node) : undefined);
      },
    },
  };
}

/** @returns {HastPlugin} */
export function proseCjkSpacing() {
  return {
    name: "site-prose-cjk-spacing",
    text(node, ctx) {
      const inDocs = ctx.fileURL ? fileURLToPath(ctx.fileURL).replaceAll("\\", "/").includes("/src/content/docs/") : false;
      for (let parent = ctx.parent(node); parent && parent.type === "element"; parent = ctx.parent(parent)) {
        if (SKIP_TAGS.has(parent.tagName) || (inDocs && HEADING_TAGS.has(parent.tagName))) return;
      }
      const parent = ctx.parent(node);
      const index = ctx.indexOf(node);
      const siblings = parent?.children ?? [];
      const value = spacedTextValue(node.value, index ? siblings[index - 1] : undefined, index === undefined ? undefined : siblings[index + 1]);
      if (value !== node.value) ctx.setProperty(node, "value", value);
    },
  };
}
