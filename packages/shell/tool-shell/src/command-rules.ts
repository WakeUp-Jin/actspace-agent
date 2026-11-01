import { isAbsolute, relative, resolve, sep } from "node:path";

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const UNSUPPORTED_SHELL_SYNTAX_RE = /[|<>`$(){}]/;
const EVAL_LIKE_COMMANDS = new Set(["eval", "source", ".", "exec", "builtin", "fc", "trap"]);
const DELETE_COMMANDS = new Set(["rm", "rmdir"]);
const SHELL_GLOB_RE = /[*?\[]/;

export function getBashHardRejectReason(command: string, cwd: string, workspaceRoot: string): string | undefined {
  if (CONTROL_CHARS_RE.test(command)) return "Command contains control characters.";
  if (UNICODE_WHITESPACE_RE.test(command)) return "Command contains unsupported Unicode whitespace.";
  if (UNSUPPORTED_SHELL_SYNTAX_RE.test(command)) return "Command uses shell expansion, pipes, or redirection that cannot be safely classified.";
  for (const segment of command.split(";").map((value) => value.trim())) {
    const tokens = tokenize(segment);
    const first = tokens?.[0];
    if (!tokens || !first) return "Command contains an empty or unparseable segment.";
    if (EVAL_LIKE_COMMANDS.has(first)) return `Command uses blocked shell builtin: ${first}.`;
    if (DELETE_COMMANDS.has(first)) {
      const targets = commandTargets(tokens);
      if (targets.length === 0) return "Delete command has no explicit target.";
      for (const target of targets) {
        if (SHELL_GLOB_RE.test(target)) return "Delete command uses a glob target.";
        if (isCriticalPath(target)) return "Command contains a dangerous delete target.";
        const resolved = resolve(cwd, target);
        const nested = relative(workspaceRoot, resolved);
        if (nested === "" || nested === ".." || nested.startsWith(`..${sep}`) || isAbsolute(nested)) return "Delete command escapes or targets the workspace root.";
        if (nested.split(/[\\/]+/).includes(".git")) return "Delete command targets repository metadata.";
      }
    }
    if ((first === "rm" || first === "rmdir" || first === "mv") && tokens.slice(1).some((token) => stripQuotes(token).replace(/\/+$/, "").endsWith(".git"))) {
      return "Command deletes or moves repository metadata.";
    }
  }
  return undefined;
}

function isCriticalPath(value: string): boolean {
  const token = stripQuotes(value);
  return token === "/" || token === "~" || token === "$HOME" || token === "/tmp" || token === "/var" || token === "/usr" || token === "/bin" || token === "/sbin" || token === "/etc" || token === "/Applications" || /^\/Users\/[^/]+$/.test(token);
}

function commandTargets(tokens: readonly string[]): readonly string[] {
  const targets: string[] = [];
  let optionsEnded = false;
  for (const token of tokens.slice(1)) {
    if (!optionsEnded && token === "--") { optionsEnded = true; continue; }
    if (!optionsEnded && token.startsWith("-")) continue;
    targets.push(token);
  }
  return targets;
}

function stripQuotes(value: string): string { return value.replace(/^['"]|['"]$/g, ""); }

function tokenize(command: string): readonly string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "single" | "double" | undefined;
  let escaping = false;
  const push = () => { if (current) tokens.push(current); current = ""; };
  for (const character of command.trim()) {
    if (escaping) { current += character; escaping = false; continue; }
    if (character === "\\" && quote !== "single") { escaping = true; continue; }
    if (character === "'" && quote !== "double") { quote = quote === "single" ? undefined : "single"; continue; }
    if (character === '"' && quote !== "single") { quote = quote === "double" ? undefined : "double"; continue; }
    if (/\s/.test(character) && quote === undefined) { push(); continue; }
    current += character;
  }
  if (escaping || quote !== undefined) return undefined;
  push();
  return tokens;
}
