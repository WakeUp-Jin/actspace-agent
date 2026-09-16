// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { SubagentActivity } from "../runtime-v2/subagent-activity";
import { FixedRendererStreamAdapter } from "../runtime-v2/fixed-renderer-stream-adapter";

describe("subagent activity in the parent stream", () => {
  it("routes child activity, coalesces text deltas, and ignores children after parent completion", () => {
    const adapter = new FixedRendererStreamAdapter();
    const events: RuntimeStreamEvent[] = [];
    adapter.subscribe((event) => events.push(event));
    const parent = { sessionId: "parent", agentRunId: "parent-run", turnId: "turn", requestId: "request", callId: "delegate", name: "agent" };
    adapter.accept({ ...parent, kind: "tool-prepared", arguments: { task: "Inspect tests" } });
    adapter.accept({ ...parent, kind: "tool-started" });
    const child = { sessionId: "child", parentSessionId: "parent", parentCallId: "delegate", agentRunId: "child-run", turnId: "child-turn", requestId: "child-request", messageId: "message" };
    const labels = () => events.flatMap((event) => event.sessionId === "parent" && event.type === "tool_call_streaming" && event.preview?.kind === "agent" ? [event.preview.displayText] : []);
    adapter.accept({ ...child, kind: "reasoning-delta", message: "hidden reasoning" });
    adapter.accept({ ...child, kind: "tool-prepared", callId: "read", name: "read_file", arguments: { path: "/private/workspace/test.ts" } });
    adapter.accept({ ...child, kind: "tool-prepared", callId: "grep", name: "grep", arguments: { pattern: "secret=do-not-show" } });
    expect(labels()).toContain("正在读取 · test.ts");
    expect(labels().at(-1)).toBe("正在执行 2 项工具调用 · 正在搜索");
    const result = { status: "completed" as const, summary: "ok", modelOutput: [], artifacts: [], detail: [], failure: null };
    for (const [callId, name] of [["read", "read_file"], ["grep", "grep"]]) adapter.accept({ ...child, kind: "tool-finished", callId: callId!, name: name!, result: result as never, resultEventId: callId! });
    for (let i = 0; i < 30; i++) adapter.accept({ ...child, kind: "assistant-delta", message: "hidden reply" });
    expect(labels().filter((label) => label === "正在整理回复")).toHaveLength(1);
    expect(labels().join()).not.toMatch(/hidden|do-not-show|private/);
    const count = labels().length;
    adapter.accept({ ...parent, kind: "tool-finished", result: result as never, resultEventId: "done" });
    adapter.accept({ ...child, kind: "reasoning-delta", message: "late" });
    expect(labels()).toHaveLength(count);
    adapter.dispose();
  });
});

const child = { sessionId: "child", agentRunId: "run", turnId: "turn", requestId: "request" };
const result = { status: "completed" as const, summary: "ok", modelOutput: [], artifacts: [], detail: [], failure: null };

describe("subagent operation context", () => {
  it("retains a fast file operation through subsequent model phases, without claiming it is running", () => {
    const activity = new SubagentActivity();
    expect(activity.accept({ ...child, kind: "tool-prepared", callId: "read", name: "read_file", arguments: { path: "/workspace/ConversationView.tsx" } })).toBe("正在读取 · ConversationView.tsx");
    expect(activity.accept({ ...child, kind: "tool-finished", callId: "read", name: "read_file", result: result as never, resultEventId: "done" })).toBe("正在分析 · 刚读取 ConversationView.tsx");
    expect(activity.accept({ ...child, kind: "run-state", message: "request-started" })).toBe("正在思考 · 刚读取 ConversationView.tsx");
    expect(activity.accept({ ...child, kind: "reasoning-delta", messageId: "m", message: "private" })).toBe("正在分析 · 刚读取 ConversationView.tsx");
    expect(activity.accept({ ...child, kind: "assistant-delta", messageId: "m", message: "private" })).toBe("正在整理回复");
    expect(activity.accept({ ...child, kind: "run-state", message: "completed" })).toBe("正在交回结果");
  });

  it.each([
    ["read_file", { path: "src/token-usage.ts" }, "正在读取 · token-usage.ts"],
    ["grep", { pattern: "secret|password|token" }, "正在搜索 · secret|password|token"],
    ["glob", { pattern: "**/*token*.ts" }, "正在查找 · **/*token*.ts"],
    ["grep", { pattern: "secret=do-not-show" }, "正在搜索"],
    ["grep", { pattern: "Bearer do-not-show" }, "正在搜索"],
    ["grep", { pattern: "sk-12345678901234567890" }, "正在搜索"],
  ])("preserves useful %s targets and hides credential values", (name, args, expected) => {
    expect(new SubagentActivity().accept({ ...child, kind: "tool-prepared", callId: "tool", name, arguments: args })).toBe(expected);
  });

  it("keeps parallel targets visible and does not report a failed read as successful", () => {
    const activity = new SubagentActivity();
    activity.accept({ ...child, kind: "tool-prepared", callId: "read", name: "read_file", arguments: { path: "a.ts" } });
    expect(activity.accept({ ...child, kind: "tool-prepared", callId: "grep", name: "grep", arguments: { pattern: "AgentRunBlock" } })).toBe("正在执行 2 项工具调用 · 正在搜索 · AgentRunBlock");
    expect(activity.accept({ ...child, kind: "tool-finished", callId: "grep", name: "grep", result: result as never, resultEventId: "g" })).toBe("正在读取 · a.ts");
    expect(activity.accept({ ...child, kind: "tool-finished", callId: "read", name: "read_file", result: { ...result, status: "failed" } as never, resultEventId: "r" })).toBe("正在分析 · 刚尝试读取 a.ts");
  });
});
