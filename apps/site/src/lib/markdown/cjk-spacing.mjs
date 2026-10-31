// 中文与英文、数字相邻时补一个空格。只改文字，不碰代码；文档标题跳过，避免锚点 slug 变化。
// 文档、博客的 Sätteri 插件与更新日志的 unified 管线共用这里。

const CJK = "⺀-⻿⼀-⿟぀-ゟ゠-ヿ㄀-ㄯ㈀-㋿㐀-䶿一-鿿豈-﫿";
const LATIN_START = "A-Za-z0-9@#$";
const LATIN_END = "A-Za-z0-9%";
const cjkThenLatin = new RegExp(`([${CJK}])([${LATIN_START}])`, "g");
const latinThenCjk = new RegExp(`([${LATIN_END}])([${CJK}])`, "g");
const isCjk = new RegExp(`[${CJK}]`);
const isLatinStart = new RegExp(`[${LATIN_START}]`);
const isLatinEnd = new RegExp(`[${LATIN_END}]`);

/** 不补空格的祖先元素。 */
export const SKIP_TAGS = new Set(["pre", "code", "kbd", "samp", "script", "style"]);
/** 文档标题被站内链接按锚点引用，补空格会改变 slug，所以文档里标题也跳过。 */
export const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** @param {string} text */
export function spaceCjk(text) {
  return text.replace(cjkThenLatin, "$1 $2").replace(latinThenCjk, "$1 $2");
}

/** @param {any} node */
function plainText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (Array.isArray(node.children)) return node.children.map(plainText).join("");
  return "";
}

/**
 * 一个文字节点补空格后的值：自身内部，加上和相邻行内元素（行内代码、链接、加粗）的交界处。
 * 中文紧贴行内代码时总是留空。交界只在文字这一侧加空格，所以两侧都是文字节点时不会重复。
 * @param {string} value
 * @param {any} previous 前一个兄弟节点
 * @param {any} next 后一个兄弟节点
 */
export function spacedTextValue(value, previous, next) {
  let out = spaceCjk(value);
  if (previous?.type === "element" && previous.tagName !== "br" && out) {
    const before = plainText(previous).slice(-1);
    const first = out[0];
    if ((isCjk.test(first) && (previous.tagName === "code" || isLatinEnd.test(before))) || (isLatinStart.test(first) && isCjk.test(before))) out = ` ${out}`;
  }
  if (next?.type === "element" && next.tagName !== "br" && out) {
    const after = plainText(next)[0] ?? "";
    const last = out.slice(-1);
    if ((isCjk.test(last) && (next.tagName === "code" || isLatinStart.test(after))) || (isLatinEnd.test(last) && isCjk.test(after))) out = `${out} `;
  }
  return out;
}

/**
 * 原地给一棵 hast 树补空格（更新日志的 unified 管线用）。
 * @param {any} node
 */
export function spaceHastTree(node) {
  if (!Array.isArray(node.children)) return;
  if (node.type === "element" && SKIP_TAGS.has(node.tagName)) return;
  node.children.forEach((child, index) => {
    if (child.type === "text") child.value = spacedTextValue(child.value, node.children[index - 1], node.children[index + 1]);
    else spaceHastTree(child);
  });
}
