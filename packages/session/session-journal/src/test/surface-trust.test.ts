import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { createCoreCodecRegistry } from "../core-codecs.js";
import type { SessionEventCandidateV1 } from "../event-envelope.js";
import { SessionJournal } from "../journal.js";
import { SessionSurface } from "../surface.js";
import { isTrustedSurfaceView, surfaceViewVersion } from "../index.js";

// agent-spec-context-trusted-surface.md §3.1 / §3.3：日志交出的对话视图已信任、按状态复用，版本号随追加和替换变化。

const source = { ownerPluginId: "@actspace/core" } as const;

function candidate(type: string, data: RuntimeV2JsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source, data, surface: null, ...extra };
}

function journalWithTwoMessages(): SessionJournal {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-11-07T12:00:00.000Z" });
  journal.append(candidate("user/message", { messageId: "user-1", content: "one" }, { surface: { kind: "append" } }));
  journal.append(candidate("assistant/message", { messageId: "assistant-1", content: "two" }, { surface: { kind: "append" } }));
  return journal;
}

describe("trusted Surface view", () => {
  it("returns the same frozen view object while the Surface is unchanged", () => {
    const journal = journalWithTwoMessages();
    const first = journal.surface;
    expect(journal.surface).toBe(first);
    expect(isTrustedSurfaceView(first)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entries)).toBe(true);
    for (const entry of first.entries) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.node)).toBe(true);
    }
    // 不进对话的事件不换视图。
    journal.append(candidate("turn/start", { turnId: "turn-1" }));
    expect(journal.surface).toBe(first);
  });

  it("issues a new view and version after append, appendMany and replace", () => {
    const journal = journalWithTwoMessages();
    const before = journal.surface;
    const beforeVersion = surfaceViewVersion(before);
    expect(beforeVersion).toBe("0:2:1");

    journal.append(candidate("user/message", { messageId: "user-2", content: "three" }, { surface: { kind: "append" } }));
    const appended = journal.surface;
    expect(appended).not.toBe(before);
    expect(surfaceViewVersion(appended)).toBe("0:3:2");
    expect(before.entries).toHaveLength(2);

    journal.appendMany([
      candidate("assistant/message", { messageId: "assistant-2", content: "four" }, { surface: { kind: "append" } }),
      candidate("user/message", { messageId: "user-3", content: "five" }, { surface: { kind: "append" } }),
    ]);
    const many = journal.surface;
    expect(many).not.toBe(appended);
    expect(surfaceViewVersion(many)).toBe("0:5:4");

    journal.append(candidate("compaction/start", { compactionId: "compact-1", start: 0, end: 2 }));
    journal.append(candidate("compaction/summary", { compactionId: "compact-1", summaryDigest: "digest" }));
    journal.append(candidate("surface/replaced", { compactionId: "compact-1", sourceEventSeqs: [0, 1], replacedTokens: { conversation: 0, summarizedConversation: 0 }, estimatorVersion: "test", node: { kind: "user", messageId: "summary-1", content: "summary" } }, {
      provenance: { sourceEventSeqs: [0, 1], contributorIds: ["compactor"], runtimeSelectionSeq: null },
      surface: { kind: "replace", start: 0, end: 2, sourceEventSeqs: [0, 1] },
    }));
    // 压缩是一个事务，到 compaction/end 才生效。
    expect(journal.surface).toBe(many);
    journal.append(candidate("compaction/end", { compactionId: "compact-1", summaryDigest: "digest" }));
    const replaced = journal.surface;
    expect(replaced).not.toBe(many);
    expect(replaced.replaceGeneration).toBe(1);
    expect(surfaceViewVersion(replaced)).toBe("1:4:4");
    expect(isTrustedSurfaceView(replaced)).toBe(true);
    expect(Object.isFrozen(replaced.entries[0]!.node)).toBe(true);
  });

  it("does not trust views of Surfaces rebuilt from caller input", () => {
    const journal = journalWithTwoMessages();
    const fromEvents = SessionSurface.fromEvents(journal.events).view;
    const fromView = SessionSurface.fromView(journal.surface).view;
    const cloned = SessionSurface.fromView(journal.surface).clone().view;
    for (const view of [fromEvents, fromView, cloned]) {
      expect(isTrustedSurfaceView(view)).toBe(false);
      expect(view.entries.map(entry => entry.node)).toEqual(journal.surface.entries.map(entry => entry.node));
    }
    // 自己的视图同样按状态复用。
    const surface = SessionSurface.fromView(journal.surface);
    expect(surface.view).toBe(surface.view);
  });

  it("does not trust a look-alike object and falls back to JSON for its version", () => {
    const journal = journalWithTwoMessages();
    const real = journal.surface;
    const impostor = { entries: [...real.entries], replaceGeneration: real.replaceGeneration };
    const frozenImpostor = Object.freeze({ entries: Object.freeze([...real.entries]), replaceGeneration: 0 });
    expect(isTrustedSurfaceView(impostor)).toBe(false);
    expect(isTrustedSurfaceView(frozenImpostor)).toBe(false);
    expect(isTrustedSurfaceView(null)).toBe(false);
    expect(surfaceViewVersion(impostor)).toBe(JSON.stringify(impostor));
  });
});
