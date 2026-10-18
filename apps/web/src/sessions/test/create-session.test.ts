import { CreateSessionError, createSession } from "../create-session";

function fakeClient(fail?: string) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const client = {
    call: async (method: string, params: Record<string, unknown> = {}) => {
      calls.push({ method, params });
      if (method === fail) throw new Error("boom");
      return method === "sessions.create" ? { sessionId: "s1", agentModeRevision: 3 } : null;
    },
  };
  return { client: client as never, calls };
}

it("creates, switches to plan, configures the model and submits in order", async () => {
  const { client, calls } = fakeClient();
  const steps: string[] = [];
  const id = await createSession(client, { workspaceId: "w", mode: "plan", content: "hi", model: "p/m", onStep: s => steps.push(s), submissionId: "sub" });
  expect(id).toBe("s1");
  expect(calls.map(c => c.method)).toEqual(["sessions.create", "sessions.update", "tasks.command", "tasks.submit"]);
  expect(calls[0]!.params).toEqual({ workspaceId: "w", agentForm: "agent" });
  expect(calls[1]!.params).toEqual({ sessionId: "s1", patch: { mode: "plan", expectedRevision: 3 } });
  expect(calls[2]!.params).toEqual({ sessionId: "s1", op: "configure", configuration: { model: "p/m" } });
  expect(calls[3]!.params).toEqual({ sessionId: "s1", submissionId: "sub", content: "hi" });
  expect(steps).toEqual(["create", "mode", "configure", "submit"]);
});

it("skips update and configure for the default agent mode and model", async () => {
  const { client, calls } = fakeClient();
  await createSession(client, { workspaceId: "w", mode: "agent", content: "hi" });
  expect(calls.map(c => c.method)).toEqual(["sessions.create", "tasks.submit"]);
});

it("creates chat sessions with agentForm chat and no mode update", async () => {
  const { client, calls } = fakeClient();
  await createSession(client, { workspaceId: "w", mode: "chat", content: "hi" });
  expect(calls[0]!.params.agentForm).toBe("chat");
  expect(calls.some(c => c.method === "sessions.update")).toBe(false);
});

it("names the failing step", async () => {
  const { client } = fakeClient("tasks.submit");
  const error = await createSession(client, { workspaceId: "w", mode: "agent", content: "hi" }).catch(reason => reason);
  expect(error).toBeInstanceOf(CreateSessionError);
  expect(error.step).toBe("submit");
  expect(error.message).toContain("发送消息失败");
});
