// 生成 T7 等价性测试的旧格式 fixture：run7 父会话（工具调用 + Inbox claim）全程，
// 末尾补一段崩溃恢复（tool/recovery-outcome）和一次压缩替换（surface/replaced）。
// 只在改动前的代码（tmp/surface-golden-wt，HEAD 0e0070a3）上跑：用旧的 recovery / compaction 写入方生成事件，
// 确保补的两段与旧代码真实写出的格式一致。
// 用法：node tmp/surface-golden/make-fixture.mjs <wt-root> <run7-journal> <out-old.jsonl>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [wt, journalPath, out] = process.argv.slice(2);
const req = createRequire(join(wt, "packages/core/runtime/package.json"));
const journalMod = await import(req.resolve("@actspace/session-journal"));
const persistence = await import(req.resolve("@actspace/session-persistence"));
const { SessionJournal, createCoreCodecRegistry, createCompactionTransaction } = journalMod;

const MAX_TEXT = 120;
const trimText = (value) => typeof value === "string" && value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…[trimmed ${value.length - MAX_TEXT}]` : value;
/** 只裁剪长字符串，结构保持不变；data 和 surface.node 里同一份内容按同样规则裁剪，两份仍然相同。 */
function trim(value) {
  if (typeof value === "string") return trimText(value);
  if (Array.isArray(value)) return value.map(trim);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item)]));
  return value;
}

const rows = readFileSync(journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const header = rows[0];
// 请求记录（系统提示词、工具定义、请求上下文）很大且与 surface 无关，去掉；其余事件保留。
const DROP = new Set(["request/system-prompt", "request/tools", "plugin/actspace.context/state"]);
// request/context 的快照与 surface 无关，只保留关系校验要的 id。
const slim = (event) => event.type === "request/context" ? { ...event, data: { requestId: event.data.requestId, turnId: event.data.turnId, stepId: event.data.stepId, snapshot: {} } } : event;
const kept = rows.slice(1).filter((event) => !DROP.has(event.type)).map(slim).map(trim);
// 重新编号：seq 连续，引用（provenance.sourceEventSeqs、surface.sourceEventSeqs）一起改。
const remap = new Map(kept.map((event, index) => [event.seq, index]));
const renumber = (seqs) => seqs.filter((seq) => remap.has(seq)).map((seq) => remap.get(seq));
const events = kept.map((event, index) => ({
  ...event,
  seq: index,
  provenance: { ...event.provenance, sourceEventSeqs: renumber(event.provenance.sourceEventSeqs) },
}));

const known = createCoreCodecRegistry();
// 插件事件（context supplement、agent-service task/run 等）用宽松 codec 登记，只为回放；它们与 surface 无关。
const pluginCodecs = [...new Map(events.filter((event) => known.get(event.type) === undefined).map((event) => [event.type, {
  type: event.type, ownerPluginId: event.source.ownerPluginId, currentVersion: event.eventVersion, criticality: event.criticality, validate: () => undefined,
}])).values()];
const registry = createCoreCodecRegistry(pluginCodecs);
console.log("plugin codecs:", pluginCodecs.map((codec) => codec.type).join(", "));
// 用 SessionJournal 回放，确认裁剪、重新编号后的旧格式仍然合法（插件事件按未知可忽略处理）。
const journal = new SessionJournal({ registry, seed: events, now: () => "2026-11-07T00:00:00.000Z" });

// 1) 崩溃恢复：开一个新回合，留一个没有结果的工具调用，再用旧的 recovery 写入方补上恢复事务。
const ids = { agentRunId: "run-golden", turnId: "turn-golden", stepId: "step-golden", requestId: "req-golden" };
const core = (type, data, extra = {}) => ({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra });
journal.append(core("turn/start", { turnId: ids.turnId, agentRunId: ids.agentRunId, mode: "agent", modeRevision: 0 }));
journal.append(core("user/message", { messageId: "golden-user", agentRunId: ids.agentRunId, turnId: ids.turnId }, { surface: { kind: "append", node: { kind: "user", messageId: "golden-user", content: [{ type: "text", text: "继续：读一下 README" }] } } }));
journal.append(core("step/start", { turnId: ids.turnId, stepId: ids.stepId, agentRunId: ids.agentRunId, stepIndex: 1 }));
journal.append(core("request/header", { ...ids, routeId: "default", model: "golden" }));
journal.append(core("request/context", { requestId: ids.requestId, turnId: ids.turnId, stepId: ids.stepId, snapshot: {} }));
journal.append(core("assistant/message", { ...ids, messageId: "golden-assistant", content: [{ type: "tool-call", callId: "golden-call", name: "read_file", arguments: "{\"path\":\"README.md\"}" }], finishReason: "tool-calls" }, { surface: { kind: "append", node: { kind: "assistant", messageId: "golden-assistant", content: [{ type: "tool-call", callId: "golden-call", name: "read_file", arguments: "{\"path\":\"README.md\"}" }] } } }));
journal.append(core("tool/call", { ...ids, callId: "golden-call", pluginId: "actspace.filesystem-read", name: "read_file", args: { path: "README.md" } }));
const plan = persistence.planSessionRecovery(journal.events);
if (!plan) throw new Error("expected a recovery plan");
journal.appendMany(plan.candidates);

// 2) 压缩：把当前对话前 6 个节点替换成摘要，用旧的 compaction 写入方生成事务。
const summary = { kind: "user", messageId: "golden-summary", content: { text: "## Summary\n用户让 4 个子 Agent 调研子智能体实现，已汇总。", metadata: {} } };
journal.appendMany(createCompactionTransaction({
  surface: journal.surface, start: 0, end: 6, summary, compactionId: "golden-compaction", contributorIds: ["golden"],
  summaryDigest: "golden-digest", replacedTokens: { conversation: 1234, summarizedConversation: 0 }, estimatorVersion: "golden",
}));
// 3) 压缩之后再来一条用户消息和回复。
const after = { agentRunId: "run-golden-2", turnId: "turn-golden-2", stepId: "step-golden-2", requestId: "req-golden-2" };
journal.append(core("turn/start", { turnId: after.turnId, agentRunId: after.agentRunId, mode: "agent", modeRevision: 0 }));
journal.append(core("user/message", { messageId: "golden-after", agentRunId: after.agentRunId, turnId: after.turnId }, { surface: { kind: "append", node: { kind: "user", messageId: "golden-after", content: "压缩之后的问题" } } }));
journal.append(core("step/start", { turnId: after.turnId, stepId: after.stepId, agentRunId: after.agentRunId, stepIndex: 1 }));
journal.append(core("request/header", { ...after, routeId: "default", model: "golden" }));
journal.append(core("request/context", { requestId: after.requestId, turnId: after.turnId, stepId: after.stepId, snapshot: {} }));
journal.append(core("assistant/message", { ...after, messageId: "golden-after-reply", content: [{ type: "text", text: "压缩之后的回答" }], finishReason: "stop" }, { surface: { kind: "append", node: { kind: "assistant", messageId: "golden-after-reply", content: [{ type: "text", text: "压缩之后的回答" }] } } }));

const all = journal.readEvents();
writeFileSync(out, [JSON.stringify(header), ...all.map((event) => JSON.stringify(event))].join("\n") + "\n");
console.log(`wrote ${all.length} events, ${Buffer.byteLength(readFileSync(out))} bytes; surface entries ${journal.surface.entries.length}`);
