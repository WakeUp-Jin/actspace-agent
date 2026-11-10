/**
 * Recognises the two ways the model runs scripts through Bash (design: agent-script-execution §2.6):
 * inline `python -c '...'` / `node -e '...'` / interpreter heredocs, and a script file handed to the interpreter.
 * `tool-shell` attaches the result to the process resource as `script`; the renderer shows the body as a code block
 * instead of one long shell line. Pure and conservative: anything unusual returns `undefined` and the card falls
 * back to the plain command.
 */

export type ScriptLanguage = "python" | "javascript";

export type ScriptCommand = {
  readonly language: ScriptLanguage;
  /** Inline body (`-c` / `-e` / heredoc). */
  readonly source?: string;
  /** Script file as written on the command line (may contain `$ACTSPACE_SCRATCH`). */
  readonly path?: string;
};

type Token =
  | { kind: "word"; text: string; quoted: boolean; expands: boolean }
  | { kind: "heredoc"; stripTabs: boolean }
  | { kind: "redirect" }
  | { kind: "control" };

const PYTHON_INTERPRETER = /^(?:\$ACTSPACE_PYTHON|actspace-python|python3(?:\.\d+)?|python)$/;
const NODE_INTERPRETER = /^(?:node|nodejs)$/;
const INLINE_FLAG: Record<ScriptLanguage, string> = { python: "-c", javascript: "-e" };
const SCRIPT_FILE: Record<ScriptLanguage, RegExp> = { python: /\.pyw?$/, javascript: /\.(?:[cm]?js|ts)$/ };
const FLAG_WITH_ARGUMENT: Record<ScriptLanguage, ReadonlySet<string>> = {
  python: new Set(["-X", "-W"]),
  javascript: new Set(["-r", "--require", "--import"]),
};

export function detectScriptCommand(command: string): ScriptCommand | undefined {
  const parsed = tokenize(command);
  if (parsed === undefined || parsed.tokens.some((token) => token.kind === "control")) return undefined;
  const { tokens, heredocBodyStart } = parsed;
  const head = tokens[0];
  if (head?.kind !== "word" || (head.expands && head.text !== "$ACTSPACE_PYTHON")) return undefined;
  const language = PYTHON_INTERPRETER.test(head.text)
    ? "python"
    : NODE_INTERPRETER.test(head.text)
      ? "javascript"
      : undefined;
  if (language === undefined) return undefined;

  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) return undefined;
    if (token.kind === "word" && !token.quoted && token.text === INLINE_FLAG[language]) {
      const body = tokens[index + 1];
      if (body?.kind !== "word" || !body.quoted || body.expands || !onlyRedirects(tokens.slice(index + 2)))
        return undefined;
      return Object.freeze({ language, source: body.text });
    }
    if (token.kind === "word" && !token.quoted && token.text === "-") {
      index += 1;
      continue;
    }
    if (token.kind === "heredoc") {
      const delimiter = tokens[index + 1];
      if (
        delimiter?.kind !== "word" ||
        delimiter.expands ||
        heredocBodyStart === undefined ||
        !onlyRedirects(tokens.slice(index + 2))
      )
        return undefined;
      const source = heredocBody(command.slice(heredocBodyStart), delimiter.text, token.stripTabs);
      return source === undefined ? undefined : Object.freeze({ language, source });
    }
    if (token.kind === "word" && !token.quoted && token.text.startsWith("-") && token.text.length > 1) {
      index += FLAG_WITH_ARGUMENT[language].has(token.text) && tokens[index + 1]?.kind === "word" ? 2 : 1;
      continue;
    }
    if (
      token.kind === "word" &&
      SCRIPT_FILE[language].test(token.text) &&
      (!token.expands || /^\$ACTSPACE_SCRATCH\//.test(token.text))
    ) {
      const tail = tokens.slice(index + 1);
      if (!tail.every((rest) => rest.kind === "redirect" || (rest.kind === "word" && !rest.expands))) return undefined;
      return Object.freeze({ language, path: token.text });
    }
    return undefined;
  }
  return undefined;
}

