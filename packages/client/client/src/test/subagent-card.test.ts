import { describe, expect, it } from "vitest";
import type { RuntimeSessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatSession, projectSubagentTranscript, subagentChildrenWithoutModel } from "../sessions/chat.js";
import { projectSubagentItems, subagentStatusByAgent } from "../sessions/subagent-list.js";
import { FixedRendererStreamAdapter } from "../live/stream-adapter.js";

// S3 第 7 步：agent 卡片读 subagent/* 新事件；五个管理工具的行名；收件箱两种新来源转成 BackgroundNotice。
function snapshot(toolCallIds: readonly string[] = []): RuntimeSessionSnapshot {
  return {
    kind: "session-snapshot",
    schemaVersion: 1,
    sessionId: "s",
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    workspaceRoot: null,
    throughJournalSeq: 20,
    permissionMode: "default",
    accessState: "read-write",
    agentForm: "agent",
    metadata: { title: null, pinned: false, archived: false },
    messages: toolCallIds.map((callId) => ({
      kind: "tool-result",
      messageId: `result-${callId}`,
      callId,
      content: "",
    })) as RuntimeSessionSnapshot["messages"],
    tools: [],
    pendingInbox: [],
    todos: [],
    delegations: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: {
      turnCount: 1,
      completedTurnCount: 1,
      stepCount: 0,
      activeTurnId: null,
      activeStepId: null,
      compactionCount: 0,
      activeCompactionId: null,
      lastCompactionSummary: null,
      timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 },
    },
    lineage: null,
  };
}

function envelope(seq: number, type: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return {
    recordKind: "event",
    seq,
    type,
    eventVersion: 1,
    criticality: "required",
    time: "2026-11-04T00:00:00.000Z",
    source: { ownerPluginId: "@actspace/core" },
    data,
    surface: null,
    provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
  };
}

const TRANSCRIPT = "/data/sessions/s/subagents/sa-1.md";

function journal(extra: SessionEventEnvelopeV1[] = []): SessionEventEnvelopeV1[] {
  return [
    envelope(1, "turn/start", { agentRunId: "run-1", turnId: "turn-1" }),
    envelope(2, "tool/call", {
      agentRunId: "run-1",
      callId: "call-agent",
      name: "agent",
      args: { description: "Map the repo", prompt: "look around", agent_preset: "explore" },
    }),
    envelope(3, "subagent/spawned", {
      agentId: "sa-1",
      kind: "local",
      preset: "explore",
      description: "Map the repo",
      transcriptPath: TRANSCRIPT,
      callId: "call-agent",
      createdAt: "2026-11-04T00:00:01.000Z",
    }),
    envelope(4, "subagent/activation", {
      op: "start",
      agentId: "sa-1",
      activationId: "act-1",
      trigger: "spawn",
      callId: "call-agent",
      background: true,
      model: "deepseek:deepseek-flash",
      startedAt: "2026-11-04T00:00:01.000Z",
    }),
    envelope(5, "tool/result", {
      agentRunId: "run-1",
      callId: "call-agent",
      name: "agent",
      status: "completed",
      summary: "agent completed",
      modelOutput: [{ type: "text", text: "Started sa-1" }],
    }),
    ...extra,
  ];
}

