import { describe, expect, it } from "vitest";
import { TerminalRenderer, shouldUseColor } from "../terminal-renderer";

describe("TerminalRenderer", () => {
  it("streams assistant text and keeps statuses compact", () => {
    let output = "";
    let status = "";
    const renderer = new TerminalRenderer({
      write: (text) => { output += text; },
      writeStatus: (text) => { status += text; },
      color: false,
    });
    renderer.beginAgentRun();
    renderer.render({
      type: "assistant_text_delta",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      messageId: "message-1",
      delta: "hello",
    });
    renderer.render({
      type: "tool_started",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      toolCallId: "tool-1",
      toolName: "read_file",
      argsPreview: "README.md",
    });
    renderer.render({ type: "agent_run_finished", sessionId: "session-1", agentRunId: "run-1", resultEventIds: [] });

    expect(output).toBe("hello\n");
    expect(status).toBe("[tool: read_file started]\n");
    expect(output).not.toContain("\u001b[");
  });

  it("aggregates contiguous thinking deltas into one semantic block", () => {
    let status = "";
    const renderer = new TerminalRenderer({
      write: () => {},
      writeStatus: (text) => { status += text; },
      color: false,
    });
    renderer.beginAgentRun();

    renderer.render({
      type: "assistant_thinking_delta",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      messageId: "thinking-1",
      delta: "用户想",
    });
    renderer.render({
      type: "assistant_thinking_delta",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      messageId: "thinking-2",
      delta: "了解项目",
    });
    renderer.render({
      type: "assistant_thinking_delta",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      messageId: "thinking-3",
      delta: "。",
    });
    expect(status).toBe("");

    renderer.render({
      type: "tool_started",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      toolCallId: "tool-1",
      toolName: "read_file",
      argsPreview: "README.md",
    });
    renderer.render({
      type: "assistant_thinking_delta",
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      llmCallId: "call-1",
      messageId: "thinking-4",
      delta: "已经完成。",
    });
    renderer.render({ type: "agent_run_finished", sessionId: "session-1", agentRunId: "run-1", resultEventIds: [] });

    expect(status).toBe([
      "[thinking]",
      "用户想了解项目。",
      "[tool: read_file started]",
      "[thinking]",
      "已经完成。",
      "",
    ].join("\n"));
  });

  it("honors NO_COLOR", () => {
    expect(shouldUseColor({ isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
    expect(shouldUseColor({ isTTY: true, env: {} })).toBe(true);
    expect(shouldUseColor({ isTTY: false, env: {} })).toBe(false);
  });
});
