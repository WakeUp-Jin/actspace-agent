// Zero-width characters survive String.prototype.trim(); relays sometimes send them as placeholder content.
// 非全局正则：遇到第一个可见字就返回，不像 replace 那样每次复制整串（流式时每帧都会调用，run7 合计约 200 MB）。
const VISIBLE_CHARACTER = /[^\s\u200b-\u200d\u2060\ufeff]/;

/** True when the text has at least one character a reader can see. */
export function hasVisibleText(text: string): boolean {
  return VISIBLE_CHARACTER.test(text);
}

// 字母、数字或表情：有一个就算正文。只有标点（DeepSeek 在两次工具调用之间偶尔吐一个「.」）不算。
const READABLE_CHARACTER = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

/** True when assistant prose carries something to read, not just punctuation or whitespace. Display-only; the stored text is unchanged. */
export function hasReadableText(text: string): boolean {
  return READABLE_CHARACTER.test(text);
}