describe("subagent cards from subagent/* events", () => {
  it("lists one row per subagent with kind, preset, description, activation count and transcript path", () => {
    const [item] = projectSubagentItems(journal());
    expect(item).toEqual({
      agentId: "sa-1",
      kind: "local",
      preset: "explore",
      description: "Map the repo",
      status: "running",
      activationCount: 1,
      model: "deepseek:deepseek-flash",
      background: true,
      createdAt: "2026-11-04T00:00:01.000Z",
      activeSince: "2026-11-04T00:00:01.000Z",
      transcriptPath: TRANSCRIPT,
    });
  });

  it("follows the latest activation: ended after completing, an old Session's continuation counts, an interrupt shows as interrupted", () => {
    const settled = journal([
      envelope(6, "subagent/activation", {
        op: "settle",
        agentId: "sa-1",
        activationId: "act-1",
        status: "completed",
        summary: "done",
        result: "Found 3 packages",
        delivery: "notified",
        endedAt: "2026-11-04T00:01:00.000Z",
      }),
    ]);
    expect(projectSubagentItems(settled)[0]).toMatchObject({
      status: "ended",
      activationCount: 1,
      result: "Found 3 packages",
      endedAt: "2026-11-04T00:01:00.000Z",
    });
    const continued = [
      ...settled,
      envelope(7, "tool/call", {
        agentRunId: "run-1",
        callId: "call-send",
        name: "send_message",
        args: { agent_id: "sa-1", message: "Also check docs" },
      }),
      envelope(8, "subagent/activation", {
        op: "start",
        agentId: "sa-1",
        activationId: "act-2",
        trigger: "message",
        senderId: "s",
        callId: "call-send",
        background: true,
        startedAt: "2026-11-04T00:02:00.000Z",
      }),
    ];
    expect(projectSubagentItems(continued)[0]).toMatchObject({
      status: "running",
      activationCount: 2,
      activeSince: "2026-11-04T00:02:00.000Z",
      model: "deepseek:deepseek-flash",
    });
    const stopped = [
      ...continued,
      envelope(9, "subagent/activation", {
        op: "settle",
        agentId: "sa-1",
        activationId: "act-2",
        status: "interrupted",
        summary: "stopped",
        delivery: "notified",
        endedAt: "2026-11-04T00:03:00.000Z",
      }),
    ];
    expect(projectSubagentItems(stopped)).toHaveLength(1);
    expect(projectSubagentItems(stopped)[0]).toMatchObject({ status: "interrupted", activationCount: 2 });
    const failed = [
      ...settled.slice(0, -1),
      envelope(6, "subagent/activation", {
        op: "settle",
        agentId: "sa-1",
        activationId: "act-1",
        status: "max_steps",
        summary: "too long",
        delivery: "notified",
        endedAt: "2026-11-04T00:01:00.000Z",
      }),
    ];
    expect(projectSubagentItems(failed)[0].status).toBe("failed");
  });

  it("ends external subagents after their one run and fills a missing model from the child's requests", () => {
    const external = [
      envelope(1, "tool/call", {
        agentRunId: "run-1",
        callId: "call-codex",
        name: "agent_codex",
        args: { description: "Review auth", prompt: "review" },
      }),
      envelope(2, "subagent/spawned", {
        agentId: "sa-2",
        kind: "codex",
        description: "Review auth",
        transcriptPath: "/codex/rollout.jsonl",
        callId: "call-codex",
        createdAt: "2026-11-04T00:00:01.000Z",
      }),
      envelope(3, "subagent/activation", {
        op: "start",
        agentId: "sa-2",
        activationId: "act-1",
        trigger: "spawn",
        callId: "call-codex",
        background: true,
        startedAt: "2026-11-04T00:00:01.000Z",
      }),
    ];
    expect(projectSubagentItems(external, new Map([["sa-2", "gpt-5"]]))[0]).toMatchObject({
      kind: "codex",
      status: "running",
      model: "gpt-5",
    });
    const done = [
      ...external,
      envelope(4, "subagent/activation", {
        op: "settle",
        agentId: "sa-2",
        activationId: "act-1",
        status: "completed",
        summary: "ok",
        result: "Looks fine",
        delivery: "notified",
        endedAt: "2026-11-04T00:01:00.000Z",
      }),
    ];
    expect(projectSubagentItems(done)[0]).toMatchObject({ kind: "codex", status: "ended", result: "Looks fine" });
    expect(subagentChildrenWithoutModel(external)).toEqual([]);
  });

  it("keeps the fork's inherited sequence", () => {
    const fork = [
      envelope(1, "subagent/spawned", {
        agentId: "sa-3",
        kind: "fork",
        description: "Try B",
        transcriptPath: "/t/sa-3.md",
        callId: "call-fork",
        createdAt: "2026-11-04T00:00:01.000Z",
        inheritedThroughSeq: 40,
      }),
    ];
    expect(projectSubagentItems(fork)[0]).toMatchObject({
      kind: "fork",
      inheritedThroughSeq: 40,
      status: "interrupted",
      activationCount: 0,
    });
  });

  it("keeps each subagent's latest message to the parent, timed when it was sent", () => {
    const at = (seq: number, time: string, data: SessionEventEnvelopeV1["data"]) => ({
      ...envelope(seq, "agent/inbox/spliced", data),
      time,
    });
    const letter = (messageId: string, body: string) => ({
      source: "agent_message",
      senderId: "sa-1",
      messageId,
      content: `<agent_message from="sa-1" relation="child">\n${body}\n</agent_message>`,
    });
    expect(projectSubagentItems(journal())[0].lastMessage).toBeUndefined();
    const items = projectSubagentItems(
      journal([
        at(6, "2026-11-04T00:00:10.000Z", { operation: "enqueue", ...letter("m-1", "first note") }),
        at(7, "2026-11-04T00:00:20.000Z", {
          operation: "enqueue",
          ...letter("m-2", "\n**Only** one file\nmore detail"),
        }),
        // 领取同一条：时间仍是发送时。
        at(8, "2026-11-04T00:00:30.000Z", { operation: "claim", ...letter("m-2", "\n**Only** one file\nmore detail") }),
        // 别的来源、别的发送方不算。
        at(9, "2026-11-04T00:00:40.000Z", {
          operation: "enqueue",
          source: "subagent_notification",
          senderId: "sa-1",
          messageId: "n-1",
          content: "done",
        }),
      ]),
    );
    expect(items[0].lastMessage).toEqual({ text: "**Only** one file", at: "2026-11-04T00:00:20.000Z" });
    // 只有领取（enqueue 不在日志里）时用领取时间。
    const claimed = projectSubagentItems(
      journal([at(6, "2026-11-04T00:01:00.000Z", { operation: "claim", ...letter("m-3", "late") })]),
    );
    expect(claimed[0].lastMessage).toEqual({ text: "late", at: "2026-11-04T00:01:00.000Z" });
  });

  it("maps each subagent to its dispatch card's status, the later card winning", () => {
    const card = (id: string, runId: string | undefined, status: "running" | "completed") =>
      ({
        kind: "agent",
        id,
        description: id,
        status,
        displayText: id,
        createdAt: "now",
        ...(runId ? { transcriptRef: { kind: "subagent_transcript", sessionId: "s", agentRunId: "r", runId } } : {}),
      }) as Parameters<typeof subagentStatusByAgent>[0][number];
    const statuses = subagentStatusByAgent([
      card("a", "sa-1", "running"),
      card("b", undefined, "running"),
      card("c", "sa-1", "completed"),
      card("d", "sa-2", "running"),
    ]);
    expect([...statuses]).toEqual([
      ["sa-1", "completed"],
      ["sa-2", "running"],
    ]);
  });

  it("shows a forked subagent only what it did after the fork", () => {
    const message = (seq: number, messageId: string, content: string) =>
      ({
        ...envelope(seq, "user/message", { agentRunId: "run-1", messageId, content }),
        surface: { kind: "append" },
      }) as SessionEventEnvelopeV1;
    const child = [message(2, "u-1", "Parent question"), message(3, "u-2", "Fork task")];
    const forked = {
      ...snapshot(),
      messages: ["u-1", "u-2"].map((messageId) => ({
        kind: "user",
        messageId,
        content: "",
      })) as RuntimeSessionSnapshot["messages"],
    };
    const texts = (lineage: RuntimeSessionSnapshot["lineage"]) =>
      projectSubagentTranscript({ ...forked, lineage }, child).flatMap((event) =>
        event.type === "user_message" ? [JSON.stringify(event.payload)] : [],
      );
    expect(texts(null)).toHaveLength(2);
    const after = texts({
      origin: "delegation",
      parentSessionId: "s",
      parentBoundarySeq: 2,
      delegationDepth: 1,
      inheritedThroughSeq: 2,
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toContain("Fork task");
  });

  it("asks for request models only while an activation has none", () => {
    const withoutModel = journal().map((event) =>
      event.type === "subagent/activation"
        ? ({ ...event, data: { ...(event.data as object), model: undefined } } as SessionEventEnvelopeV1)
        : event,
    );
    expect(subagentChildrenWithoutModel(withoutModel)).toEqual([{ childSessionId: "sa-1", finished: false }]);
    expect(subagentChildrenWithoutModel(journal())).toEqual([]);
  });

  it("shows the final reply on the card, how it ended when there is none, and the tool output before settling", () => {
    const card = (events: SessionEventEnvelopeV1[]) =>
      projectChatSession(snapshot(["call-agent"]), events, "/w").events.flatMap((event) =>
        event.type === "tool_result" && event.payload.uiPreview?.kind === "agent" ? [event.payload.uiPreview] : [],
      )[0];
    expect(card(journal()).summary).toBe("Started sa-1");
    const settled = (data: Record<string, string>) =>
      journal([
        envelope(6, "subagent/activation", {
          op: "settle",
          agentId: "sa-1",
          activationId: "act-1",
          delivery: "notified",
          endedAt: "2026-11-04T00:01:00.000Z",
          ...data,
        }),
      ]);
    expect(card(settled({ status: "completed", summary: "done", result: "Found 3 packages" })).summary).toBe(
      "Found 3 packages",
    );
    // 没有最终回复：不显示给模型看的「Started …」或 settle 摘要，显示怎么结束的；应用退出算停止，不算失败。
    expect(
      card(settled({ status: "interrupted", summary: "Subagent sa-1 was stopped before it finished." })),
    ).toMatchObject({ status: "aborted", summary: "已中断" });
    expect(
      card(
        settled({ status: "lost", summary: "Subagent sa-1 (Map the repo) was interrupted because the app exited." }),
      ),
    ).toMatchObject({ status: "aborted", summary: "中断（应用退出）" });
    expect(
      card(settled({ status: "max_steps", summary: "Subagent sa-1 reached the step limit before it finished." })),
    ).toMatchObject({ status: "failed", summary: "达到步数上限" });
  });

  it("names the management tool rows and shows the message sent", () => {
    const events = journal([
      envelope(6, "tool/call", {
        agentRunId: "run-1",
        callId: "call-send",
        name: "send_message",
        args: { agent_id: "sa-1", message: "Also check docs" },
      }),
      envelope(7, "tool/result", {
        agentRunId: "run-1",
        callId: "call-send",
        name: "send_message",
        status: "completed",
        summary: "send_message completed",
      }),
      envelope(8, "tool/call", {
        agentRunId: "run-1",
        callId: "call-stop",
        name: "interrupt_agent",
        args: { agent_id: "sa-1" },
      }),
      envelope(9, "tool/result", {
        agentRunId: "run-1",
        callId: "call-stop",
        name: "interrupt_agent",
        status: "completed",
        summary: "interrupt_agent completed",
      }),
      ...(["wait_agent", "list_agents", "list_subagent_models"] as const).flatMap((name, index) => [
        envelope(10 + index * 2, "tool/call", { agentRunId: "run-1", callId: `call-${name}`, name, args: {} }),
        envelope(11 + index * 2, "tool/result", {
          agentRunId: "run-1",
          callId: `call-${name}`,
          name,
          status: "completed",
          summary: `${name} completed`,
        }),
      ]),
      // task_stop 停一个子智能体（task id 就是 agent id）读作「停止 ‹描述›」；停 Bash 时是普通行。
      envelope(16, "tool/call", {
        agentRunId: "run-1",
        callId: "call-task-stop",
        name: "task_stop",
        args: { taskId: "sa-1" },
      }),
      envelope(17, "tool/result", {
        agentRunId: "run-1",
        callId: "call-task-stop",
        name: "task_stop",
        status: "completed",
        summary: "Background task stopped",
      }),
      envelope(18, "tool/call", {
        agentRunId: "run-1",
        callId: "call-bash-stop",
        name: "task_stop",
        args: { taskId: "bash_1" },
      }),
      envelope(19, "tool/result", {
        agentRunId: "run-1",
        callId: "call-bash-stop",
        name: "task_stop",
        status: "completed",
        summary: "Background task stopped",
      }),
    ]);
    const callIds = events.flatMap((event) =>
      event.type === "tool/call" ? [String((event.data as { callId: string }).callId)] : [],
    );
    const titles = projectChatSession(snapshot(callIds), events, "/w").events.flatMap((event) =>
      event.type === "tool_result" && event.payload.uiPreview?.kind === "generic" ? [event.payload.uiPreview] : [],
    );
    expect(titles.map((preview) => preview.title)).toEqual([
      "发消息给 Map the repo",
      "停止 Map the repo",
      "等待子智能体",
      "查看子智能体",
      "查看可选模型",
      "停止 Map the repo",
      "task_stop",
    ]);
    expect(titles[0].content).toContain("Also check docs");
    expect(titles[0].subagentLink).toEqual({ agentId: "sa-1", verb: "发消息给", target: "Map the repo" });
    expect(titles[1].subagentLink).toEqual({ agentId: "sa-1", verb: "停止", target: "Map the repo" });
    expect(titles[2].subagentLink).toBeUndefined();
    expect(titles[5].subagentLink).toEqual({ agentId: "sa-1", verb: "停止", target: "Map the repo" });
    expect(titles[6].subagentLink).toBeUndefined();
    // 等待 / 查看类只显示标题，不带「wait_agent completed」「Input arrived.」这类给模型看的结果。
    expect(titles.slice(2, 5).map((preview) => preview.content)).toEqual(["", "", ""]);
  });
});

describe("inbox notices from subagents", () => {
  it("turns subagent completion notices and agent messages into background notices", () => {
    const adapter = new FixedRendererStreamAdapter(() => undefined);
    const seen: unknown[] = [];
    adapter.subscribe((event) => {
      if (event.type === "background_notice_claimed") seen.push(event.notice);
    });
    const base = {
      kind: "inbox-claimed",
      sessionId: "s",
      agentRunId: "run-2",
      turnId: "turn-2",
      content: "<subagent_notification />",
    } as const;
    adapter.accept({
      ...base,
      messageId: "m1",
      source: "subagent_notification",
      notice: { taskId: "sa-1", kind: "subagent", title: "Map the repo", status: "completed" },
    });
    adapter.accept({
      ...base,
      messageId: "m2",
      source: "agent_message",
      notice: { taskId: "sa-1", kind: "agent_message", title: "Map the repo", status: "message" },
    });
    adapter.accept({
      ...base,
      messageId: "m3",
      source: "steer",
      notice: { taskId: "x", kind: "subagent", title: "x", status: "completed" },
    });
    adapter.accept({
      ...base,
      messageId: "m4",
      source: "subagent_notification",
      opensTurn: true,
      notice: { taskId: "sa-2", kind: "subagent", title: "Fork", status: "failed" },
    });
    // 新会话：后台子智能体的结束通知走后台任务登记表的 task_notification。
    adapter.accept({
      ...base,
      messageId: "m5",
      source: "task_notification",
      notice: { taskId: "sa-3", kind: "subagent", title: "Scan", status: "stopped" },
    });
    expect(seen).toEqual([
      { taskId: "sa-1", taskKind: "subagent", title: "Map the repo", status: "completed", opensTurn: false },
      { taskId: "sa-1", taskKind: "agent_message", title: "Map the repo", status: "message", opensTurn: false },
      { taskId: "sa-2", taskKind: "subagent", title: "Fork", status: "failed", opensTurn: true },
      { taskId: "sa-3", taskKind: "subagent", title: "Scan", status: "stopped", opensTurn: false },
    ]);
  });

  it("keeps every claimed notice in the saved session, marking which one opened the turn", () => {
    const claim = (seq: number, messageId: string, opensTurn?: boolean) =>
      ({
        ...envelope(seq, "agent/inbox/spliced", {
          operation: "claim",
          agentRunId: "run-1",
          messageId,
          source: "subagent_notification",
          notice: { taskId: messageId, kind: "subagent", title: "Map the repo", status: "completed" },
          ...(opensTurn === undefined ? {} : { opensTurn }),
          content: "<subagent_notification />",
        }),
        surface: { kind: "append" },
      }) as SessionEventEnvelopeV1;
    const saved = {
      ...snapshot(),
      messages: ["m1", "m2"].map((messageId) => ({
        kind: "user",
        messageId,
        content: "",
      })) as RuntimeSessionSnapshot["messages"],
    };
    const notices = projectChatSession(saved, [claim(1, "m1", true), claim(2, "m2")], "/w").events.flatMap((event) =>
      event.type === "user_message" ? [event.payload.backgroundNotice] : [],
    );
    expect(notices).toEqual([
      { taskId: "m1", taskKind: "subagent", title: "Map the repo", status: "completed", opensTurn: true },
      { taskId: "m2", taskKind: "subagent", title: "Map the repo", status: "completed", opensTurn: false },
    ]);
  });

  it("marks a subagent's Run with its main Session, so the client leaves the child's task queue alone", () => {
    const adapter = new FixedRendererStreamAdapter(() => undefined);
    const seen: Array<{ type: string; sessionId: string; parentSessionId?: string }> = [];
    adapter.subscribe((event) => {
      if (event.type.startsWith("agent_run_")) seen.push(event as never);
    });
    const run = (sessionId: string, agentRunId: string, message: string, child?: object) =>
      adapter.accept({ kind: "run-state", sessionId, agentRunId, turnId: "turn-1", message, ...child } as never);
    run("sa-1", "child-run", "started", { parentSessionId: "main", parentCallId: "call-1" });
    run("sa-1", "child-run", "completed", { parentSessionId: "main", parentCallId: "call-1" });
    run("main", "main-run", "started");
    run("main", "main-run", "completed");
    expect(seen.map((event) => [event.type, event.sessionId, event.parentSessionId])).toEqual([
      ["agent_run_started", "sa-1", "main"],
      ["agent_run_finished", "sa-1", "main"],
      ["agent_run_started", "main", undefined],
      ["agent_run_finished", "main", undefined],
    ]);
  });
});
