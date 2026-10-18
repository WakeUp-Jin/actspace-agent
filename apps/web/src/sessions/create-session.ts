import type { HostClient } from "@actspace/client/host";

// 新建会话流程（front-web-pwa客户端规范 §9.2）：create → 模式 → 模型 → submit。
export type NewSessionMode = "agent" | "plan" | "chat";
export type CreateStep = "create" | "mode" | "configure" | "submit";
export type CreateInput = {
  readonly workspaceId: string;
  readonly mode: NewSessionMode;
  readonly content: string;
  /** 只有用户换了模型时才传，默认模型沿用 Host 的设置。 */
  readonly model?: string;
  readonly onStep?: (step: CreateStep) => void;
  readonly submissionId?: string;
};

/** 带步骤名的错误；cause 保留原始错误，供 reportError 判断 HostError。 */
export class CreateSessionError extends Error {
  constructor(readonly step: CreateStep, readonly cause: unknown) {
    super(`${STEP_LABELS[step]}失败：${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "CreateSessionError";
  }
}

const STEP_LABELS: Record<CreateStep, string> = { create: "创建会话", mode: "切换模式", configure: "设置模型", submit: "发送消息" };
export const STEP_PROGRESS: Record<CreateStep, (host: string) => string> = {
  create: host => `在 ${host} 上创建会话…`,
  mode: () => "切换模式…",
  configure: () => "设置模型…",
  submit: () => "启动 Agent…",
};

async function run<T>(step: CreateStep, onStep: CreateInput["onStep"], action: () => Promise<T>): Promise<T> {
  onStep?.(step);
  try { return await action(); } catch (error) { throw new CreateSessionError(step, error); }
}

/** 成功返回 sessionId。`sessions.create` 的返回值是会话快照，其 agentModeRevision 就是 expectedRevision（缺省 0）。 */
export async function createSession(client: Pick<HostClient, "call">, input: CreateInput): Promise<string> {
  const created = await run("create", input.onStep, () => client.call("sessions.create", { workspaceId: input.workspaceId, agentForm: input.mode === "chat" ? "chat" : "agent" })) as { sessionId: string; agentModeRevision?: number };
  const sessionId = created.sessionId;
  if (input.mode === "plan") {
    await run("mode", input.onStep, () => client.call("sessions.update", { sessionId, patch: { mode: "plan", expectedRevision: created.agentModeRevision ?? 0 } }));
  }
  if (input.model) {
    await run("configure", input.onStep, () => client.call("tasks.command", { sessionId, op: "configure", configuration: { model: input.model } }));
  }
  await run("submit", input.onStep, () => client.call("tasks.submit", { sessionId, submissionId: input.submissionId ?? crypto.randomUUID(), content: input.content }));
  return sessionId;
}

const LAST_WORKSPACE_KEY = "actspace.web.lastWorkspace";
export function readLastWorkspace(): string | null {
  try { return localStorage.getItem(LAST_WORKSPACE_KEY); } catch { return null; }
}
export function writeLastWorkspace(id: string): void {
  try { localStorage.setItem(LAST_WORKSPACE_KEY, id); } catch { /* 只在本次页面内有效 */ }
}
