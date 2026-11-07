import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCordisRoot, emitNotification } from "@actspace/cordis-adapter";
import { PromptExtensionRegistry } from "@actspace/prompt";
import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";
import { apply, type SessionTranscriptService } from "../plugin.js";
import { manifest } from "../manifest.js";
import { PROMPT_ID } from "../prompt.js";
import { isBashLogReadPath, isSessionTranscriptReadPath, transcriptPath } from "../paths.js";

const at = "2026-10-28T13:58:00.000Z";
function event(seq: number, type: string, data: Record<string, unknown>, surface: unknown = null): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: at, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1;
}
const userMessage = (seq: number, text: string) => event(seq, "user/message", { messageId: `m${seq}`, content: text }, { kind: "append" });
function header(sessionId: string, lineage: SessionHeaderV1["lineage"] = null): SessionHeaderV1 {
  return { recordKind: "header", format: "actspace-session", formatVersion: 1, backend: "raw-jsonl", backendSchemaVersion: 1, sessionId, createdAt: at, lineage, createdWith: { profileId: "test", runtimeContractVersion: "2", manifestDigest: "d", plugins: [], codecSetDigest: "c" } } as SessionHeaderV1;
}

type Fixture = { header: SessionHeaderV1; events: SessionEventEnvelopeV1[]; open: boolean };
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function setup(sessions: Record<string, Fixture>, options: { withJournal?: string[] } = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-transcript-"));
  directories.push(dataRoot);
  for (const [id, fixture] of Object.entries(sessions)) {
    if (options.withJournal && !options.withJournal.includes(id)) continue;
    await mkdir(join(dataRoot, "sessions-v2", id), { recursive: true });
    await writeFile(join(dataRoot, "sessions-v2", id, "journal.jsonl"), `${JSON.stringify(fixture.header)}\n`);
  }
  const root = await createCordisRoot();
  const extensions = new PromptExtensionRegistry();
  root.context.provide?.("actspace.host.session", { dataRoot, runtimeId: "test" });
  root.context.provide?.("actspace.host.prompt", { workspaceRoot: "/fixture", extensions });
  root.context.provide?.("session.runtime", {
    getOpen: (id: string) => {
      const fixture = sessions[id];
      if (!fixture?.open) return undefined;
      return { header: fixture.header, journal: { project: <T>(_key: symbol, initial: () => T, reduce: (state: T, value: SessionEventEnvelopeV1) => T) => fixture.events.reduce(reduce, initial()) } };
    },
  });
  root.context.provide?.("session.storage", {
    inspect: async (id: string) => ({ header: sessions[id]?.header ?? null, events: sessions[id]?.events ?? [] }),
    listSessionIds: async () => Object.keys(sessions).sort(),
  });
  await root.mount("session-transcript-test", ({ context }) => { apply(context!); });
  const service = root.getService<SessionTranscriptService>("session.transcript")!;
  return { dataRoot, root, extensions, service };
}

