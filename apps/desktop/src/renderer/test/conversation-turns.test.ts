import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import {
  createTurnNavigationItems,
  finalAssistantMessages,
  getLatestTodoMessage,
  groupMessagesIntoTurns,
  hasToolLikeItem,
  pickActiveTurnId,
  splitTurnMessages,
  userInputHistory,
  workDurationMs,
} from "../components/conversation/turns";

function msg(kind: MessageBlock["kind"], id: string, extra: Record<string, unknown> = {}): MessageBlock {
  return { kind, id, content: id, createdAt: "2026-10-06T00:00:00.000Z", ...extra } as unknown as MessageBlock;
}

const ids = (messages: MessageBlock[]) => messages.map((message) => message.id);

describe("groupMessagesIntoTurns", () => {
  it("opens a user-less turn at a background notice and keeps the following replies in it", () => {
    const turns = groupMessagesIntoTurns([
      msg("user", "u1"),
      msg("assistant", "a1"),
      msg("background_notice", "n1", { renderKey: "n1-key", taskId: "bash_1", taskKind: "bash", title: "pnpm test", status: "completed" }),
      msg("bash", "b1"),
      msg("assistant", "a2"),
    ]);
    expect(turns.map((turn) => [turn.id, turn.user?.id ?? null, turn.notice?.id ?? null, ids(turn.messages)])).toEqual([
      ["u1", "u1", null, ["a1"]],
      ["n1-key", null, "n1", ["b1", "a2"]],
    ]);
  });

  it("starts a turn at each user message and keeps compaction and worktree preparation on their own", () => {
    const turns = groupMessagesIntoTurns([
      msg("status", "orphan"),
      msg("user", "u1", { renderKey: "u1-key" }),
      msg("thinking", "t1"),
      msg("assistant", "a1"),
      msg("context_compaction", "c1"),
      msg("assistant", "after-compaction"),
      msg("user", "u2"),
      msg("workspace_preparation", "w1"),
      msg("assistant", "a2"),
    ]);
    expect(turns.map((turn) => [turn.id, turn.user?.id ?? null, ids(turn.messages)])).toEqual([
      ["turn-orphan", null, ["orphan"]],
      ["u1-key", "u1", ["t1", "a1"]],
      ["c1", null, ["c1"]],
      ["turn-after-compaction", null, ["after-compaction"]],
      ["u2", "u2", []],
      ["w1", null, ["w1"]],
      ["turn-a2", null, ["a2"]],
    ]);
  });
});

describe("splitTurnMessages", () => {
  it("treats only the trailing run of assistant messages as the final reply", () => {
    const messages = [msg("assistant", "narration"), msg("tool", "t"), msg("assistant", "r1"), msg("assistant", "r2")];
    const { workItems, finalReply } = splitTurnMessages(messages);
    expect(ids(workItems)).toEqual(["narration", "t"]);
    expect(ids(finalReply)).toEqual(["r1", "r2"]);
    expect(splitTurnMessages([msg("tool", "t")]).finalReply).toEqual([]);
    expect(ids(splitTurnMessages([msg("assistant", "only")]).workItems)).toEqual([]);
  });

  it("takes run failures out of the process so a partial reply before them stays the final reply", () => {
    const { workItems, finalReply, failures } = splitTurnMessages([msg("tool", "t"), msg("assistant", "partial"), msg("error", "failed")]);
    expect(ids(workItems)).toEqual(["t"]);
    expect(ids(finalReply)).toEqual(["partial"]);
    expect(ids(failures)).toEqual(["failed"]);
  });

  it("lists the final assistant messages of a turn", () => {
    const turn = { id: "u", user: null, messages: [msg("assistant", "a0"), msg("bash", "b"), msg("assistant", "a1")] };
    expect(ids(finalAssistantMessages(turn))).toEqual(["a1"]);
  });
});

describe("hasToolLikeItem", () => {
  it("counts thinking, bash, tool log lines and diffs, but not plain text, todo, status or run failures", () => {
    for (const kind of ["thinking", "bash", "read", "agent", "edit_diff", "write_diff"] as const) {
      expect(hasToolLikeItem([msg(kind, kind)])).toBe(true);
    }
    expect(hasToolLikeItem([msg("assistant", "a"), msg("todo", "todo"), msg("status", "s"), msg("error", "e"), msg("user", "u")])).toBe(false);
  });
});

