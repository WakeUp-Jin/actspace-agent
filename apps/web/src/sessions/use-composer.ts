import { isRecord } from "@actspace/shared/host-protocol";
import type { TaskConfiguration, TaskSnapshot } from "@actspace/shared/runtime-v2";
import { useCallback, useMemo, useRef, useState } from "react";
import { useConnection, useConnectionStore } from "../connection/use-connection";
import { effortOptionsFor } from "./model-options";
import type { SessionObservation } from "./use-session-observation";

export type ComposerClient = { call(method: string, params?: Record<string, unknown>): Promise<unknown> };
export type AgentMode = "agent" | "plan" | "chat";
export type ComposerDeps = {
  readonly client: ComposerClient;
  readonly sessionId: string;
  readonly applyTasks: (snapshot: TaskSnapshot) => void;
  readonly modeRevision: () => number | null;
  readonly taskRevision: () => number | null;
  readonly randomId?: () => string;
  /** 未确认的提交；跨 controller（重连换 client）保留，才能沿用同一个 submissionId。 */
  readonly pending?: { current: { text: string; id: string } | null };
};

const isConflict = (error: unknown) => isRecord(error) && error.kind === "CONFLICT";
type CommandResult = { snapshot: TaskSnapshot; error?: string };

/** 输入框要发的所有 RPC（非 React，便于测试）。失败一律抛出，由调用方显示原因。 */
export class ComposerController {
  readonly #box: { current: { text: string; id: string } | null };
  constructor(private readonly deps: ComposerDeps) { this.#box = deps.pending ?? { current: null }; }

  /** 同一段文字重试沿用同一个 submissionId（Host 按它去重）；文字变了才换新的。 */
  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content) return;
    const id = this.#box.current?.text === content ? this.#box.current.id : (this.#box.current = { text: content, id: (this.deps.randomId ?? (() => crypto.randomUUID()))() }).id;
    await this.deps.client.call("tasks.submit", { sessionId: this.deps.sessionId, submissionId: id, content });
    this.#box.current = null;
  }

  async #command(params: Record<string, unknown>): Promise<CommandResult> {
    const result = await this.deps.client.call("tasks.command", { sessionId: this.deps.sessionId, ...params }) as CommandResult;
    if (result?.snapshot) this.deps.applyTasks(result.snapshot);
    return result;
  }

  async stop(runId: string): Promise<void> {
    const result = await this.#command({ op: "stop", runId });
    if (result.error) throw new Error(result.error);
  }

  /** 撤回排队消息；revision 过期（CONFLICT）时取最新快照重试一次。 */
  async cancel(taskId: string): Promise<void> {
    const attempt = async (revision: number) => {
      const result = await this.#command({ op: "cancel", taskId, revision });
      if (result.error) throw new Error(result.error);
    };
    const known = this.deps.taskRevision();
    try { await attempt(known ?? (await this.#command({ op: "snapshot" })).snapshot.revision); }
    catch (error) {
      if (!isConflict(error)) throw error;
      await attempt((await this.#command({ op: "snapshot" })).snapshot.revision);
    }
  }

  /** 切换模式；CONFLICT 时重新取 revision 再试一次，仍失败就抛出。 */
  async setMode(mode: AgentMode): Promise<void> {
    const update = (revision: number) => this.deps.client.call("sessions.update", { sessionId: this.deps.sessionId, patch: { mode, expectedRevision: revision } });
    const fresh = async () => {
      const page = await this.deps.client.call("sessions.page", { sessionId: this.deps.sessionId }) as { snapshot?: { agentModeRevision?: number } };
      return page.snapshot?.agentModeRevision ?? 0;
    };
    try { await update(this.deps.modeRevision() ?? await fresh()); }
    catch (error) {
      if (!isConflict(error)) throw error;
      await update(await fresh());
    }
  }

  async configure(configuration: TaskConfiguration): Promise<void> {
    const result = await this.#command({ op: "configure", configuration });
    if (result.error) throw new Error(result.error);
  }
}

const draftKey = (sessionId: string) => `actspace.web.draft.${sessionId}`;
const prefsKey = (sessionId: string) => `actspace.web.model.${sessionId}`;
function readStorage(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string | null): void { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* 草稿丢了不影响使用 */ } }
const reason = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export type ComposerModelPrefs = { readonly model: string | null; readonly effort: string | null };
function readPrefs(sessionId: string): ComposerModelPrefs {
  try { const value = JSON.parse(readStorage(prefsKey(sessionId)) ?? "null"); if (isRecord(value)) return { model: typeof value.model === "string" ? value.model : null, effort: typeof value.effort === "string" ? value.effort : null }; } catch { /* 忽略 */ }
  return { model: null, effort: null };
}

export function useComposer(sessionId: string, observation: SessionObservation) {
  const { connection, maintenance } = useConnection();
  const store = useConnectionStore();
  const [draft, setDraftState] = useState(() => readStorage(draftKey(sessionId)) ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(() => readPrefs(sessionId));
  const latest = useRef(observation);
  latest.current = observation;
  const client = connection?.client ?? null;
  const pending = useRef<{ text: string; id: string } | null>(null);

  const controller = useMemo(() => client ? new ComposerController({
    client, sessionId, pending, applyTasks: snapshot => latest.current.applyTasks(snapshot),
    modeRevision: () => latest.current.agentModeRevision, taskRevision: () => latest.current.tasks?.revision ?? null,
  }) : null, [client, sessionId]);
  const setDraft = useCallback((value: string) => { setDraftState(value); writeStorage(draftKey(sessionId), value); }, [sessionId]);

  const guard = useCallback(async (fallback: string, run: (controller: ComposerController) => Promise<void>): Promise<boolean> => {
    if (!controller) { setError("已断开，正在重连…"); return false; }
    try { await run(controller); setError(null); return true; }
    catch (failure) { store.reportError(failure); setError(reason(failure, fallback)); return false; }
  }, [controller, store]);

  const send = useCallback(async (): Promise<boolean> => {
    const text = draft.trim();
    if (!text || sending) return false;
    setSending(true);
    const ok = await guard("发送失败，请重试", c => c.send(text));
    setSending(false);
    if (ok) setDraft("");
    return ok;
  }, [draft, sending, guard, setDraft]);

  const stop = useCallback(async () => {
    const runId = latest.current.runId;
    if (runId) await guard("停止失败", c => c.stop(runId));
  }, [guard]);
  const cancelQueued = useCallback((taskId: string) => guard("撤回失败", c => c.cancel(taskId)), [guard]);
  const setMode = useCallback((mode: AgentMode) => guard("切换模式失败，请重试", c => c.setMode(mode)), [guard]);

  const model = prefs.model ?? observation.runModel ?? connection?.description.defaultModel ?? "";
  const effortOptions = useMemo(() => effortOptionsFor(model), [model]);
  const effort = effortOptions.length ? (prefs.effort && effortOptions.includes(prefs.effort as never) ? prefs.effort : observation.runEffort && effortOptions.includes(observation.runEffort as never) ? observation.runEffort : null) : null;
  const configure = useCallback(async (next: { model: string; effort: string | null }): Promise<boolean> => {
    const efforts = effortOptionsFor(next.model);
    const reasoningEffort = next.effort && efforts.includes(next.effort as never) ? next.effort : null;
    const ok = await guard("切换模型失败，请重试", c => c.configure({ model: next.model, ...(reasoningEffort ? { reasoningEffort: reasoningEffort as never } : {}) }));
    if (ok) { const value = { model: next.model, effort: reasoningEffort }; setPrefs(value); writeStorage(prefsKey(sessionId), JSON.stringify(value)); }
    return ok;
  }, [guard, sessionId]);

  return { draft, setDraft, send, sending, stop, cancelQueued, setMode, configure, model, effort, effortOptions, error, clearError: () => setError(null), connected: connection !== null, maintenance };
}
