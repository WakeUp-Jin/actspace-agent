/** Conservative literal-command analysis, used only to reuse explicit user grants. */
const PROGRAMS = new Set(["pnpm", "npm", "yarn", "cargo", "go", "make", "tsc", "vitest", "eslint", "prettier"]);
const GIT_COMMANDS = new Set(["status", "diff", "log", "show", "ls-files", "rev-list", "rev-parse"]);
const QUERIES = new Set(["ls", "pwd", "du", "stat", "file", "cat", "head", "tail", "wc", "rg", "grep"]);
const VERSIONS = new Set(["node", "python", "python3"]);
const EXCLUDED: Readonly<Record<string, ReadonlySet<string>>> = {
  pnpm: new Set(["dlx", "exec", "publish", "login", "config"]),
  npm: new Set(["exec", "x", "publish", "login", "config"]),
  yarn: new Set(["dlx", "exec", "publish", "login", "config"]),
};
const UNSUPPORTED = /[;&|<>`$(){}!\n\r\\~*?\[\]#\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;

export function analyzeCommandPrefixGrant(command: string): { readonly argv: readonly string[]; readonly prefix: readonly string[]; readonly directory?: string; readonly queryPaths?: readonly string[] } | undefined {
  if (UNSUPPORTED.test(command)) return undefined;
  const head = /^[ \t]*([A-Za-z][A-Za-z0-9._+-]*)(?=[ \t]|$)/.exec(command)?.[1];
  if (!head || (!PROGRAMS.has(head) && !QUERIES.has(head) && !VERSIONS.has(head) && head !== "git")) return undefined;
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
  if (VERSIONS.has(head)) return args.length === 1 && (args[0] === "--version" || head === "node" && args[0] === "-v") ? { argv, prefix: [head] } : undefined;
  if (QUERIES.has(head)) {
    const queryPaths = queryOperands(head, args);
    return queryPaths ? { argv, prefix: [head], queryPaths } : undefined;
  }
  if (head === "git") {
    const directory = args[0] === "-C" ? args[1] : undefined;
    const rest = directory === undefined ? args : args.slice(2);
    const sub = rest[0];
    if (!sub || !command.includes(` ${sub}`) || rest.some(arg => arg.startsWith("-L") || /^--(?:output|ext-diff|textconv|no-index|exec-path|exclude-from)(?:=|$)/.test(arg))) return undefined;
    const special = sub === "remote" && (rest.length === 2 && rest[1] === "-v" || rest.length === 3 && rest[1] === "get-url" && /^[A-Za-z0-9._-]+$/.test(rest[2]!))
      || (sub === "branch" || sub === "tag") && rest[1] === "--list" && rest.length === 2;
    if (!GIT_COMMANDS.has(sub) && !special) return undefined;
    // Keep the canonical argv used by the matcher separate from Git's effective cwd.
    return { argv: [head, ...rest], prefix: [head, sub], ...(directory === undefined ? {} : { directory }), queryPaths: rest.slice(1).filter(arg => arg.includes("/") || arg === "..").map(arg => arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : arg) };
  }
  return { argv, prefix: [head] };
}

/** Explicit option allowlist: unknown options keep the one-time approval path. */
function queryOperands(program: string, args: readonly string[]): string[] | undefined {
  const flags: Record<string, string> = { ls: "laAhSturdF1", pwd: "LP", du: "shdkm", stat: "", file: "bi", cat: "nbeEstuv", head: "qv", tail: "qv", wc: "lwmcL", rg: "niliwcsvFSe", grep: "nivwclFE" };
  const longs: Record<string, readonly string[]> = { rg: ["--files", "--hidden", "--no-ignore", "--line-number", "--ignore-case", "--fixed-strings", "--count", "--files-with-matches"], ls: ["--all", "--almost-all"], file: ["--mime", "--mime-type"], grep: ["--line-number", "--ignore-case", "--fixed-strings"] };
  const paths: string[] = [];
  let pattern = program !== "rg" && program !== "grep" || args.includes("--files"), literal = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!literal && arg === "--") { literal = true; continue; }
    if (!literal && arg.startsWith("-")) {
      if ((program === "head" || program === "tail") && /^-(?:n|c)\d+$/.test(arg)) continue;
      if ((program === "head" || program === "tail") && (arg === "-n" || arg === "-c")) { if (!/^\d+$/.test(args[++i] ?? "")) return undefined; continue; }
      if ((program === "rg" || program === "grep") && (arg === "-e" || arg === "--regexp")) { if (args[++i] === undefined) return undefined; pattern = true; continue; }
      if ((program === "rg" || program === "grep") && ["-g", "--glob", "-t", "--type"].includes(arg) && program === "rg") { if (args[++i] === undefined) return undefined; continue; }
      if (longs[program]?.includes(arg)) continue;
      if (arg.length > 1 && !arg.startsWith("--") && [...arg.slice(1)].every(c => flags[program]?.includes(c) && c !== "e")) continue;
      return undefined;
    }
    if (!pattern) { pattern = true; continue; }
    paths.push(arg);
  }
  return pattern ? paths : undefined;
}
