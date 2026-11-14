// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BASH_COMMAND_PARSE_LIMIT, parseBashPrograms } from "../runtime-v2/bash-programs";

/** `"pnpm test"` 表示程序 + 子命令，`"cat"` 表示没有子命令，`""` 表示「其他」。 */
function names(command: string): string[] {
  return parseBashPrograms(command).map((item) =>
    item.subcommand ? `${item.program} ${item.subcommand}` : item.program,
  );
}

describe("parseBashPrograms", () => {
  it.each([
    // 规范 §3.2 的例子
    ["cd src && pnpm test | tail -20", ["pnpm test", "tail"]],
    ["cat a && cat b", ["cat", "cat"]],
    ["FOO=1 timeout 30 node build.js > out.log 2>&1", ["node"]],
    ["if [ -f x ]; then cat x; fi", ["cat"]],
    ["git -C pkg status && git diff", ["git status", "git diff"]],
    ['echo "$(date)"', ["echo"]],
    ["python3 - <<'EOF'\nimport os\nprint(os.getcwd()); rm -rf x | cat\nEOF", ["python3"]],
    // 引号与转义
    ["echo 'a && b | c' && ls", ["echo", "ls"]],
    ['grep "x | y; z" file.txt', ["grep"]],
    ["ls a\\ b", ["ls"]],
    ["echo `date` && pwd", ["echo", "pwd"]],
    // 包装命令
    ["sudo -u x env A=1 nohup python3 x.py &", ["python3"]],
    ["nice -n 10 make", ["make"]],
    ["time pnpm build", ["pnpm build"]],
    ["timeout -s KILL 5s curl https://example.com", ["curl"]],
    ["command -v git", []],
    // 子 shell、循环、分组
    ["( cd x && make )", ["make"]],
    ['for f in *.ts; do wc -l "$f"; done', ["wc"]],
    ["{ echo a; echo b; } > out.txt", ["echo", "echo"]],
    ["(( i++ )) && echo done", ["echo"]],
    ["arr=(a b c) && echo ok", ["echo"]],
    ["diff <(sort a) <(sort b)", ["diff"]],
    // 子命令
    ["pnpm --filter @actspace/desktop test", ["pnpm test"]],
    ["npm -w a run build", ["npm run"]],
    ["gh pr create --fill", ["gh pr"]],
    ["git", ["git"]],
    ["cargo +nightly build", ["cargo build"]],
    ["docker -H tcp://x ps", ["docker ps"]],
    ["/usr/bin/git log --oneline", ["git log"]],
    // 程序名
    ["./scripts/run.sh --fast", ["run.sh"]],
    ["'a b' --help", [""]],
    ["$(which node) --version", []],
    ["$EDITOR file", []],
    ["export A=1; local b; declare -a c", []],
    // 重定向与注释
    ["cat < in.txt > out.txt 2> err.log", ["cat"]],
    ["ls &> /dev/null || echo missing", ["ls", "echo"]],
    ["# only a comment", []],
    ["ls # trailing comment && rm x", ["ls"]],
    ["", []],
    // 换行与续行
    ["git status\ngit diff \\\n  --stat", ["git status", "git diff"]],
  ])("%j", (command, expected) => {
    expect(names(command)).toEqual(expected);
  });

  it("只解析前 16,000 个字符", () => {
    const command = "ls; ".repeat(5_000);
    expect(command.length).toBeGreaterThan(BASH_COMMAND_PARSE_LIMIT);
    expect(parseBashPrograms(command)).toHaveLength(BASH_COMMAND_PARSE_LIMIT / 4);
  });

  it("<<- 的结束标记可以带前导制表符", () => {
    expect(names("cat <<-END\n\tnot a command\n\tEND\npwd")).toEqual(["cat", "pwd"]);
  });
});