describe("createTurnNavigationItems", () => {
  it("lists user turns with collapsed whitespace and marks only the last one pending while streaming", () => {
    const turns = groupMessagesIntoTurns([
      msg("assistant", "no-user"),
      msg("user", "u1", { content: "  first\n\n question " }),
      msg("tool", "t"),
      msg("assistant", "r1", { content: "line one\nline   two" }),
      msg("assistant", "r2", { content: "more" }),
      msg("user", "u2", { content: "second" }),
      msg("tool", "t2"),
    ]);
    expect(createTurnNavigationItems(turns, true)).toEqual([
      { id: "u1", input: "first question", reply: "line one line two more", pending: false },
      { id: "u2", input: "second", reply: null, pending: true },
    ]);
    expect(createTurnNavigationItems(turns, false).map((item) => item.pending)).toEqual([false, false]);
  });
});

describe("workDurationMs", () => {
  const at = (id: string, createdAt: string, kind: MessageBlock["kind"] = "tool") => msg(kind, id, { createdAt });

  it("measures from the first work item to the first reply, or to the last work item without a reply", () => {
    const work = [at("w1", "2026-10-06T00:00:00.000Z"), at("w2", "2026-10-06T00:00:05.000Z")];
    expect(workDurationMs(work, [at("r", "2026-10-06T00:00:12.000Z", "assistant")])).toBe(12_000);
    expect(workDurationMs(work, [])).toBe(5_000);
  });

  it("gives no duration without work items or with an unreadable time", () => {
    expect(workDurationMs([], [at("r", "2026-10-06T00:00:12.000Z", "assistant")])).toBeUndefined();
    expect(workDurationMs([at("w", "not a date")], [])).toBeUndefined();
  });
});

describe("getLatestTodoMessage", () => {
  it("returns the last todo list in the turn", () => {
    expect(getLatestTodoMessage([msg("todo", "old"), msg("tool", "t"), msg("todo", "new"), msg("assistant", "a")])?.id).toBe("new");
    expect(getLatestTodoMessage([msg("assistant", "a")])).toBeUndefined();
  });
});

describe("userInputHistory", () => {
  it("keeps non-empty user inputs in order", () => {
    expect(userInputHistory([
      msg("user", "u1", { content: "first" }),
      msg("assistant", "a", { content: "reply" }),
      msg("user", "u2", { content: "" }),
      msg("user", "u3", { content: "second" }),
    ])).toEqual(["first", "second"]);
  });
});

describe("pickActiveTurnId", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id, input: id, reply: null, pending: false }));

  it("picks the last turn whose top has passed the reading line", () => {
    const tops: Record<string, number> = { a: -400, b: 50, c: 150, d: 600 };
    expect(pickActiveTurnId(items, (id) => tops[id], 100)).toBe("b");
    expect(pickActiveTurnId(items, (id) => tops[id], 150)).toBe("c");
    expect(pickActiveTurnId(items, (id) => tops[id], -500)).toBe("a");
  });

  it("skips turns that are not mounted and handles an empty list", () => {
    const tops: Record<string, number | undefined> = { a: undefined, b: undefined, c: 10, d: 900 };
    expect(pickActiveTurnId(items, (id) => tops[id], 100)).toBe("c");
    expect(pickActiveTurnId([], () => 0, 100)).toBeNull();
  });
});

describe("isSafeWorkspaceRelativePath", () => {
  it("accepts plain relative paths and rejects absolute, drive-letter and parent paths", async () => {
    const { isSafeWorkspaceRelativePath } = await import("../components/conversation/use-workspace-file-links");
    expect(["src/a.ts", "a.ts", "dir\\file.ts", "..hidden/x"].map(isSafeWorkspaceRelativePath)).toEqual([true, true, true, true]);
    expect(["", ".", "/etc/passwd", "C:\\x", "c:/x", "../x", "a/../../x", "a\\..\\x"].map(isSafeWorkspaceRelativePath)).toEqual(Array(8).fill(false));
  });
});
