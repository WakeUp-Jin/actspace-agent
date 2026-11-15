import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBashHardRejectReason } from "../command-rules.js";

const root = "/workspace/project";
const reject = (command: string, cwd = root) => getBashHardRejectReason(command, cwd, root);

describe("Bash hard rejections", () => {
  it.each([
    "printf ok",
    "python3 scripts/run.py --input data.csv",
    "python3 -m json.tool data.json",
    "python3 -c 'print(1 + 1)'",
    'python3 -c "print(1 + 1)"',
    "python3 -c 'import sys; print(sys.version)'",
    "node -e 'console.log([1, 2].map((x) => x * 2))'",
    "python3 - <<'EOF'\nimport json\nprint(json.dumps({\"a\": (1, 2)}))\nEOF",
    'python3 - <<"EOF"\nprint("$not expanded")\nEOF',
    "cat <<-'EOF'\n\tindented\n\tEOF",
    "cat <<\\EOF\nprint(1)\nEOF",
    "pnpm test | tail -n 20",
    "rg -n needle src | head -n 5 | wc -l",
    "pnpm lint && pnpm test || printf failed",
    "echo hi > out.txt",
    "echo hi >> logs/out.txt",
    "echo hi 2>&1",
    "pnpm test > out.txt 2>&1",
    "pnpm test &> out.txt",
    "pnpm test >/dev/null",
    "python3 run.py < input.txt",
    "python3 -c 'print(1)' <<< 'stdin text'",
    `echo hi > ${join(tmpdir(), "scratch", "out.txt")}`,
    "echo hi > /tmp/out.txt",
    "sleep 1 &",
    "pnpm test;",
    "ls\npwd",
    "echo '$HOME' \"(not a subshell)\" '{a,b}'",
    "echo a\\$b",
  ])("allows %j", (command) => {
    expect(reject(command)).toBeUndefined();
  });

  it.each([
    ["$(id)", "substitution"],
    ["echo `id`", "substitution"],
    ["echo $HOME", "substitution"],
    ['python3 -c "print(\'$x\')"', "single quotes"],
    ["echo \"`id`\"", "substitution"],
    ["(cd src && pnpm test)", "subshells"],
    ["{ pnpm lint; pnpm test; }", "subshells"],
    ["echo {a,b}", "subshells"],
    ["diff <(ls a) <(ls b)", "subshells"],
    ["python3 - <<EOF\nprint(1)\nEOF", "<<'EOF'"],
    ["python3 - <<'EOF'\nprint(1)\n", "not terminated"],
    ["echo hi > /etc/passwd", "temp directory"],
    ["echo hi > ../outside.txt", "temp directory"],
    ["echo hi > ~/notes.txt", "temp directory"],
    ["echo hi > .git/hooks/pre-commit", "temp directory"],
    ["echo hi > out*.txt", "temp directory"],
    ["echo hi >", "no target"],
    ["pnpm test | eval x", "blocked shell builtin: eval"],
    ["cat x | rm -rf /", "dangerous delete"],
    ["pnpm test && source ~/.zshrc", "blocked shell builtin: source"],
    ["| cat", "empty or unparseable"],
    ["pnpm test ;; pnpm lint", "empty or unparseable"],
    ["echo 'unterminated", "unterminated quote"],
    ["echo trailing\\", "unterminated quote"],
    ["", "empty or unparseable"],
    ["echo \u00a0x", "Unicode whitespace"],
    ["echo \u0007", "control characters"],
  ])("rejects %j", (command, fragment) => {
    expect(reject(command)).toContain(fragment);
  });

  it("keeps the original delete and repository metadata rules", () => {
    expect(reject("rm -rf /")).toContain("dangerous delete");
    expect(reject("rm -rf .git")).toContain("repository metadata");
    expect(reject("rm -rf src/.git/hooks")).toContain("repository metadata");
    expect(reject("rm -rf ../sibling")).toContain("escapes or targets the workspace root");
    expect(reject("rm -rf .")).toContain("escapes or targets the workspace root");
    expect(reject("rm -rf dist/*")).toContain("glob target");
    expect(reject("rm -rf")).toContain("no explicit target");
    expect(reject("mv .git elsewhere")).toContain("deletes or moves repository metadata");
    expect(reject("rm -rf dist")).toBeUndefined();
    expect(reject("rm -rf 'dist'")).toBeUndefined();
    // 名字以两个点开头的目录在工作区里面，不是往上走。
    expect(reject("rm -rf ..cache")).toBeUndefined();
    expect(reject("rm -rf ..cache/../..")).toContain("escapes or targets the workspace root");
  });

  it("applies the delete rules to every command in a pipeline", () => {
    expect(reject("ls | rm -rf .git")).toContain("repository metadata");
    expect(reject("pnpm build && rm -rf dist")).toBeUndefined();
  });

  it("treats quoted inline script source as opaque, including semicolons and keywords", () => {
    expect(reject("python3 -c 'print(1); import os; os.listdir(\".\")'")).toBeUndefined();
    expect(reject("python3 -c 'eval(\"1\")'")).toBeUndefined();
    expect(reject("python3 -c 'rm -rf /'")).toBeUndefined();
  });

  it("resolves redirection targets against the given cwd", () => {
    expect(reject("echo hi > out.txt", join(root, "sub"))).toBeUndefined();
    expect(reject("echo hi > ../out.txt", join(root, "sub"))).toBeUndefined();
    expect(reject("echo hi > ../../out.txt", join(root, "sub"))).toContain("temp directory");
    expect(reject("echo hi > ..out.txt")).toBeUndefined();
    expect(reject("echo hi > ..cache/out.txt")).toBeUndefined();
  });
});
