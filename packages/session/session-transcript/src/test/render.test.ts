import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";
import { foldTranscript, formatTime, inheritedThroughSeq, reduceSubagentFacts, renderTranscript, type TranscriptBranch, type TranscriptSubagentFacts } from "../render.js";

let seq = 0;
const at = "2026-10-28T13:58:00.000Z";
function event(type: string, data: Record<string, unknown>, surface: unknown = null): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq: seq++, type, eventVersion: 1, criticality: "required", time: at, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1;
}
const user = (content: unknown) => event("user/message", { messageId: `m${seq}` }, { kind: "append", node: { kind: "user", messageId: `m${seq}`, content } });
const assistant = (content: unknown[]) => event("assistant/message", { messageId: `a${seq}`, content }, { kind: "append", node: { kind: "assistant", messageId: `a${seq}`, content } });
const call = (callId: string, name: string, args: Record<string, unknown>) => event("tool/call", { callId, name, args });
const result = (callId: string, name: string, status: string, text: string, extra: Record<string, unknown> = {}) =>
  event("tool/result", { callId, name, status, summary: `${name} ${status}`, modelOutput: [{ type: "text", text }], detail: [], failure: null, ...extra }, { kind: "append", node: { kind: "tool-result", messageId: `tool-${callId}`, callId, content: [{ type: "text", text }], isError: status !== "completed" } });

function header(overrides: Partial<SessionHeaderV1> = {}): SessionHeaderV1 {
  return { recordKind: "header", format: "actspace-session", formatVersion: 1, backend: "raw-jsonl", backendSchemaVersion: 1, sessionId: "s-main", createdAt: at, cwd: "/work/repo", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "2", manifestDigest: "d", plugins: [], codecSetDigest: "c" }, ...overrides } as SessionHeaderV1;
}

