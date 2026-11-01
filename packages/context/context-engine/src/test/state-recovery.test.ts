import { expect, it } from "vitest";
import { SessionJournal, createCoreCodecRegistry, createCompactionTransaction } from "@actspace/session-journal";
import { codecs, SUPPLEMENT_EVENT } from "../codec.js";
import { ContextSupplements, type ContextSession } from "../supplements.js";

function fixture(seed: SessionJournal["events"] = []): ContextSession {
  const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
  const journal = new SessionJournal({ registry, seed });
  return { header: { sessionId: "s" }, journal, get lastSeq() { return journal.lastSeq; }, append: async value => journal.append(value), flush: async () => {} };
}
const request = { sessionId: "s", turnId: "turn", stepId: "step", requestId: "r", routeId: "r", model: "m", options: {} };
const owners = new Set(["runtime"]);
async function user(session: ContextSession, id: string) {
  return session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: id }, surface: { kind: "append", node: { kind: "user", messageId: id, content: id } } });
}

it("persists versions once, hides removed owners and restores only the latest version after compaction", async () => {
  const session = fixture(); await user(session, "one"); const store = new ContextSupplements(session);
  await store.put({ op: "add", owner: "runtime", id: "state", text: "old", lifetime: "persistent", afterEventSeq: store.tailAnchor() });
  await store.put({ op: "add", owner: "runtime", id: "state", text: "old", lifetime: "persistent", afterEventSeq: store.tailAnchor() });
  await user(session, "two");
  await store.put({ op: "add", owner: "runtime", id: "state", text: "new", lifetime: "persistent", afterEventSeq: store.tailAnchor() });
  expect(session.journal.events.filter(event => event.type === SUPPLEMENT_EVENT)).toHaveLength(2);
  const transaction = createCompactionTransaction({ surface: session.journal.surface, start: 0, end: 2, summary: { kind: "user", messageId: "summary", content: "summary" }, compactionId: "c", contributorIds: [], summaryDigest: "digest" });
  (session.journal as SessionJournal).appendMany(transaction);
  const recovered = fixture(session.journal.events); const restored = new ContextSupplements(recovered);
  await restored.refresh(owners);
  expect(restored.get(request, owners).map(value => value.text)).toEqual(["new"]);
  expect(restored.get(request, new Set())).toEqual([]);
  const seq = recovered.lastSeq; await restored.refresh(owners); expect(recovered.lastSeq).toBe(seq);
  expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: recovered.journal.events }).validation.accessState).toBe("browse-only");
});

it("does not consume a request slot until prepared, reuses it for retries, and ends Turn slots", async () => {
  const session = fixture(); await user(session, "one"); const store = new ContextSupplements(session);
  await store.put({ op: "add", owner: "runtime", id: "once", text: "once", lifetime: "request", turnId: "turn", afterEventSeq: store.tailAnchor() });
  expect(store.get(request, owners)).toHaveLength(1);
  expect(store.get({ ...request, requestId: "prepare-retry" }, owners)).toHaveLength(1);
  await store.bind(request);
  expect(store.get({ ...request, requestId: "transport-retry" }, owners)).toHaveLength(1);
  expect(store.get({ ...request, stepId: "next-step" }, owners)).toHaveLength(0);
  expect(store.get({ ...request, turnId: "next-turn" }, owners)).toHaveLength(0);
  await store.remove("runtime", "once"); const seq = session.lastSeq; await store.remove("runtime", "once"); expect(session.lastSeq).toBe(seq);
});
