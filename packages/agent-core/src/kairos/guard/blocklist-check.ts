/**
 * Kairos blocklist 路径校验。
 *
 * 模式（详见 docs/exec-plans/active/kairos_config_and_tool_guard.md §5）：
 * - `**` 匹配任意路径段（含分隔符）
 * - `*` 匹配当前段任意字符（不含 /）
 * - `?` 匹配单字符
 * - 其它字符按字面量
 *
 * 例：
 * - `**\/secret/**` → 命中任意包含 `/secret/` 的路径
 * - `*.env`         → 命中末段为 `*.env` 的路径
 * - `node_modules/**` → 命中以 `node_modules/` 开头的相对路径
 *
 * 不引入 micromatch / picomatch；blocklist 用例简单，自实现的轻量正则足够。
 */

/** 把 glob 模式编译为锚定到首尾的 RegExp。 */
export function globToRegex(pattern: string): RegExp {
  // 用占位符占住带 / 的复合模式与单独的 ** / * / ?，最后再注入 regex 片段。
  // 复合模式吸 0 段：与 micromatch 默认行为一致，满足用户对 `**/secret/**` 的直觉。
  const STAR_SLASH = "\u0001";        // 字面 `**/` → (?:.*/)?
  const SLASH_STAR = "\u0002";        // 字面 `/**` → (?:/.*)?
  const DOUBLE_STAR = "\u0003";       // 剩余的 `**` → .*
  const SINGLE_STAR = "\u0004";       // `*` → [^/]*
  const QUESTION = "\u0005";          // `?` → [^/]

  let pre = pattern
    .replace(/\*\*\//g, STAR_SLASH)
    .replace(/\/\*\*/g, SLASH_STAR)
    .replace(/\*\*/g, DOUBLE_STAR)
    .replace(/\*/g, SINGLE_STAR)
    .replace(/\?/g, QUESTION);

  pre = pre.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  const compiled = pre
    .replace(new RegExp(STAR_SLASH, "g"), "(?:.*/)?")
    .replace(new RegExp(SLASH_STAR, "g"), "(?:/.*)?")
    .replace(new RegExp(DOUBLE_STAR, "g"), ".*")
    .replace(new RegExp(SINGLE_STAR, "g"), "[^/]*")
    .replace(new RegExp(QUESTION, "g"), "[^/]");

  return new RegExp(`^${compiled}$`);
}

/** 给定一组 glob，返回一个 reusable matcher（pre-compile 每个 glob）。 */
export function createBlocklistMatcher(globs: string[]): (target: string) => boolean {
  const regs = globs.map((g) => globToRegex(g));
  return (target: string) => regs.some((r) => r.test(target));
}

/** 单次调用便捷接口（少量调用时用；高频请用 createBlocklistMatcher）。 */
export function matchesAnyGlob(target: string, globs: string[]): boolean {
  return globs.some((g) => globToRegex(g).test(target));
}
