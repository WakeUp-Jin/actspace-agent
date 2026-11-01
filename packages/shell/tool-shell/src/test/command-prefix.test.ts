import { describe, expect, it } from "vitest";
import { analyzeCommandPrefixGrant as analyze } from "../command-prefix.js";

describe("Bash prefix policy", () => {
  it.each(["pnpm", "npm", "yarn", "cargo", "go", "make", "tsc", "vitest", "eslint", "prettier"])("offers program-level %s grants", program => {
    expect(analyze(`${program} test`)?.prefix).toEqual([program]);
  });
  it.each(["status", "diff", "log", "show"])("scopes git %s independently", sub => {
    expect(analyze(`git ${sub} --stat`)?.prefix).toEqual(["git", sub]);
  });
  it.each(["ls -la", "pwd", "du -sh .", "cat README.md", "head -n 10 README.md", "tail -n20 README.md", "rg -n needle src", "grep -n needle README.md", "git -C src status", "git ls-files", "git remote -v", "git branch --list", "node -v", "python3 --version"])("offers query %s", command => expect(analyze(command)).toBeDefined());
  it.each(["tail -f log", "rg --pre cmd needle", "grep -f /tmp/pattern", "file -C", "git branch -D main", "git diff --no-index a b", "node -e code", "ls -L ."])("keeps %s single-use", command => expect(analyze(command)).toBeUndefined());
  it("preserves literal empty and quoted arguments", () => {
    expect(analyze('pnpm test "" \'hello world\'')?.argv).toEqual(["pnpm", "test", "", "hello world"]);
    expect(analyze('\tpnpm\ttest')?.prefix).toEqual(["pnpm"]);
  });
  it.each(["", "pnpmx test", "node x", "rm x", "git push", 'git "status"', '"pnpm" test', "/bin/pnpm test", "./pnpm test", "A=1 pnpm test", "env pnpm test", "pnpm dlx x", "pnpm exec x", "npm x x", "yarn npm publish", "pnpm add -g x", "npm install -ig x", "pnpm --filter x test", "pnpm test --registry=x", "pnpm test --prefix x", "pnpm test --userconfig=x", "git diff --output=x", 'pnpm test "unterminated', "pnpm\u00a0test"])("does not authorize %j", command => {
    expect(analyze(command)).toBeUndefined();
  });
  it.each([";", "&&", "||", "&", "|", "<", ">", "`", "$", "(", ")", "{", "}", "!", "\n", "\r", "\\", "~", "*", "?", "[", "]", "#"])("excludes syntax %j even inside quotes", syntax => {
    expect(analyze(`pnpm test ${syntax} build`)).toBeUndefined();
    expect(analyze(`pnpm test "${syntax}"`)).toBeUndefined();
  });
});
