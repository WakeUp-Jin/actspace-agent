import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

const datasets = process.argv.flatMap((arg, i, args) => arg === "--dataset" ? [args[i + 1]] : arg.startsWith("--dataset=") ? [arg.slice(10)] : []);
if (datasets.length) {
  const sizes = { S: [100_000, 100], M: [1_000_000, 1_000], L: [5_000_000, 5_000], XL: [10_000_000, 10_000] };
  for (const dataset of datasets) {
    if (!(dataset in sizes)) throw new Error(`Unknown dataset: ${dataset}`);
    const [rows, sessions] = sizes[dataset];
    const tasks = [["benchmark-usage-read-model.mjs", "worker"]];
    if (dataset === "S" || dataset === "M") tasks.push(["benchmark-usage-json-baseline.mjs", "json"], ["benchmark-usage-journal.mjs", "journal"]);
    for (const [script, scope] of tasks) {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(import.meta.dirname, script), `--rows=${rows}`, `--sessions=${sessions}`, "--iterations=20", `--out=artifacts/usage-read-model/${dataset.toLowerCase()}-${scope}.json`], { stdio: "inherit" });
        child.on("error", reject); child.on("exit", resolve);
      });
      if (code !== 0) throw new Error(`${dataset} ${scope} benchmark failed: ${code}`);
    }
  }
  process.exit(0);
}

const workerPath = join(new URL("..", import.meta.url).pathname, "dist-electron/main/runtime-v2/usage-read-model-worker.js");
const root = await mkdtemp(join(tmpdir(), "actspace-usage-read-model-verify-"));
const worker = new Worker(workerPath, { workerData: { dataRoot: root } });
let sequence = 0;
const send = (message) => new Promise((resolve, reject) => {
  const id = String(++sequence);
  const onMessage = (reply) => {
    if (reply.id !== id || reply.heartbeat) return;
    worker.off("message", onMessage);
    reply.ok ? resolve(reply.result) : reject(new Error(reply.error));
  };
  worker.on("message", onMessage);
  worker.postMessage({ ...message, id });
});

const sources = ["one", "two"].map((sessionId, sessionIndex) => ({
  sessionId,
  title: `Session ${sessionId}`,
  throughJournalSeq: 12,
  rows: Array.from({ length: 12 }, (_, index) => ({
    activityId: `${sessionId}-${index}`,
    sessionId,
    agentRunId: `${sessionId}-run-${index}`,
    startedAt: new Date(1_700_000_000_000 + (sessionIndex * 12 + index) * 1000).toISOString(),
    endedAt: undefined,
    kind: index % 4 === 0 ? "tool_invocation" : "llm_request",
    status: index === 3 ? "error" : "success",
    model: `model-${index % 2}`,
    providerId: "provider-a",
    connectionId: "connection-a",
    toolName: index % 4 === 0 ? "search" : undefined,
    tokens: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 3, totalTokens: 30 },
    costUsd: 0.1,
    costAmount: 0.1,
    costCurrency: "USD",
    sourceEventSeq: index,
    relatedEventSeqs: [],
  })),
}));

await send({ type: "sync", sources, catalog: sources.map((source, index) => ({ sessionId: source.sessionId, title: source.title, revision: source.throughJournalSeq, createdAt: source.rows[0].startedAt, updatedAt: source.rows.at(-1).startedAt, workspaceRoot: `/workspace/${index}`, pinned: index === 0, archived: false, accessState: "read-write", isChildSession: false, agentRunCount: 2, agentForm: "agent" })), activeSessionIds: sources.map(source => source.sessionId) });
const firstPage = await send({ type: "query", request: "activity", input: { scope: "global", range: "total", search: "model-1", requestRowsPage: { limit: 3 } } });
if (firstPage.rows.length !== 3 || !firstPage.rowsPage.nextCursor) throw new Error("FTS activity page did not return a bounded cursor page.");
const secondPage = await send({ type: "query", request: "activity", input: { scope: "global", range: "total", search: "model-1", requestRowsPage: { limit: 3, cursor: firstPage.rowsPage.nextCursor } } });
if (secondPage.rows.length === 0 || secondPage.rows[0]?.activityId === firstPage.rows[0]?.activityId) throw new Error("Cursor page did not advance.");
const statistics = await send({ type: "query", request: "statistics", input: { scope: "global", range: "total", requestRowsPage: { limit: 4 } } });
if (statistics.requestRows.length !== 4 || statistics.summary.totalTokens <= 0 || statistics.dailyRows.length !== 1) throw new Error("SQL statistics aggregation returned an unexpected shape.");
const sessions = await send({ type: "query", request: "sessions", input: { pinned: true } });
if (sessions.items.length !== 1 || sessions.items[0]?.id !== "one") throw new Error("Session catalog pagination did not return the expected pinned session.");
await send({ type: "sync", sources: [sources[0]], activeSessionIds: [sources[0].sessionId] });
const removed = await send({ type: "query", request: "activity", input: { scope: "session", sessionId: "two", range: "total" } });
if (removed !== null) throw new Error("Deleted session was not pruned from the read model.");
const databasePath = join(root, "runtime-v2/usage-read-model.sqlite");
const databaseBytes = (await readFile(databasePath)).byteLength;
if (databaseBytes <= 0) throw new Error("SQLite read model was not created.");
console.log(JSON.stringify({ ok: true, ftsRows: firstPage.rows.length, cursorRows: secondPage.rows.length, statisticsRows: statistics.requestRows.length, sessionRows: sessions.items.length, databaseBytes }, null, 2));
await worker.terminate();
await rm(root, { recursive: true, force: true });
