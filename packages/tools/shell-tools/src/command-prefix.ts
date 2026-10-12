/** Conservative literal-command analysis, used only to reuse explicit user grants. */
const PROGRAMS = new Set(["pnpm", "npm", "yarn", "cargo", "go", "make", "tsc", "vitest", "eslint", "prettier"]);
const GIT_COMMANDS = new Set(["status", "diff", "log", "show"]);
const EXCLUDED: Readonly<Record<string, ReadonlySet<string>>> = {
  pnpm: new Set(["dlx", "exec", "publish", "login", "config"]),
  npm: new Set(["exec", "x", "publish", "login", "config"]),
  yarn: new Set(["dlx", "exec", "publish", "login", "config"]),
};
const UNSUPPORTED = /[;&|<>`$(){}!\n\r\\~*?\[\]#\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;

export function analyzeCommandPrefixGrant(command: string): { readonly argv: readonly string[]; readonly prefix: readonly string[] } | undefined {
  if (UNSUPPORTED.test(command)) return undefined;
  const head = /^[ \t]*([A-Za-z][A-Za-z0-9._+-]*)(?=[ \t]|$)/.exec(command)?.[1];
  if (!head || (!PROGRAMS.has(head) && head !== "git")) return undefined;
  const argv: string[] = [];
  let token = "", started = false, quote: string | undefined;
  for (const char of command) {
    if (quote) { if (char === quote) quote = undefined; else token += char; started = true; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (char === " " || char === "\t") { if (started) argv.push(token); token = ""; started = false; }
    else { token += char; started = true; }
  }
  if (quote) return undefined;
  if (started) argv.push(token);
  const args = argv.slice(1);
  if (args.some(arg => /^--(?:prefix|userconfig|registry)(?:=|$)/.test(arg))) return undefined;
  const excluded = EXCLUDED[head];
  if (excluded) {
    if (args.some(arg => excluded.has(arg) || /^--global(?:=|$)/.test(arg) || /^-[^-]*g/.test(arg))) return undefined;
    if (args[0]?.startsWith("-") && !["-v", "--version", "-h", "--help"].includes(args[0])) return undefined;
  }
  if (head === "git") {
    const sub = /^[ \t]*git[ \t]+([a-z]+)(?=[ \t]|$)/.exec(command)?.[1];
    if (!sub || !GIT_COMMANDS.has(sub) || args.some(arg => /^--output(?:=|$)/.test(arg))) return undefined;
    return { argv, prefix: [head, sub] };
  }
  return { argv, prefix: [head] };
}
