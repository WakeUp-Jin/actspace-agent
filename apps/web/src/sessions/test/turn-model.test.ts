import type { MessageBlock, TurnUsageSummary } from "@actspace/shared";
import { buildTranscript } from "../transcript-model";
import { buildTurns, formatWorked, turnChanges, turnUsage, workedMs } from "../turn-model";

const t = (seconds: number) => new Date(Date.UTC(2026, 9, 17, 0, 0, seconds)).toISOString();
const user = (id: string, s = 0): MessageBlock => ({ kind: "user", id, content: id, createdAt: t(s) });
const text = (id: string, s: number, extra: Partial<MessageBlock> = {}): MessageBlock => ({ kind: "assistant", id, content: id, createdAt: t(s), ...extra } as MessageBlock);
const read = (id: string, s: number): MessageBlock => ({ kind: "read", id, filePath: `/a/${id}`, displayText: id, createdAt: t(s) });
const edit = (id: string, path: string, additions: number, deletions: number, extra: Partial<MessageBlock> = {}): MessageBlock => ({ kind: "edit_diff", id, filePath: path, additions, deletions, diff: "", createdAt: t(5), ...extra } as MessageBlock);
const error = (id: string): MessageBlock => ({ kind: "error", id, title: "失败", content: "x", createdAt: t(9) } as MessageBlock);
const turns = (blocks: MessageBlock[]) => buildTurns(buildTranscript(blocks, { blocks: [], runId: null }));

it("splits process, trailing reply and tail per user message", () => {
  const [first, second] = turns([user("u1"), read("r", 1), text("narration", 2), edit("e", "/a.ts", 1, 0), text("reply", 70), error("err"), user("u2", 80), text("answer", 81)]);
  expect(first!.user?.content).toBe("u1");
  expect(first!.process.map(item => item.key)).toEqual(["explore:r", "narration", "e"]);
  expect(first!.reply.map(item => item.key)).toEqual(["reply"]);
  expect(first!.tail.map(item => item.key)).toEqual(["err"]);
  expect(second!.process).toEqual([]);
  expect(second!.reply.map(item => item.key)).toEqual(["answer"]);
});

it("keeps a context compaction as its own turn", () => {
  const list = turns([user("u1"), text("a", 1), { kind: "context_compaction", id: "c", status: "completed", createdAt: t(2) } as MessageBlock, text("b", 3)]);
  expect(list.map(turn => [turn.user?.content ?? null, turn.tail.map(item => item.key), turn.reply.map(item => item.key)])).toEqual([["u1", [], ["a"]], [null, ["c"], []], [null, [], ["b"]]]);
});

it("measures worked time from the first process block to the reply", () => {
  const [turn] = turns([user("u1"), read("r", 1), text("reply", 73)]);
  expect(workedMs(turn!)).toBe(72_000);
  expect(formatWorked(72_000)).toBe("Worked for 1m 12s");
  expect(formatWorked(60_000)).toBe("Worked for 1m");
  expect(formatWorked(4_200)).toBe("Worked for 4s");
  expect(formatWorked(undefined)).toBe("Worked");
});

it("merges successful file changes by path and skips failed or denied ones", () => {
  const [turn] = turns([user("u1"), edit("e1", "/a.ts", 3, 1), edit("e2", "/a.ts", 2, 0), edit("e3", "/b.ts", 9, 9, { status: "failed" }), edit("e4", "/c.ts", 1, 1, { status: "denied" }), edit("e5", "/d.ts", 4, 0), text("done", 9)]);
  expect(turnChanges(turn!)).toEqual({ files: [{ path: "/a.ts", additions: 5, deletions: 1 }, { path: "/d.ts", additions: 4, deletions: 0 }], additions: 9, deletions: 1 });
  const [plain] = turns([user("u1"), text("hi", 1)]);
  expect(turnChanges(plain!)).toBeNull();
});

it("takes usage from the last reply block that carries it", () => {
  const usage = { totalTokens: 10 } as TurnUsageSummary;
  const [turn] = turns([user("u1"), read("r", 1), text("a", 2, { usage: { totalTokens: 1 } as TurnUsageSummary }), text("b", 3, { usage }), text("c", 4)]);
  expect(turnUsage(turn!)).toBe(usage);
});
