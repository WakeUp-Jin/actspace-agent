import { describe, expect, it } from "vitest";
import { detectScriptCommand, elideScriptSource, scriptLineCount } from "../script-command";

describe("detectScriptCommand", () => {
  it("recognises inline python and node bodies in single quotes, with trailing redirects", () => {
    expect(detectScriptCommand("actspace-python -c 'import sys; print(sys.version)'")).toEqual({
      language: "python",
      source: "import sys; print(sys.version)",
    });
    expect(detectScriptCommand("python3 -X utf8 -c 'print(1)' > \"$ACTSPACE_SCRATCH/out.txt\" 2>&1")).toEqual({
      language: "python",
      source: "print(1)",
    });
    expect(detectScriptCommand("\"$ACTSPACE_PYTHON\" -c 'print(1)'")).toEqual({
      language: "python",
      source: "print(1)",
    });
    expect(detectScriptCommand("node -e 'console.log(1)'")).toEqual({
      language: "javascript",
      source: "console.log(1)",
    });
    expect(detectScriptCommand("python3 -c '\nimport json\nprint(json.dumps({\"a\": 1}))\n'")).toEqual({
      language: "python",
      source: '\nimport json\nprint(json.dumps({"a": 1}))\n',
    });
  });

  it("recognises interpreter heredocs and keeps the body verbatim", () => {
    const command = "actspace-python - <<'PY'\nimport pandas as pd\nprint(pd.__version__)\nPY\n";
    expect(detectScriptCommand(command)).toEqual({
      language: "python",
      source: "import pandas as pd\nprint(pd.__version__)",
    });
    expect(detectScriptCommand("node <<EOF\nconsole.log(1)\nEOF")).toEqual({
      language: "javascript",
      source: "console.log(1)",
    });
    expect(detectScriptCommand("python3 <<'PY'\nprint(1)\n")).toBeUndefined();
  });

  it("recognises script files, including scratch paths and plain arguments", () => {
    expect(detectScriptCommand('actspace-python "$ACTSPACE_SCRATCH/analyze.py" data.csv > out.txt')).toEqual({
      language: "python",
      path: "$ACTSPACE_SCRATCH/analyze.py",
    });
    expect(detectScriptCommand("python3 scripts/build.py --fast")).toEqual({
      language: "python",
      path: "scripts/build.py",
    });
    expect(detectScriptCommand("node tools/run.mjs")).toEqual({ language: "javascript", path: "tools/run.mjs" });
    expect(detectScriptCommand("python3 -m markitdown file.docx")).toBeUndefined();
  });

  it("gives up on pipelines, substitutions, unquoted bodies and other commands", () => {
    expect(detectScriptCommand("python3 -c 'print(1)' | head")).toBeUndefined();
    expect(detectScriptCommand('python3 -c "print($HOME)"')).toBeUndefined();
    expect(detectScriptCommand("python3 -c $(cat x)")).toBeUndefined();
    expect(detectScriptCommand("cd src && python3 run.py")).toBeUndefined();
    expect(detectScriptCommand("ls -la")).toBeUndefined();
    expect(detectScriptCommand("python3 -c 'print(1)")).toBeUndefined();
    expect(detectScriptCommand("")).toBeUndefined();
  });
});

describe("elideScriptSource / scriptLineCount", () => {
  it("replaces the inline body with an ellipsis and keeps the heredoc opener", () => {
    const inline = "actspace-python -c 'print(1)' > out.txt";
    expect(elideScriptSource(inline, { language: "python", source: "print(1)" })).toBe(
      "actspace-python -c '…' > out.txt",
    );
    const heredoc = "python3 - <<'PY'\nprint(1)\nprint(2)\nPY";
    expect(elideScriptSource(heredoc, { language: "python", source: "print(1)\nprint(2)" })).toBe("python3 - <<'PY' …");
    expect(elideScriptSource("python3 run.py", { language: "python", path: "run.py" })).toBe("python3 run.py");
  });

  it("counts lines without surrounding blank lines", () => {
    expect(scriptLineCount("\nimport x\nprint(x)\n")).toBe(2);
    expect(scriptLineCount("print(1)")).toBe(1);
    expect(scriptLineCount("")).toBe(1);
    expect(scriptLineCount("\n\n")).toBe(1);
    expect(scriptLineCount("\n\na\n\nb\n\n")).toBe(3);
  });
});