/** `python3 -c 'print(1)'` → `python3 -c '…'`; heredocs keep their first line. For the `$` line of the card. */
export function elideScriptSource(command: string, script: ScriptCommand): string {
  const trimmed = command.trim();
  if (script.source === undefined) return trimmed;
  const index = trimmed.indexOf(script.source);
  if (index < 0) return trimmed;
  // A heredoc body starts on the line after its opener; only that one line is matched, so the cost stays linear.
  const before = trimmed.slice(0, index);
  if (before.endsWith("\n") && /<<-?[ \t]*['"]?\w/.test(before.slice(before.lastIndexOf("\n", before.length - 2) + 1)))
    return `${trimmed.slice(0, trimmed.indexOf("\n"))} …`;
  return `${trimmed.slice(0, index)}…${trimmed.slice(index + script.source.length)}`;
}

export function scriptLineCount(source: string): number {
  return source.replace(/^\n+|\n+$/g, "").split("\n").length;
}

export function scriptLanguageLabel(language: ScriptLanguage): string {
  return language === "python" ? "Python" : "JavaScript";
}

function onlyRedirects(tokens: readonly Token[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.kind !== "redirect") return false;
    if (tokens[index + 1]?.kind === "word") index += 1;
  }
  return true;
}

function heredocBody(rest: string, delimiter: string, stripTabs: boolean): string | undefined {
  const lines = rest.split("\n");
  const end = lines.findIndex((line) => (stripTabs ? line.replace(/^\t+/, "") : line) === delimiter);
  if (end < 0 || lines.slice(end + 1).some((line) => line.trim().length > 0)) return undefined;
  return lines.slice(0, end).join("\n");
}

const WORD_BREAK = /[\s<>|;&()]/;

/**
 * Shell words of the command. Newlines are whitespace until a heredoc operator is seen, after which the line ends
 * the command and the rest is the heredoc body. Unterminated quotes, `$(`, `${` and backticks give up.
 */
function tokenize(command: string): { tokens: Token[]; heredocBodyStart?: number } | undefined {
  const tokens: Token[] = [];
  let sawHeredoc = false;
  let index = 0;
  while (index < command.length) {
    const char = command.charAt(index);
    if (char === "\n" && sawHeredoc) return { tokens, heredocBodyStart: index + 1 };
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === "`" || command.startsWith("$(", index) || command.startsWith("${", index)) return undefined;
    if (char === "|" || char === ";" || (char === "&" && command[index + 1] !== ">") || char === "(" || char === ")") {
      tokens.push({ kind: "control" });
      return { tokens };
    }
    if (command.startsWith("<<", index)) {
      const stripTabs = command[index + 2] === "-";
      tokens.push({ kind: "heredoc", stripTabs });
      sawHeredoc = true;
      index += stripTabs ? 3 : 2;
      continue;
    }
    const redirect = /^(?:2>&1|[12]?>>?|&>|<)/.exec(command.slice(index, index + 4));
    if (redirect) {
      tokens.push({ kind: "redirect" });
      index += redirect[0].length;
      continue;
    }
    let text = "";
    let quoted = false;
    let expands = false;
    while (index < command.length && !WORD_BREAK.test(command.charAt(index))) {
      const current = command.charAt(index);
      if (current === "'") {
        const end = command.indexOf("'", index + 1);
        if (end < 0) return undefined;
        text += command.slice(index + 1, end);
        quoted = true;
        index = end + 1;
      } else if (current === '"') {
        let cursor = index + 1;
        for (; cursor < command.length && command[cursor] !== '"'; cursor += 1) {
          const inner = command.charAt(cursor);
          if (inner === "`" || command.startsWith("$(", cursor) || command.startsWith("${", cursor)) return undefined;
          if (inner === "$") expands = true;
          if (inner === "\\" && cursor + 1 < command.length) {
            text += command[cursor + 1];
            cursor += 1;
            continue;
          }
          text += inner;
        }
        if (cursor >= command.length) return undefined;
        quoted = true;
        index = cursor + 1;
      } else if (current === "\\" && index + 1 < command.length) {
        text += command[index + 1];
        index += 2;
      } else {
        if (current === "`" || command.startsWith("$(", index) || command.startsWith("${", index)) return undefined;
        if (current === "$") expands = true;
        text += current;
        index += 1;
      }
    }
    tokens.push({ kind: "word", text, quoted, expands });
  }
  return { tokens };
}
