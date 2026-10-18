import { ComposerController } from "../use-composer";
import { fakeClient, taskSnapshot } from "../../test/helpers/fake-session";

class Conflict extends Error { kind = "CONFLICT"; }
const setup = (handler: (method: string, params: Record<string, unknown>, calls: unknown[]) => unknown, over: Record<string, unknown> = {}) => {
  const client = fakeClient(handler as never);
  const applied: unknown[] = [];
  let id = 0;
  const controller = new ComposerController({ client, sessionId: "s1", applyTasks: snapshot => applied.push(snapshot), modeRevision: () => 3, taskRevision: () => 7, randomId: () => `id-${++id}`, ...over });
  return { client, controller, applied };
};

it("submits the trimmed text and keeps the same submissionId across retries of the same text", async () => {
  let fail = true;
  const { client, controller } = setup(method => { if (method === "tasks.submit" && fail) { fail = false; throw new Error("net"); } return null; });
  await expect(controller.send(" 你好 ")).rejects.toThrow("net");
  await controller.send("你好");
  const submits = client.calls.filter(call => call.method === "tasks.submit");
  expect(submits).toHaveLength(2);
  expect(submits[0]!.params).toEqual({ sessionId: "s1", submissionId: "id-1", content: "你好" });
  expect(submits[1]!.params.submissionId).toBe("id-1");
  await controller.send("下一条");
  expect(client.calls.filter(call => call.method === "tasks.submit")[2]!.params.submissionId).toBe("id-2");
});

it("uses a new submissionId once the text changed after a failure", async () => {
  const { client, controller } = setup(method => { if (method === "tasks.submit" && client.calls.length === 1) throw new Error("net"); return null; });
  await expect(controller.send("a")).rejects.toThrow();
  await controller.send("b");
  expect(client.calls.map(call => call.params.submissionId)).toEqual(["id-1", "id-2"]);
});

it("retries a mode change once with a fresh revision after CONFLICT", async () => {
  let attempts = 0;
  const { client, controller } = setup(method => {
    if (method === "sessions.update" && ++attempts === 1) throw new Conflict("stale");
    if (method === "sessions.page") return { snapshot: { agentModeRevision: 9 } };
    return { agentMode: "plan", agentModeRevision: 10 };
  });
  await controller.setMode("plan");
  expect(client.calls.map(call => call.method)).toEqual(["sessions.update", "sessions.page", "sessions.update"]);
  expect(client.calls[0]!.params).toEqual({ sessionId: "s1", patch: { mode: "plan", expectedRevision: 3 } });
  expect(client.calls[2]!.params).toEqual({ sessionId: "s1", patch: { mode: "plan", expectedRevision: 9 } });
});

it("gives up after the second CONFLICT and does not retry other errors", async () => {
  const conflict = setup(method => { if (method === "sessions.update") throw new Conflict("stale"); return { snapshot: { agentModeRevision: 9 } }; });
  await expect(conflict.controller.setMode("chat")).rejects.toThrow("stale");
  expect(conflict.client.calls.filter(call => call.method === "sessions.update")).toHaveLength(2);
  const other = setup(() => { throw new Error("boom"); });
  await expect(other.controller.setMode("chat")).rejects.toThrow("boom");
  expect(other.client.calls).toHaveLength(1);
});

it("stops a run, cancels a queued task with the known revision and applies the returned snapshot", async () => {
  const snapshot = taskSnapshot({ revision: 8 });
  const { client, controller, applied } = setup(() => ({ snapshot }));
  await controller.stop("r1");
  await controller.cancel("t9");
  expect(client.calls[0]!.params).toEqual({ sessionId: "s1", op: "stop", runId: "r1" });
  expect(client.calls[1]!.params).toEqual({ sessionId: "s1", op: "cancel", taskId: "t9", revision: 7 });
  expect(applied).toEqual([snapshot, snapshot]);
});

it("retries cancel once with the snapshot revision after CONFLICT, and configures the model", async () => {
  let cancels = 0;
  const { client, controller } = setup((method, params) => {
    if (params.op === "cancel" && ++cancels === 1) throw new Conflict("stale");
    return { snapshot: taskSnapshot({ revision: 12 }) };
  });
  await controller.cancel("t1");
  expect(client.calls.map(call => call.params.op)).toEqual(["cancel", "snapshot", "cancel"]);
  expect(client.calls[2]!.params.revision).toBe(12);
  await controller.configure({ model: "p/m", reasoningEffort: "high" });
  expect(client.calls[3]!.params).toEqual({ sessionId: "s1", op: "configure", configuration: { model: "p/m", reasoningEffort: "high" } });
});

it("resumes explicitly with the current revision and refreshes once on conflict", async () => {
  let attempts = 0;
  const { client, controller, applied } = setup((_method, params) => {
    if (params.op === "resume" && ++attempts === 1) return { snapshot: taskSnapshot({ revision: 11, paused: true }), error: "REVISION_CONFLICT" };
    return { snapshot: taskSnapshot({ revision: 12, paused: params.op === "snapshot" }) };
  });
  await controller.resume();
  expect(client.calls.map(call => call.params.op)).toEqual(["resume", "snapshot", "resume"]);
  expect(client.calls[0]!.params.revision).toBe(7);
  expect(client.calls[2]!.params.revision).toBe(12);
  expect(applied.at(-1)).toMatchObject({ paused: false });
});

it("does not resume implicitly when submitting into a paused queue", async () => {
  const { client, controller } = setup(() => null);
  await controller.send("queued");
  expect(client.calls.map(call => call.method)).toEqual(["tasks.submit"]);
});

it("reports a resume failure without retrying a non-conflict error", async () => {
  const { client, controller } = setup(() => ({ error: "Host unavailable" }));
  await expect(controller.resume()).rejects.toThrow("Host unavailable");
  expect(client.calls).toHaveLength(1);
});

it("stops retrying resume after a second real-protocol revision conflict", async () => {
  const { client, controller } = setup((_method, params) => ({ snapshot: taskSnapshot({ revision: 12, paused: true }), ...(params.op === "resume" ? { error: "REVISION_CONFLICT" } : {}) }));
  await expect(controller.resume()).rejects.toThrow("REVISION_CONFLICT");
  expect(client.calls.filter(call => call.params.op === "resume")).toHaveLength(2);
});
