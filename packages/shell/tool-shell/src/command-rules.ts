import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { resolve } from "node:path";
import { isLexicallyInside, relativePathInside } from "@actspace/shared";

/**
 * Hard rejections that apply in every permission mode. The command is split the way the shell would split it, so
 * quoted text is opaque and only unquoted syntax is judged: `python3 -c 'print(1)'` is one program with one argument,
 * while `$(id)` or an unquoted heredoc body would be expanded by the shell and cannot be classified. Design:
 * docs/design-docs/tool-system/agent-script-execution.md §2.1.
 */

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const EVAL_LIKE_COMMANDS = new Set(["eval", "source", ".", "exec", "builtin", "fc", "trap"]);
const DELETE_COMMANDS = new Set(["rm", "rmdir"]);
const SHELL_GLOB_RE = /[*?\[]/;
const DEVICE_TARGETS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

const SUBSTITUTION_REASON = "Command uses variable or command substitution ($, `) that cannot be safely classified. Put inline script source in single quotes, or write the script to a file and run the file.";
const GROUPING_REASON = "Command uses subshells, brace groups, or process substitution that cannot be safely classified. Run one pipeline at a time, or write the script to a file and run the file.";
const HEREDOC_REASON = "Quote the heredoc delimiter (<<'EOF') so the body is not expanded, or write the script to a file and run the file.";
const REDIRECT_REASON = "Redirection targets must stay inside the workspace or the temp directory.";

type Word = {
  /** The word as the program receives it, quotes removed. */
  readonly text: string;
  /** Only the characters that were not quoted or escaped; shell syntax is judged on these. */
  readonly unquoted: string;
};
type Redirect = { readonly output: boolean; readonly target: Word | undefined };
type SimpleCommand = { readonly words: Word[]; readonly redirects: Redirect[] };
type Lexed = { readonly commands: readonly SimpleCommand[] } | { readonly reason: string };

export function getBashHardRejectReason(command: string, cwd: string, workspaceRoot: string): string | undefined {
  if (CONTROL_CHARS_RE.test(command)) return "Command contains control characters.";
  if (UNICODE_WHITESPACE_RE.test(command)) return "Command contains unsupported Unicode whitespace.";
  const lexed = lex(command);
  if ("reason" in lexed) return lexed.reason;
  if (lexed.commands.length === 0) return "Command contains an empty or unparseable segment.";
  for (const simple of lexed.commands) {
    const reason = classify(simple, cwd, workspaceRoot);
    if (reason) return reason;
  }
  return undefined;
}

function classify(simple: SimpleCommand, cwd: string, workspaceRoot: string): string | undefined {
  const tokens = simple.words.map((word) => word.text);
  const first = tokens[0];
  if (first === undefined) return "Command contains an empty or unparseable segment.";
  if (EVAL_LIKE_COMMANDS.has(first)) return `Command uses blocked shell builtin: ${first}.`;
  if (DELETE_COMMANDS.has(first)) {
    const targets = commandTargets(tokens);
    if (targets.length === 0) return "Delete command has no explicit target.";
    for (const target of targets) {
      if (SHELL_GLOB_RE.test(target)) return "Delete command uses a glob target.";
      if (isCriticalPath(target)) return "Command contains a dangerous delete target.";
      const nested = relativePathInside(nodePath, workspaceRoot, resolve(cwd, target));
      if (nested === null || nested === "") return "Delete command escapes or targets the workspace root.";
      if (nested.split(/[\\/]+/).includes(".git")) return "Delete command targets repository metadata.";
    }
  }
  if ((first === "rm" || first === "rmdir" || first === "mv") && tokens.slice(1).some((token) => token.replace(/\/+$/, "").endsWith(".git"))) {
    return "Command deletes or moves repository metadata.";
  }
  for (const redirect of simple.redirects) {
    if (redirect.target === undefined) return "Redirection has no target.";
    if (redirect.output && !isAllowedOutputTarget(redirect.target, cwd, workspaceRoot)) return REDIRECT_REASON;
  }
  return undefined;
}

function isAllowedOutputTarget(target: Word, cwd: string, workspaceRoot: string): boolean {
  if (DEVICE_TARGETS.has(target.text)) return true;
  // `~` and globs are expanded by the shell, so the literal text is not where the write lands.
  if (target.unquoted.startsWith("~") || SHELL_GLOB_RE.test(target.unquoted)) return false;
  const resolved = resolve(cwd, target.text);
  if (resolved.split(/[\\/]+/).includes(".git")) return false;
  return isWithin(workspaceRoot, resolved) || tempRoots().some((root) => isWithin(root, resolved));
}

function isWithin(parent: string, child: string): boolean {
  return isLexicallyInside(nodePath, parent, child, { includeRoot: false });
}

let cachedTempRoots: readonly string[] | undefined;
function tempRoots(): readonly string[] {
  if (cachedTempRoots) return cachedTempRoots;
  const roots = new Set<string>(["/tmp", "/private/tmp"]);
  for (const candidate of [tmpdir()]) {
    roots.add(resolve(candidate));
    try { roots.add(realpathSync(candidate)); } catch { /* keep the unresolved path */ }
  }
  cachedTempRoots = Object.freeze([...roots]);
  return cachedTempRoots;
}

function isCriticalPath(token: string): boolean {
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

/**
 * Splits the command into simple commands the way bash would, without expanding anything. Quoted and escaped text is
 * literal; unquoted `$`, backticks, parentheses and braces are rejected because their effect depends on expansion.
 */
function lex(command: string): Lexed {
  const commands: SimpleCommand[] = [];
  let current: SimpleCommand = { words: [], redirects: [] };
  let text = "", unquoted = "", started = false, quote: "'" | '"' | undefined;
  let pendingRedirect: Redirect | undefined;
  const pendingHeredocs: { delimiter: string; stripTabs: boolean }[] = [];
  let expectHeredocDelimiter: boolean | undefined;

  const endWord = (): string | undefined => {
    if (!started) return undefined;
    const word: Word = { text, unquoted };
    text = ""; unquoted = ""; started = false;
    if (expectHeredocDelimiter !== undefined) {
      // A delimiter with any quoted character keeps the body literal; an unquoted one lets the shell expand the body.
      if (word.unquoted.length === word.text.length) return HEREDOC_REASON;
      pendingHeredocs.push({ delimiter: word.text, stripTabs: expectHeredocDelimiter });
      expectHeredocDelimiter = undefined;
      return undefined;
    }
    if (pendingRedirect !== undefined) {
      current.redirects.push({ output: pendingRedirect.output, target: word });
      pendingRedirect = undefined;
      return undefined;
    }
    current.words.push(word);
    return undefined;
  };
  const endCommand = (): string | undefined => {
    const reason = endWord();
    if (reason) return reason;
    if (pendingRedirect !== undefined || expectHeredocDelimiter !== undefined) return "Redirection has no target.";
    if (current.words.length === 0 && current.redirects.length === 0) return "Command contains an empty or unparseable segment.";
    commands.push(current);
    current = { words: [], redirects: [] };
    return undefined;
  };
  const redirect = (output: boolean): void => { pendingRedirect = { output, target: undefined }; };

  let i = 0;
  while (i < command.length) {
    const char = command[i]!;
    if (quote === "'") {
      if (char === "'") quote = undefined; else text += char;
      i++; continue;
    }
    if (quote === '"') {
      if (char === '"') { quote = undefined; i++; continue; }
      if (char === "$" || char === "`") return { reason: SUBSTITUTION_REASON };
      if (char === "\\" && i + 1 < command.length && '"\\$`\n'.includes(command[i + 1]!)) { if (command[i + 1] !== "\n") text += command[i + 1]!; i += 2; continue; }
      text += char; i++; continue;
    }
    if (char === "\\") {
      if (i + 1 >= command.length) return { reason: "Command has an unterminated quote or escape." };
      if (command[i + 1] !== "\n") { text += command[i + 1]!; started = true; }
      i += 2; continue;
    }
    if (char === "'" || char === '"') { quote = char; started = true; i++; continue; }
    if (char === "$" || char === "`") return { reason: SUBSTITUTION_REASON };
    if (char === "(" || char === ")" || char === "{" || char === "}") return { reason: GROUPING_REASON };
    if (char === " " || char === "\t") { const reason = endWord(); if (reason) return { reason }; i++; continue; }
    if (char === "\n") {
      if (pendingHeredocs.length > 0 || current.words.length > 0 || current.redirects.length > 0 || started) {
        const reason = endCommand(); if (reason) return { reason };
      }
      i++;
      while (pendingHeredocs.length > 0) {
        const heredoc = pendingHeredocs.shift()!;
        const end = skipHeredocBody(command, i, heredoc.delimiter, heredoc.stripTabs);
        if (end === undefined) return { reason: "Heredoc body is not terminated." };
        i = end;
      }
      continue;
    }
    if (char === ";" || char === "&" || char === "|") {
      const two = command.slice(i, i + 2);
      if (two === "&>") {
        const reason = endWord(); if (reason) return { reason };
        redirect(true); i += command[i + 2] === ">" ? 3 : 2; continue;
      }
      if (two === "<(" || two === ">(") return { reason: GROUPING_REASON };
      const reason = endCommand(); if (reason) return { reason };
      i += two === "&&" || two === "||" || two === "|&" ? 2 : 1;
      continue;
    }
    if (char === "<" || char === ">") {
      if (command[i + 1] === "(") return { reason: GROUPING_REASON };
      // `2>file`, `2>&1`: a word made only of digits directly before the operator is the descriptor.
      if (started && /^\d+$/.test(unquoted) && unquoted === text) { text = ""; unquoted = ""; started = false; }
      else { const reason = endWord(); if (reason) return { reason }; }
      if (char === "<" && command.startsWith("<<<", i)) { redirect(false); i += 3; continue; }
      if (char === "<" && command.startsWith("<<", i)) {
        const stripTabs = command[i + 2] === "-";
        expectHeredocDelimiter = stripTabs;
        i += stripTabs ? 3 : 2;
        continue;
      }
      if (command[i + 1] === "&") {
        // `>&2` duplicates a descriptor; `>&file` is an output redirect. Decide when the target word ends.
        const target = readDupTarget(command, i + 2);
        if (target !== undefined) { i = target; continue; }
        redirect(char === ">"); i += 2; continue;
      }
      redirect(char === ">");
      i += command[i + 1] === char || (char === ">" && command[i + 1] === "|") ? 2 : 1;
      continue;
    }
    text += char; unquoted += char; started = true; i++;
  }
  if (quote !== undefined) return { reason: "Command has an unterminated quote or escape." };
  if (current.words.length > 0 || current.redirects.length > 0 || started || pendingRedirect !== undefined || expectHeredocDelimiter !== undefined) {
    const reason = endCommand(); if (reason) return { reason };
  }
  if (pendingHeredocs.length > 0) return { reason: "Heredoc body is not terminated." };
  return { commands };
}

/** Returns the index after `N` or `-` in `>&N` / `>&-`, or undefined when what follows is a file name. */
function readDupTarget(command: string, start: number): number | undefined {
  let end = start;
  while (end < command.length && command[end] === " ") end++;
  const match = /^(\d+|-)(?=[\s;&|<>]|$)/.exec(command.slice(end));
  return match ? end + match[0].length : undefined;
}

/** Skips heredoc lines up to and including the delimiter line; returns the index after it. */
function skipHeredocBody(command: string, start: number, delimiter: string, stripTabs: boolean): number | undefined {
  let i = start;
  while (i <= command.length) {
    const newline = command.indexOf("\n", i);
    const line = command.slice(i, newline === -1 ? command.length : newline);
    if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) return newline === -1 ? command.length : newline + 1;
    if (newline === -1) return undefined;
    i = newline + 1;
  }
  return undefined;
}
