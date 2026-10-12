import { describe, expect, it } from "vitest";
import { getShellCommandHeads, tokenizeShellCommand } from "../components/messages/shell-highlight";

describe("tokenizeShellCommand", () => {
  it("marks each segment's command, operators, flags and quoted strings", () => {
    const tokens = tokenizeShellCommand('git status --short && grep -n "a && b" x | tail -n 5')
      .filter((token) => token.kind !== "text" || token.text.trim());
    expect(tokens).toEqual([
      { text: "git", kind: "command" },
      { text: "status", kind: "text" },
      { text: "--short", kind: "flag" },
      { text: "&&", kind: "operator" },
      { text: "grep", kind: "command" },
      { text: "-n", kind: "flag" },
      { text: '"a && b"', kind: "string" },
      { text: "x", kind: "text" },
      { text: "|", kind: "operator" },
      { text: "tail", kind: "command" },
      { text: "-n", kind: "flag" },
      { text: "5", kind: "text" },
    ]);
  });

  it("keeps the original text when joined back", () => {
    const command = "pnpm --filter @actspace/desktop exec vitest run  a.test.tsx; echo 'done'";
    expect(tokenizeShellCommand(command).map((token) => token.text).join("")).toBe(command);
  });
});

describe("getShellCommandHeads", () => {
  it("lists distinct command names in order", () => {
    expect(getShellCommandHeads("git status && git diff --stat | tail -n 5")).toEqual(["git", "tail"]);
    expect(getShellCommandHeads("whoami && hostname")).toEqual(["whoami", "hostname"]);
    expect(getShellCommandHeads("")).toEqual([]);
  });
});