describe("session transcript plugin", () => {
  it("writes transcripts at turn end, including delegated children, and registers the prompt for main sessions", async () => {
    const sessions: Record<string, Fixture> = {
      "s-main": { header: header("s-main"), open: true, events: [
        userMessage(0, "帮我调研"),
        event(1, "tool/call", { callId: "c1", name: "agent", args: { task: "research" } }),
        event(2, "tool/result", { callId: "c1", name: "agent", status: "completed", modelOutput: [{ type: "text", text: "done" }], detail: [{ label: "delegation", value: { childSessionId: "child-1" } }] }),
        event(3, "turn/end", { reason: "completed" }),
      ] },
      "child-1": { header: header("child-1", { parentSessionId: "s-main", parentBoundarySeq: 1, origin: "delegation", delegationDepth: 1, parentCallId: "c1" }), open: false, events: [userMessage(0, "research")] },
    };
    const { dataRoot, root, extensions, service } = await setup(sessions);
    try {
      expect(manifest.contributions.services).toEqual(["session.transcript"]);
      emitNotification(root.context, "session/created", { sessionId: "s-main" });
      emitNotification(root.context, "session/created", { sessionId: "child-1" });
      const sources = (id: string) => extensions.list(id, `main:${id}`, "main");
      expect(sources("s-main").map(source => source.id)).toEqual([PROMPT_ID]);
      expect(sources("child-1")).toEqual([]);

      const written: unknown[] = [];
      const write = (value: unknown) => { written.push(value); };
      await sources("s-main")[0]!.get({ request: { sessionId: "s-main" }, status: { plugins: { "actspace.loop": { mode: "agent" } } } } as never, write as never);
      expect(JSON.stringify(written)).toContain(join(dataRoot, "sessions-v2"));
      written.length = 0;
      await sources("s-main")[0]!.get({ request: { sessionId: "s-main" }, status: { plugins: { "actspace.loop": { mode: "chat" } } } } as never, write as never);
      expect(written).toEqual([]);

      emitNotification(root.context, "session/event", sessions["s-main"]!.events[3], { sessionId: "s-main" });
      await service.render("s-main");
      const main = await readFile(transcriptPath(dataRoot, "s-main"), "utf8");
      expect(main).toContain("帮我调研");
      expect(main).toContain("subagent session child-1");
      const child = await readFile(transcriptPath(dataRoot, "child-1"), "utf8");
      expect(child).toContain("- Origin: subagent delegated by session s-main");
      expect(child).toContain("research");
    } finally { await root.dispose(); }
    expect(extensions.list("s-main", "main:s-main", "main")).toEqual([]);
  });

  it("adds a side chat mark to the parent transcript when the side chat opens", async () => {
    const sessions: Record<string, Fixture> = {
      "s-main": { header: header("s-main"), open: true, events: [userMessage(0, "主问题"), event(1, "turn/end", { reason: "completed" }), userMessage(2, "后续")] },
      "s-side": { header: header("s-side", { parentSessionId: "s-main", parentBoundarySeq: 1, origin: "side-chat", delegationDepth: 0 }), open: true, events: [] },
    };
    const { dataRoot, root, service } = await setup(sessions, { withJournal: ["s-main"] });
    try {
      await service.render("s-main");
      expect(await readFile(transcriptPath(dataRoot, "s-main"), "utf8")).not.toContain("Side chat opened here");
      await mkdir(join(dataRoot, "sessions-v2", "s-side"), { recursive: true });
      await writeFile(join(dataRoot, "sessions-v2", "s-side", "journal.jsonl"), `${JSON.stringify(sessions["s-side"]!.header)}\n`);
      emitNotification(root.context, "session/created", { sessionId: "s-side" });
      await vi.waitFor(async () => expect(await readFile(transcriptPath(dataRoot, "s-main"), "utf8")).toContain("> Side chat opened here → session s-side"));
    } finally { await root.dispose(); }
  });

  it("finds existing branches from Journal headers after a restart", async () => {
    const sessions: Record<string, Fixture> = {
      "s-main": { header: header("s-main"), open: true, events: [userMessage(0, "主问题"), event(1, "turn/end", { reason: "completed" })] },
      "s-fork": { header: header("s-fork", { parentSessionId: "s-main", parentBoundarySeq: 1, origin: "fork", delegationDepth: 0 }), open: false, events: [] },
    };
    const { dataRoot, root, service } = await setup(sessions);
    try {
      await service.render("s-main");
      expect(await readFile(transcriptPath(dataRoot, "s-main"), "utf8")).toContain("> Fork opened here → session s-fork");
    } finally { await root.dispose(); }
  });

  it("rewrites the title when it is set after the Turn ended, and leaves a running Turn alone", async () => {
    const fixture: Fixture = { header: header("s-title"), open: true, events: [event(0, "turn/start", { turnId: "t1" }), userMessage(1, "你好"), event(2, "turn/end", { reason: "completed" })] };
    const { dataRoot, root, service } = await setup({ "s-title": fixture });
    const notify = (value: SessionEventEnvelopeV1) => { fixture.events.push(value); emitNotification(root.context, "session/event", value, { sessionId: "s-title" }); };
    const transcript = () => readFile(transcriptPath(dataRoot, "s-title"), "utf8");
    try {
      // A title set before any Turn wrote the file waits for that Turn's end.
      notify(event(3, "session/title-set", { title: "太早" }));
      await new Promise(resolve => setImmediate(resolve));
      expect(existsSync(transcriptPath(dataRoot, "s-title"))).toBe(false);

      emitNotification(root.context, "session/event", fixture.events[0]!, { sessionId: "s-title" });
      emitNotification(root.context, "session/event", fixture.events[2]!, { sessionId: "s-title" });
      await service.render("s-title");
      expect((await transcript()).split("\n")[0]).toBe("# 太早");

      // Fast reply, slow title: the generated title lands after turn/end.
      notify(event(4, "session/title-set", { title: "问候与寒暄" }));
      await vi.waitFor(async () => expect((await transcript()).split("\n")[0]).toBe("# 问候与寒暄"));

      // Renamed while a Turn runs: no mid-Turn rewrite; the Turn's end carries the new title.
      notify(event(5, "turn/start", { turnId: "t2" }));
      notify(userMessage(6, "第二个问题"));
      notify(event(7, "session/title-set", { title: "手动改名" }));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(await transcript()).not.toContain("第二个问题");
      notify(event(8, "turn/end", { reason: "completed" }));
      await vi.waitFor(async () => expect(await transcript()).toContain("第二个问题"));
      expect((await transcript()).split("\n")[0]).toBe("# 手动改名");

      // Clearing the title between Turns.
      notify(event(9, "session/title-set", { title: null }));
      await vi.waitFor(async () => expect((await transcript()).split("\n")[0]).toBe("# Untitled session"));
      expect((await transcript()).match(/你好/g)).toHaveLength(1);
    } finally { await root.dispose(); }
  });

  it("refreshes a subagent transcript mid-Turn with its parent's facts, coalescing overlapping calls", async () => {
    const childEvents = [event(0, "turn/start", { turnId: "t1" }), userMessage(1, "review auth"), event(2, "tool/call", { callId: "c1", name: "bash", args: { command: "pnpm test" } })];
    let reads = 0;
    const child: Fixture = { header: header("child-2", { parentSessionId: "s-main", parentBoundarySeq: 4, origin: "delegation", delegationDepth: 1, parentCallId: "p1" }), open: false, get events() { reads++; return childEvents; } };
    const sessions: Record<string, Fixture> = {
      "s-main": { header: header("s-main"), open: true, events: [
        event(0, "subagent/spawned", { agentId: "child-2", callId: "p1", kind: "local", preset: "general", description: "review auth module", transcriptPath: "/x", createdAt: at }),
        event(1, "subagent/activation", { op: "start", agentId: "child-2", activationId: "a1", trigger: "spawn", callId: "p1", background: true, model: "gpt-5.5", startedAt: at }),
      ] },
      "child-2": child,
    };
    const { dataRoot, root, service } = await setup(sessions);
    try {
      await Promise.all([service.refresh("child-2"), service.refresh("child-2"), service.refresh("child-2")]);
      // One pass plus one more for the calls that overlapped it.
      expect(reads).toBe(2);
      const path = transcriptPath(dataRoot, "child-2");
      const text = await readFile(path, "utf8");
      expect(text).toContain("- Description: review auth module\n- Preset: general\n- Model: gpt-5.5");
      expect(text).toContain("- [#2] bash: pnpm test\n  → running");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      childEvents.push(event(3, "tool/result", { callId: "c1", name: "bash", status: "completed", modelOutput: [{ type: "text", text: "12 passed" }], detail: [] }));
      await service.refresh("child-2");
      expect(await readFile(path, "utf8")).toContain("- [#2] bash: pnpm test\n  → completed: 12 passed");
    } finally { await root.dispose(); }
  });

  it("skips sessions without a Journal on disk", async () => {
    const sessions: Record<string, Fixture> = { ephemeral: { header: header("ephemeral"), open: true, events: [userMessage(0, "hi")] } };
    const { dataRoot, root, service } = await setup(sessions, { withJournal: [] });
    try {
      await service.render("ephemeral");
      expect(existsSync(transcriptPath(dataRoot, "ephemeral"))).toBe(false);
    } finally { await root.dispose(); }
  });
});

