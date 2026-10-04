import { describe, expect, it } from "vitest";
import type { MainAgentInbox } from "@actspace/core-agent";
import type { LlmMessage } from "@actspace/llm-service";
import type { AgentLoop } from "../loop.js";
import { runToolStreamFixture } from "../testing.js";

const STEER = "Keep the offset parameter.";
const mentionsSteer = (messages: readonly LlmMessage[]) => JSON.stringify(messages).includes(STEER);

describe("AgentLoop steer messages", () => {
  it("claims a steer at the next step and reports it live", async () => {
    let inbox: MainAgentInbox | undefined;
    const requests: (readonly LlmMessage[])[] = [];
    const { result, events, journal } = await runToolStreamFixture({
      onLoop: (_loop, value) => { inbox = value; },
      onMessages: (messages) => requests.push(messages),
      execute: async () => {
        await inbox!.enqueue([{ type: "text", text: STEER }], "next-step", "steer-1", "steer");
        return { status: "completed", summary: "Read fixture.txt", modelOutput: [{ type: "text", text: "fixture content" }] };
      },
    });

    expect(result.reason).toBe("completed");
    expect(result.steps).toBe(2);
    expect(requests.map(mentionsSteer)).toEqual([false, true]);
    expect(events.filter((event) => event.kind === "inbox-claimed")).toEqual([expect.objectContaining({ messageId: "steer-1", source: "steer" })]);
    expect(journal.some((event) => event.type === "agent/inbox/spliced" && (event.data as { operation?: string }).operation === "claim")).toBe(true);
    expect(inbox!.status("steer-1")).toBe("claimed");
  });

  it("runs one more step when a steer arrives while the final reply is streaming", async () => {
    let inbox: MainAgentInbox | undefined;
    let steered = false;
    const requests: (readonly LlmMessage[])[] = [];
    const { result } = await runToolStreamFixture({
      onLoop: (_loop, value) => { inbox = value; },
      onMessages: (messages) => requests.push(messages),
      beforeFinalText: async () => {
        if (steered) return;
        steered = true;
        await inbox!.enqueue([{ type: "text", text: STEER }], "next-step", "steer-final", "steer");
      },
    });

    expect(result.reason).toBe("completed");
    expect(result.steps).toBe(3);
    expect(requests.map(mentionsSteer)).toEqual([false, false, true]);
    expect(inbox!.status("steer-final")).toBe("claimed");
  });

  it("does not extend the turn for pending task notifications", async () => {
    let inbox: MainAgentInbox | undefined;
    const { result } = await runToolStreamFixture({
      onLoop: (_loop, value) => { inbox = value; },
      beforeFinalText: async () => { await inbox!.enqueue("background done", "next-step", "task-1", "task_notification"); },
    });

    expect(result.steps).toBe(2);
    expect(inbox!.status("task-1")).toBe("pending");
  });

  it("returns a cancelled result after settlement and does not report an execution error", async () => {
    let loop: AgentLoop | undefined;
    const notifications: string[] = [];
    const { result, journal } = await runToolStreamFixture({
      onLoop: value => { loop = value; },
      beforeFinalText: async () => { loop!.abort("user"); },
      context: { get: () => ({ flush: async () => {} }), emit: type => { notifications.push(String(type)); } },
    });
    expect(result).toMatchObject({ agentRunId: "run-test", reason: "aborted", steps: 2 });
    expect(journal.at(-1)).toMatchObject({ type: "turn/end", data: { reason: "aborted" } });
    expect(notifications).not.toContain("agent/error");
    expect(loop!.active).toBe(false);
  });

  it("does not hide a settlement failure behind normal cancellation", async () => {
    let loop: AgentLoop | undefined;
    await expect(runToolStreamFixture({
      onLoop: value => { loop = value; },
      beforeFinalText: async () => { loop!.abort("user"); },
      context: { get: () => ({ flush: async (payload: { reason: string }) => {
        if (payload.reason === "after-turn-settled") throw new Error("checkpoint failed");
      } }) },
    })).rejects.toThrow("settlement checkpoint also failed");
  });

  it("discards an unread steer when the turn is aborted", async () => {
    let inbox: MainAgentInbox | undefined;
    let loop: AgentLoop | undefined;
    await expect(runToolStreamFixture({
      onLoop: (value, valueInbox) => { loop = value; inbox = valueInbox; },
      execute: async () => {
        await inbox!.enqueue([{ type: "text", text: STEER }], "next-step", "steer-abort", "steer");
        loop!.abort("user");
        return { status: "completed", summary: "Read fixture.txt", modelOutput: [{ type: "text", text: "fixture content" }] };
      },
    })).resolves.toMatchObject({ result: { reason: "aborted" } });

    expect(inbox!.status("steer-abort")).toBe("discarded");
  });

  it("drops a steer left over from the previous turn instead of placing it after the new user message", async () => {
    let inbox: MainAgentInbox | undefined;
    const requests: (readonly LlmMessage[])[] = [];
    await runToolStreamFixture({
      terminalOnly: true,
      onLoop: (_loop, value) => { inbox = value; },
      seedSession: async (session) => {
        const { MainAgentInbox: Inbox } = await import("@actspace/core-agent");
        await new Inbox(session).enqueue([{ type: "text", text: STEER }], "next-step", "steer-stale", "steer");
      },
      onMessages: (messages) => requests.push(messages),
    });

    expect(requests.map(mentionsSteer)).toEqual([false]);
    expect(inbox!.status("steer-stale")).toBe("discarded");
  });
});


describe("Host-owned input source", () => {
  it("consumes at step boundaries and applies the new model without changing the Run mode", async () => {
    let pending = false;
    let session: import("@actspace/session-persistence").SessionHandle;
    const { result, journal } = await runToolStreamFixture({
      mode: "plan",
      seedSession: async value => { session = value; },
      execute: async () => { pending = true; return { status: "completed", summary: "ok", modelOutput: [] }; },
      inputSource: {
        hasPending: () => pending,
        claim: async () => {
          if (!pending) return { messageIds: [], configuration: {} };
          pending = false;
          await session!.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "owned-input" }, surface: { kind: "append", node: { kind: "user", messageId: "owned-input", content: "Continue" } } });
          await session!.flush();
          return { messageIds: ["owned-input"], configuration: { model: "new-model", thinkingEnabled: true } };
        },
      },
    });
    expect(result.steps).toBe(2);
    const headers = journal.filter(event => event.type === "request/header").map(event => event.data);
    expect(headers).toEqual([expect.objectContaining({ model: "test", agentMode: "plan" }), expect.objectContaining({ model: "new-model", agentMode: "plan" })]);
    expect(journal.filter(event => event.type === "user/message")).toHaveLength(2);
  });
});
