/**
 * 「一个路径是不是在某个目录里面」只在这里实现一次。
 *
 * `shared` 同时跑在浏览器和 Node 里，自己不引 `node:path`，路径规则由调用方传进来：
 * Node 里传 `node:path`，界面里传 `pathe`。测试传 `path.posix` 和 `path.win32`，
 * 在同一台机器上把两种平台的规则都跑到。
 */
export type PathRules = {
  readonly relative: (from: string, to: string) => string;
  readonly isAbsolute: (path: string) => boolean;
  readonly sep: string;
};

/**
 * `candidate` 在 `root` 里面时返回它相对 `root` 的路径，`candidate` 就是 `root` 时返回空字符串；不在里面返回 `null`。
 *
 * 只比较路径的字面：不读磁盘，不解析符号链接。要防符号链接指到外面，调用方先对两边做 realpath 再传进来。
 * 两个路径怎么解读由 `rules.relative` 决定：相对路径按当前工作目录解析，`.`、`..` 和多余的分隔符先折叠，
 * Windows 上不分大小写。
 */
export function relativePathInside(rules: PathRules, root: string, candidate: string): string | null {
  const nested = rules.relative(root, candidate);
  // `..foo` 是合法的名字，整段是 `..` 才是往上走；Windows 上跨盘符时 relative 返回的是绝对路径。
  if (nested === ".." || nested.startsWith(`..${rules.sep}`) || rules.isAbsolute(nested)) return null;
  return nested;
}

/**
 * `candidate` 是不是在 `root` 里面。`candidate` 就是 `root` 本身时算不算由 `includeRoot` 决定，每个调用点都要写明。
 *
 * 和 `relativePathInside` 一样只比较字面，不解析符号链接。
 */
export function isLexicallyInside(
  rules: PathRules,
  root: string,
  candidate: string,
  options: { readonly includeRoot: boolean },
): boolean {
  const nested = relativePathInside(rules, root, candidate);
  return nested !== null && (nested !== "" || options.includeRoot);
}
