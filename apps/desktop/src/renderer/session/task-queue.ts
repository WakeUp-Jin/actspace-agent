import { taskOperation, type SubmitTaskInput, type TaskContentEnvelope, type TaskSnapshot } from "@actspace/shared/runtime-v2";
import type { ComposerSendOptions } from "../components/Composer";
import type { SessionLocalState } from "./session-local-store";
import { projectTaskQueue, taskAttachments, type QueuedComposerMessage } from "./message-queue";
import { createEmptyStreamingState } from "./session-run-state";
import type { LiveRunStore } from "./live-runs/live-run-store";
import { createCompactionBlock } from "./live-runs/stream-blocks";
import { upsertCompactionSegment } from "./live-runs/stream-state";

// Host 任务队列在 renderer 的缓存（14 S6，从 App 的 taskSnapshotsRef / submittedOptionsRef / steerContentRef 迁入）。
// 每项都记下所属会话，归档 / 移除会话时整体释放。

export interface TaskQueueStore {
  snapshot(sessionId: string): TaskSnapshot | undefined;
  /** 提交时带上的附件预览等本地选项；任务结算后释放。 */
  rememberOptions(sessionId: string, submissionId: string, options: ComposerSendOptions): void;
  options(submissionId: string): ComposerSendOptions | undefined;
  forgetOptions(submissionId: string): void;
  /** 插入的正文：loop 读到后用它在当前回合里显示用户消息。 */
  rememberSteer(sessionId: string, messageId: string, item: QueuedComposerMessage): void;
  takeSteer(messageId: string): QueuedComposerMessage | undefined;
  evict(sessionId: string): void;
  /** 供 applyTaskSnapshot 写入；较旧的修订返回 null，不写入。 */
  accept(snapshot: TaskSnapshot): { previous: TaskSnapshot | undefined } | null;
}

export function createTaskQueueStore(): TaskQueueStore {
  const snapshots = new Map<string, TaskSnapshot>();
  const submitted = new Map<string, { sessionId: string; options: ComposerSendOptions }>();
  const steers = new Map<string, { sessionId: string; item: QueuedComposerMessage }>();
  return {
    snapshot: (sessionId) => snapshots.get(sessionId),
    rememberOptions(sessionId, submissionId, options) { submitted.set(submissionId, { sessionId, options }); },
    options: (submissionId) => submitted.get(submissionId)?.options,
    forgetOptions(submissionId) { submitted.delete(submissionId); },
    rememberSteer(sessionId, messageId, item) { steers.set(messageId, { sessionId, item }); },
    takeSteer(messageId) {
      const entry = steers.get(messageId);
      steers.delete(messageId);
      return entry?.item;
    },
    evict(sessionId) {
      snapshots.delete(sessionId);
      for (const [id, entry] of submitted) if (entry.sessionId === sessionId) submitted.delete(id);
      for (const [id, entry] of steers) if (entry.sessionId === sessionId) steers.delete(id);
    },
    accept(snapshot) {
      const previous = snapshots.get(snapshot.sessionId);
      if ((previous?.revision ?? -2) > snapshot.revision) return null;
      snapshots.set(snapshot.sessionId, snapshot);
      return { previous };
    },
  };
}

export type TaskSnapshotEffects = {
  readonly tasks: TaskQueueStore;
  readonly runs: LiveRunStore;
  readonly patchLocal: (sessionId: string, patch: Partial<SessionLocalState>) => void;
  readonly notice: (sessionId: string, text: string) => void;
  /** 有任务结算时重读 durable 页。 */
  readonly refreshSession: (sessionId: string) => void;
};

/** 应用 Host 的任务快照：更新队列、结算本地选项，并按运行中的 run / 压缩任务挂上或卸下 live run。 */
export function applyTaskSnapshot(snapshot: TaskSnapshot, { tasks, runs, patchLocal, notice, refreshSession }: TaskSnapshotEffects): void {
  const accepted = tasks.accept(snapshot);
  if (!accepted) return;
  const { previous } = accepted;
  for (const run of snapshot.runs) if (run.state !== "running") runs.markTerminal(run.runId);
  const settled = snapshot.tasks.filter(task => !["pending", "claimed"].includes(task.state) && previous?.tasks.find(item => item.taskId === task.taskId)?.state !== task.state);
  for (const task of settled) tasks.forgetOptions(task.submissionId);
  if (settled.length) refreshSession(snapshot.sessionId);
  const queue = projectTaskQueue(snapshot);
  patchLocal(snapshot.sessionId, { messageQueue: queue });
  const running = snapshot.runs.find(run => run.state === "running" && !runs.isTerminal(run.runId));
  const existing = runs.get(snapshot.sessionId);
  const operation = snapshot.tasks.find(task => task.state === "claimed" && task.runId === null && taskOperation(task.content));
  // Initial hydration must not replay notices from historical operations.
  for (const task of settled.filter(task => previous && taskOperation(task.content))) {
    const result = task.result && typeof task.result === "object" && !Array.isArray(task.result) ? task.result as Record<string, unknown> : {};
    if (task.state === "failed") {
      const block = createCompactionBlock({ agentRunId: task.taskId, status: "failed", errorMessage: typeof result.error === "string" ? result.error : "压缩失败，可以重试。" });
      patchLocal(snapshot.sessionId, { compactionFailure: block });
    } else if (task.state === "completed" && result.compacted === false) {
      notice(snapshot.sessionId, "对话还很短，暂时不需要压缩");
    }
  }
  if (existing?.operationTaskId && !operation) runs.end(snapshot.sessionId);
  if (operation && !runs.has(snapshot.sessionId)) {
    const state = createEmptyStreamingState();
    upsertCompactionSegment(state, operation.taskId);
    state.activeCompactions.set(operation.taskId, createCompactionBlock({ agentRunId: operation.taskId, status: "running", startedAt: new Date().toISOString() }));
    runs.start({ sessionId: snapshot.sessionId, agentRunId: operation.taskId, operationTaskId: operation.taskId, recovered: true,
      state, userBlock: null, aborting: false });
  }
  if (!running && existing?.recovered && !existing.operationTaskId && snapshot.runs.some(run => run.runId === existing.agentRunId && run.state !== "running")) {
    runs.end(snapshot.sessionId);
  }
  if (running && !runs.has(snapshot.sessionId)) {
    const state = createEmptyStreamingState();
    state.waitingForModel = true;
    runs.start({
      sessionId: snapshot.sessionId, agentRunId: running.runId, recovered: true,
      state, userBlock: null, aborting: false,
    });
  }
  const currentRun = runs.get(snapshot.sessionId);
  const initial = running && snapshot.tasks.find(task => task.taskId === running.taskId);
  if (currentRun && initial && !currentRun.userBlock) {
    const content = initial.content as TaskContentEnvelope;
    const original = content?.kind === "composer-task" ? content.original as unknown as SubmitTaskInput : null;
    const submittedOptions = tasks.options(initial.submissionId);
    currentRun.userBlock = { kind: "user", id: `turn:${currentRun.agentRunId}:user:0`, runId: currentRun.agentRunId, content: original?.userInput ?? (typeof initial.content === "string" ? initial.content : ""), createdAt: new Date().toISOString(),
      attachments: submittedOptions?.attachments ?? taskAttachments(snapshot.sessionId, content), fileReferences: original?.fileReferences, responseAnnotations: original?.responseAnnotations };
    runs.refresh(snapshot.sessionId);
  }
}
