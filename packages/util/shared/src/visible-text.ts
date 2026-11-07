// Zero-width characters survive String.prototype.trim(); relays sometimes send them as placeholder content.
// 非全局正则：遇到第一个可见字就返回，不像 replace 那样每次复制整串（流式时每帧都会调用，run7 合计约 200 MB）。
const VISIBLE_CHARACTER = /[^\s\u200b-\u200d\u2060\ufeff]/;

/** True when the text has at least one character a reader can see. */
export function hasVisibleText(text: string): boolean {
  return VISIBLE_CHARACTER.test(text);
}