describe("transcript read paths", () => {
  it("accepts only transcript files directly under the sessions root", () => {
    const dataRoot = "/data/actspace";
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/transcript.md")).toBe(true);
    // Searching the root would also reach Journals, so it keeps the approval.
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/sessions-v2")).toBe(false);
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/journal.jsonl")).toBe(false);
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123")).toBe(false);
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/sessions-v2/abc/nested/transcript.md")).toBe(false);
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/secrets.json")).toBe(false);
    expect(isSessionTranscriptReadPath(dataRoot, "/data/actspace/transcript.md")).toBe(false);
    expect(() => transcriptPath(dataRoot, "../escape")).toThrow();
  });

  it("accepts only bash_<uuid>.log files inside a Session's bash-log directory", () => {
    const dataRoot = "/data/actspace";
    const log = "/data/actspace/sessions-v2/abc-123/bash-log/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log";
    expect(isBashLogReadPath(dataRoot, log)).toBe(true);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/bash-log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/bash-log/notes.log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/bash-log/bash_1.log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/journal.jsonl")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/x/bash-log/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/elsewhere/sessions-v2/abc-123/bash-log/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log")).toBe(false);
    expect(isBashLogReadPath(dataRoot, "/data/actspace/sessions-v2/abc-123/bash-log/../bash-log/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log")).toBe(true);
  });
});