describe("session transcript rendering", () => {
  it("keeps conversation text, drops reasoning and chunks, and cuts tool results to one line", () => {
    seq = 0;
    const events = [
      event("session/title-set", { title: "沙箱调研" }),
      event("turn/start", { turnId: "t1" }),
      user([{ type: "text", text: "看看这个项目" }, { type: "artifact", artifact: { artifactId: "x", mediaType: "image/png" }, label: "shot.png" }]),
      event("assistant/chunk", { delta: "streaming noise" }),
      assistant([{ type: "reasoning", text: "secret thinking", signature: "sig" }, { type: "text", text: "我先看一下目录。" }, { type: "tool-call", callId: "c1", name: "bash", arguments: "{}" }]),
      call("c1", "bash", { command: "ls -la\n  src", intent: "look" }),
      event("request/context", { huge: "x".repeat(1000) }),
      result("c1", "bash", "completed", "total 8\nsrc\nREADME.md"),
      assistant([{ type: "text", text: "里面有 src 和 README。" }]),
      event("turn/end", { turnId: "t1", reason: "completed" }),
    ];
    const markdown = renderTranscript(header(), foldTranscript(events));
    expect(markdown).toContain("# 沙箱调研");
    expect(markdown).toContain("- Session ID: s-main");
    expect(markdown).toContain("- Working directory: /work/repo");
    expect(markdown).toContain("- Origin: main session");
    expect(markdown).toContain(`## User [#2] · ${formatTime(at)}\n\n看看这个项目\n\n[image: shot.png]`);
    expect(markdown).toContain("## Assistant [#4]");
    expect(markdown).toContain("- [#5] bash: ls -la src\n  → completed: total 8 (+2 more lines)");
    // Consecutive assistant steps share one heading.
    expect(markdown.match(/## Assistant/g)).toHaveLength(1);
    expect(markdown).toContain("里面有 src 和 README。");
    for (const omitted of ["secret thinking", "streaming noise", "xxxxxxxx", "\"intent\""]) expect(markdown).not.toContain(omitted);
  });

  it("links delegated subagents, records failures, compaction summaries and unfinished turns", () => {
    seq = 0;
    const events = [
      user("调研一下"),
      assistant([]),
      call("c1", "agent", { task: "read the repo\nand report" }),
      result("c1", "agent", "completed", "## Findings\nmore", { detail: [{ label: "delegation", value: { childSessionId: "child-1", status: "completed" } }] }),
      call("c2", "bash", { command: "rm -rf /" }),
      result("c2", "bash", "denied", "", { failure: { code: "BASH_COMMAND_DENIED", message: "Command is not allowed." } }),
      event("surface/replaced", { compactionId: "k1" }, { kind: "replace", start: 0, end: 3, node: { kind: "user", messageId: "compaction-1", content: { text: "## Summary\nUser asked for research.", metadata: {} } }, sourceEventSeqs: [0, 1] }),
      call("c3", "read_file", { path: "/work/repo/a.ts" }),
      event("turn/end", { turnId: "t1", reason: "aborted" }),
    ];
    const state = foldTranscript(events);
    const markdown = renderTranscript(header(), state);
    expect(state.children).toEqual(["child-1"]);
    expect(markdown).toContain("- [#2] agent: read the repo and report\n  → completed · subagent session child-1 (transcript: ../child-1/transcript.md): ## Findings (+1 more lines)");
    expect(markdown).toContain("- [#4] bash: rm -rf /\n  → denied: Command is not allowed.");
    expect(markdown).toContain("### Context compaction [#6]");
    expect(markdown).toContain("> ## Summary\n> User asked for research.");
    expect(markdown).toContain("- [#7] read_file: /work/repo/a.ts\n  → no result recorded");
    expect(markdown).toContain("_Turn ended: aborted [#8]_");
  });

  it("skips content inherited by a side chat and marks branches in the parent", () => {
    seq = 0;
    const parentEvents = [user("主会话问题"), assistant([{ type: "text", text: "主会话回答" }]), event("turn/end", { reason: "completed" }), user("后续问题")];
    const side = header({ sessionId: "s-side", lineage: { parentSessionId: "s-main", parentBoundarySeq: 2, origin: "side-chat", delegationDepth: 0 } });
    seq = 3;
    const childEvents = [...parentEvents.slice(0, 3), user("侧边提问")];
    const sideMarkdown = renderTranscript(side, foldTranscript(childEvents, 2));
    expect(sideMarkdown).toContain("- Origin: side chat of session s-main");
    expect(sideMarkdown).toContain("Events up to [#2] were copied from session s-main; read ../s-main/transcript.md for that part.");
    expect(sideMarkdown).toContain("侧边提问");
    expect(sideMarkdown).not.toContain("主会话回答");

    const branches: TranscriptBranch[] = [{ sessionId: "s-side", origin: "side-chat", boundarySeq: 2 }];
    const parentMarkdown = renderTranscript(header(), foldTranscript(parentEvents), branches);
    const mark = parentMarkdown.indexOf("> Side chat opened here → session s-side (transcript: ../s-side/transcript.md)");
    expect(mark).toBeGreaterThan(parentMarkdown.indexOf("主会话回答"));
    expect(mark).toBeLessThan(parentMarkdown.indexOf("后续问题"));
  });

  it("describes subagent origin and renders an empty session", () => {
    const child = header({ sessionId: "child-1", lineage: { parentSessionId: "s-main", parentBoundarySeq: 9, origin: "delegation", delegationDepth: 1, parentCallId: "c1" } });
    const markdown = renderTranscript(child, foldTranscript([]));
    expect(markdown).toContain("# Untitled session");
    expect(markdown).toContain("- Origin: subagent delegated by session s-main (transcript: ../s-main/transcript.md)");
    expect(markdown).not.toContain("were copied from");
    expect(markdown).toContain("_No messages yet._");
  });

  it("shows calls of a Turn in progress as running, and as no result once the Turn ends", () => {
    seq = 0;
    const open = [event("turn/start", { turnId: "t1" }), user("go"), call("c1", "bash", { command: "pnpm test" }), call("c2", "read_file", { path: "/a.ts" }), result("c2", "read_file", "completed", "ok")];
    const running = renderTranscript(header(), foldTranscript(open));
    expect(running).toContain("- [#2] bash: pnpm test\n  → running");
    expect(running).toContain("- [#3] read_file: /a.ts\n  → completed: ok");
    // The running line sits at the call's place, before the later finished call.
    expect(running.indexOf("[#2] bash")).toBeLessThan(running.indexOf("[#3] read_file"));
    const ended = renderTranscript(header(), foldTranscript([...open, event("turn/end", { turnId: "t1", reason: "aborted" })]));
    expect(ended).toContain("- [#2] bash: pnpm test\n  → no result recorded");
    expect(ended).not.toContain("→ running");
  });

  it("renders agent messages, subagent notifications and send_message lines", () => {
    seq = 0;
    const spliced = (messageId: string, source: string, content: string, extra: Record<string, unknown> = {}) =>
      event("agent/inbox/spliced", { operation: "claim", messageId, target: "next-step", source, ...extra }, { kind: "append", node: { kind: "user", messageId, content } });
    const events = [
      user("start"),
      call("c1", "send_message", { agent_id: "child-7", message: "Also check the tests.\nThanks" }),
      result("c1", "send_message", "completed", "Message delivered to child-7 (running; it will see it at its next step)."),
      spliced("n1", "subagent_notification", "<subagent_notification>\n<agent_id>child-7</agent_id>\n<status>completed</status>\n<summary>Subagent child-7 finished and will do no further work unless you send it more.</summary>\n<closing_message>\nlong reply\n</closing_message>\n</subagent_notification>"),
      spliced("n2", "agent_message", "<agent_message from=\"child-7\" relation=\"child\">\nI need the API key name.\n</agent_message>", { senderId: "child-7" }),
    ];
    const markdown = renderTranscript(header(), foldTranscript(events));
    expect(markdown).toContain("- [#1] send_message → child-7: Also check the tests.\n  → completed: Message delivered to child-7");
    expect(markdown).toContain(`## Subagent notification [#3] · ${formatTime(at)}\n\nSubagent child-7 finished and will do no further work unless you send it more.`);
    expect(markdown).not.toContain("long reply");
    expect(markdown).toContain(`## Message from child-7 [#4] · ${formatTime(at)}\n\nI need the API key name.`);
    expect(markdown).not.toContain("<agent_message");
  });

  it("marks a background Bash line whose log was pruned", () => {
    seq = 0;
    const events = [
      call("c1", "bash", { command: "pnpm dev" }),
      event("background/task", { op: "start", taskId: "bash_1", kind: "bash", callId: "c1", description: "pnpm dev", startedAt: at }),
      result("c1", "bash", "completed", "Bash task bash_1 is running in the background."),
      call("c2", "bash", { command: "ls" }),
      result("c2", "bash", "completed", "a"),
      event("background/task", { op: "settle", taskId: "bash_1", status: "completed", delivery: "notified", endedAt: at }),
      event("background/task", { op: "prune", taskId: "bash_1", reason: "session-cap", prunedAt: at }),
      event("background/task", { op: "prune", taskId: "unknown", reason: "session-cap", prunedAt: at }),
    ];
    const markdown = renderTranscript(header(), foldTranscript(events));
    expect(markdown).toContain("- [#0] bash: pnpm dev\n  → completed: Bash task bash_1 is running in the background. (log pruned)");
    expect(markdown).toContain("- [#3] bash: ls\n  → completed: a\n");
    expect(markdown.match(/log pruned/g)).toHaveLength(1);
  });

  it("writes subagent facts from the parent Journal and skips a forked subagent's inherited events", () => {
    seq = 0;
    let facts: Readonly<Record<string, TranscriptSubagentFacts>> = {};
    for (const item of [
      event("subagent/spawned", { agentId: "child-f", callId: "c9", kind: "fork", description: "try the other approach", transcriptPath: "/x/child-f/transcript.md", createdAt: at, inheritedThroughSeq: 2 }),
      event("subagent/activation", { op: "start", agentId: "child-f", activationId: "a1", trigger: "spawn", callId: "c9", background: true, model: "deepseek-v4", startedAt: at }),
      event("subagent/spawned", { agentId: "child-l", callId: "c10", kind: "local", preset: "explore", description: "map the repo", transcriptPath: "/x/child-l/transcript.md", createdAt: at }),
    ]) facts = reduceSubagentFacts(facts, item);
    seq = 0;
    const lineage = { parentSessionId: "s-main", parentBoundarySeq: 2, origin: "delegation", delegationDepth: 1, parentCallId: "c9", inheritedThroughSeq: 2 } as const;
    const fork = header({ sessionId: "child-f", lineage });
    expect(inheritedThroughSeq(fork)).toBe(2);
    const events = [user("父会话里的问题"), assistant([{ type: "text", text: "父会话里的回答" }]), event("turn/end", { reason: "completed" }), event("turn/end", { reason: "forked" }), user("fork 任务")];
    const markdown = renderTranscript(fork, foldTranscript(events, inheritedThroughSeq(fork)), [], facts["child-f"]);
    expect(markdown).toContain("- Description: try the other approach\n- Preset: fork\n- Model: deepseek-v4\n- Events up to [#2] were copied from session s-main; read ../s-main/transcript.md for that part.");
    expect(markdown).toContain("fork 任务");
    expect(markdown).not.toContain("父会话里的回答");
    const { inheritedThroughSeq: _copied, ...plain } = lineage;
    const local = renderTranscript(header({ sessionId: "child-l", lineage: { ...plain, parentCallId: "c10" } }), foldTranscript([]), [], facts["child-l"]);
    expect(local).toContain("- Description: map the repo\n- Preset: explore\n");
    expect(local).not.toContain("- Model:");
    expect(local).not.toContain("were copied from");
  });
});
