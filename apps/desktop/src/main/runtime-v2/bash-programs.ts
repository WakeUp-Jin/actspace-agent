/**
 * 从一条 Bash 命令里拆出运行过的程序，供 Context 面板「Bash 命令」统计使用。
 * 规则见 `docs/exec-plans/completed/design-archive/frontend/front-Context面板Bash命令统计.md` §3.2（现行口径见 `front-Context面板规范.md` §5.2）：
 * 只做统计，拆不出来的段直接跳过，不追求完整的 shell 语法。
 */

export type BashProgramOccurrence = {
  /** 程序名（路径最后一段）；`""` 表示名字不合法，归入「其他」。 */
  program: string;
  /** 只对 `BASH_SUBCOMMAND_PROGRAMS` 取一层；`""` 表示没有或不合法。 */
  subcommand: string;
};

export const BASH_SUBCOMMAND_PROGRAMS: ReadonlySet<string> = new Set([
  "git",
  "pnpm",
  "npm",
  "yarn",
  "cargo",
  "go",
  "gh",
  "docker",
]);

export const BASH_COMMAND_PARSE_LIMIT = 16_000;

const NAME_PATTERN = /^[A-Za-z0-9._@+-]{1,64}$/;
const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;

/** 段首会被剥掉、继续往后找程序的关键字。 */
const LEADING_KEYWORDS = new Set(["!", "if", "then", "else", "elif", "do", "while", "until"]);

/** 段首是这些词时整段不计。 */
const NOT_PROGRAMS = new Set([
  "cd",
  "pushd",
  "popd",
  "export",
  "local",
  "declare",
  "readonly",
  "typeset",
  "for",
  "case",
  "select",
  "function",
  "coproc",
  "done",
  "fi",
  "esac",
  "in",
  "[",
  "[[",
  "]]",
]);

/** 包装命令及其会带值的选项。 */
const WRAPPERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "sudo",
    new Set([
      "-u",
      "-g",
      "-p",
      "-C",
      "-D",
      "-r",
      "-t",
      "-U",
      "-T",
      "--user",
      "--group",
      "--host",
      "--prompt",
      "--chdir",
      "--role",
      "--type",
      "--other-user",
      "--close-from",
      "--command-timeout",
    ]),
  ],
  ["doas", new Set(["-u", "-C"])],
  ["env", new Set(["-u", "-C", "-S", "--unset", "--chdir", "--split-string"])],
  ["command", new Set<string>()],
  ["exec", new Set(["-a"])],
  ["time", new Set(["-f", "-o", "--format", "--output"])],
  ["nohup", new Set<string>()],
  ["nice", new Set(["-n", "--adjustment"])],
  ["stdbuf", new Set(["-i", "-o", "-e", "--input", "--output", "--error"])],
  ["timeout", new Set(["-s", "-k", "--signal", "--kill-after"])],
  ["caffeinate", new Set(["-t", "-w"])],
  ["noglob", new Set<string>()],
  ["nocorrect", new Set<string>()],
]);

/** 取子命令时连值一起跳过的全局选项。 */
const SUBCOMMAND_VALUE_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  git: new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]),
  pnpm: new Set(["--filter", "-F", "-C", "--dir", "--workspace-dir"]),
  npm: new Set(["--prefix", "-w", "--workspace"]),
  yarn: new Set(["--cwd"]),
  cargo: new Set(["-C", "-Z", "--config", "--color"]),
  go: new Set(["-C"]),
  gh: new Set(["-R", "--repo"]),
  docker: new Set(["--context", "-c", "-H", "--host", "--config", "-l", "--log-level"]),
};

type Word = { kind: "word"; value: string; quoted: boolean };
type Token = Word | { kind: "redirect" };
type Heredoc = { delimiter: string; dash: boolean };

export function parseBashPrograms(command: string): BashProgramOccurrence[] {
  const occurrences: BashProgramOccurrence[] = [];
  for (const segment of splitSegments(command.slice(0, BASH_COMMAND_PARSE_LIMIT))) {
    const occurrence = segmentProgram(segment);
    if (occurrence) occurrences.push(occurrence);
  }
  return occurrences;
}

