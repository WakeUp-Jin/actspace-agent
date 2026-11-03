/**
 * `#标题` 链接的 slug，按 GitHub 规则（规范 §8.3）：
 * 转小写，去掉除字母、数字、下划线、连字符、空格以外的字符，空格变成连字符；
 * 重名的标题依次加 `-1`、`-2`。
 */

/** 单个标题文字 → slug（不处理重名）。 */
export function githubSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** 给一组标题文字按顺序生成唯一 slug（GitHub 的重名规则）。 */
export function uniqueSlugs(texts: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  });
}