/** 引号外按 `&&` `||` `;` `|` `&` 换行 `(` `)` `{` `}` 拆段；`$(...)`、反引号、进程替换整体当作一个词的一部分。 */
function splitSegments(text: string): Token[][] {
  const segments: Token[][] = [];
  let tokens: Token[] = [];
  let word = "";
  let inWord = false;
  let quoted = false;
  let heredocNext: boolean | null = null;
  let heredocs: Heredoc[] = [];

  const closeSegment = () => {
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  const flush = () => {
    if (!inWord) return;
    if (heredocNext !== null) {
      heredocs.push({ delimiter: word, dash: heredocNext });
      heredocNext = null;
    }
    if (!quoted && (word === "{" || word === "}")) closeSegment();
    else tokens.push({ kind: "word", value: word, quoted });
    word = "";
    inWord = false;
    quoted = false;
  };
  const endSegment = () => {
    flush();
    closeSegment();
  };
  const append = (chunk: string, isQuoted = false) => {
    word += chunk;
    inWord = true;
    if (isQuoted) quoted = true;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "\\") {
      if (next === "\n") i += 2;
      else {
        if (next !== undefined) append(next, true);
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end < 0 ? text.length : end;
      append(text.slice(i + 1, stop), true);
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      const { value, end } = readDoubleQuoted(text, i + 1);
      append(value, true);
      i = end;
      continue;
    }
    if (c === "$" && next === "(") {
      const end = scanBalanced(text, i + 1, "(", ")");
      append(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === "$" && next === "{") {
      const end = scanBalanced(text, i + 1, "{", "}");
      append(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === "`") {
      const end = scanBacktick(text, i);
      append(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flush();
      i++;
      continue;
    }
    if (c === "\n") {
      endSegment();
      i++;
      if (heredocs.length) {
        i = skipHeredocBodies(text, i, heredocs);
        heredocs = [];
      }
      continue;
    }
    if (c === "#" && !inWord) {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === ";") {
      endSegment();
      i++;
      continue;
    }
    if (c === "&") {
      if (next === ">") {
        flush();
        tokens.push({ kind: "redirect" });
        i += text[i + 2] === ">" ? 3 : 2;
      } else {
        endSegment();
        i += next === "&" ? 2 : 1;
      }
      continue;
    }
    if (c === "|") {
      endSegment();
      i += next === "|" || next === "&" ? 2 : 1;
      continue;
    }
    if ((c === "<" || c === ">") && next === "(") {
      const end = scanBalanced(text, i + 1, "(", ")");
      append(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === "<" || c === ">") {
      // `2>&1` 里的 2 是文件描述符，不是参数。
      if (inWord && !quoted && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else flush();
      let length = 1;
      if (c === "<") {
        if (text.startsWith("<<<", i)) length = 3;
        else if (text.startsWith("<<-", i)) {
          length = 3;
          heredocNext = true;
        } else if (next === "<") {
          length = 2;
          heredocNext = false;
        } else if (next === "&" || next === ">") length = 2;
      } else if (next === ">" || next === "&" || next === "|") length = 2;
      tokens.push({ kind: "redirect" });
      i += length;
      continue;
    }
    if (c === "(") {
      if (inWord && !quoted && word.endsWith("=")) {
        // 数组赋值 `arr=(a b)`。
        const end = scanBalanced(text, i, "(", ")");
        append(text.slice(i, end));
        i = end;
      } else if (!inWord && next === "(") {
        // 算术 `(( i++ ))`，不是命令。
        endSegment();
        i = scanBalanced(text, i, "(", ")");
      } else {
        endSegment();
        i++;
      }
      continue;
    }
    if (c === ")") {
      endSegment();
      i++;
      continue;
    }
    append(c);
    i++;
  }
  endSegment();
  return segments;
}

function readDoubleQuoted(text: string, start: number): { value: string; end: number } {
  let value = "";
  let i = start;
  while (i < text.length && text[i] !== '"') {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      value += text[i + 1] === "\n" ? "" : text[i + 1];
      i += 2;
    } else if (c === "$" && text[i + 1] === "(") {
      const end = scanBalanced(text, i + 1, "(", ")");
      value += text.slice(i, end);
      i = end;
    } else if (c === "`") {
      const end = scanBacktick(text, i);
      value += text.slice(i, end);
      i = end;
    } else {
      value += c;
      i++;
    }
  }
  return { value, end: Math.min(i + 1, text.length) };
}

/** `open` 指向开括号，返回配对闭括号之后的位置；跳过引号与转义，没配上时返回文本末尾。 */
function scanBalanced(text: string, open: number, left: string, right: string): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (c === '"') {
      i = readDoubleQuoted(text, i + 1).end;
      continue;
    }
    if (c === "`") {
      i = scanBacktick(text, i);
      continue;
    }
    if (c === left) depth++;
    else if (c === right) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return text.length;
}

function scanBacktick(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length && text[i] !== "`") i += text[i] === "\\" ? 2 : 1;
  return Math.min(i + 1, text.length);
}

function skipHeredocBodies(text: string, start: number, heredocs: readonly Heredoc[]): number {
  let pos = start;
  for (const heredoc of heredocs) {
    while (pos < text.length) {
      const lineEnd = text.indexOf("\n", pos);
      const line = text.slice(pos, lineEnd < 0 ? text.length : lineEnd).replace(/\r$/, "");
      pos = lineEnd < 0 ? text.length : lineEnd + 1;
      if ((heredoc.dash ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
    }
  }
  return pos;
}

function segmentProgram(tokens: readonly Token[]): BashProgramOccurrence | null {
  const words: Word[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    if (token.kind === "redirect") {
      // 重定向连同它的目标一起去掉。
      if (tokens[k + 1]?.kind === "word") k++;
      continue;
    }
    words.push(token);
  }

  let k = 0;
  for (;;) {
    const head = words[k];
    if (!head) return null;
    if (LEADING_KEYWORDS.has(head.value) || ASSIGNMENT_PATTERN.test(head.value)) {
      k++;
      continue;
    }
    const wrapperOptions = WRAPPERS.get(head.value);
    if (wrapperOptions) {
      const after = skipWrapperOptions(head.value, wrapperOptions, words, k + 1);
      if (after === null) return null;
      k = after;
      continue;
    }
    break;
  }

  const value = words[k].value;
  if (!value || NOT_PROGRAMS.has(value) || value.startsWith("$") || value.startsWith("((")) return null;
  const base = value.slice(value.lastIndexOf("/") + 1);
  const program = NAME_PATTERN.test(base) ? base : "";
  const subcommand = program && BASH_SUBCOMMAND_PROGRAMS.has(program) ? readSubcommand(program, words, k + 1) : "";
  return { program, subcommand };
}

/** 返回包装命令之后第一个词的位置；`command -v` 这类只查找不执行的返回 null。 */
function skipWrapperOptions(
  name: string,
  valueOptions: ReadonlySet<string>,
  words: readonly Word[],
  start: number,
): number | null {
  let k = start;
  while (k < words.length) {
    const value = words[k].value;
    if (value === "--") {
      k++;
      break;
    }
    if (!value.startsWith("-")) break;
    if (name === "command" && (value === "-v" || value === "-V")) return null;
    k += valueOptions.has(value) ? 2 : 1;
  }
  // `timeout 30 cmd`：选项之后的第一个参数是时长。
  if (name === "timeout") k++;
  return k;
}

function readSubcommand(program: string, words: readonly Word[], start: number): string {
  const valueOptions = SUBCOMMAND_VALUE_OPTIONS[program];
  for (let k = start; k < words.length; k++) {
    const value = words[k].value;
    if (value.startsWith("-")) {
      if (valueOptions?.has(value)) k++;
      continue;
    }
    if (program === "cargo" && value.startsWith("+")) continue;
    return NAME_PATTERN.test(value) ? value : "";
  }
  return "";
}
