import { formatChatAttachmentIssue, formatComposerReferenceIssue } from "@actspace/shared";
import type { ComposerAttachment, MainAgentForm } from "@actspace/shared";
import type { SubmitTaskInput, TaskConfiguration, TaskSubmissionFailure, TaskSubmissionResult } from "@actspace/shared/runtime-v2";
import type { ComposerDraftRestore, ComposerSendOptions } from "../components/Composer";
import type { NewSessionInput } from "./session-actions-context";
import type { RunTargetReadiness } from "../target/readiness";
import type { RunTarget } from "../target/run-target";
import type { PendingSubmissionRecord } from "./pending-submission";

/** 发送时的运行目标：新建页决定新会话建在哪里，已有会话只用来判断能否发送。 */
export type SendTarget = {
  readonly target: RunTarget;
  readonly readiness: RunTargetReadiness;
  /** 远端：新建页选的工作区和模型。 */
  readonly remoteWorkspaceId?: string;
  readonly remoteModelId?: string;
  /** 本机：新建页选的工作区。 */
  readonly localWorkspaceRoot?: string | null;
};

export type SessionGatewayDeps = {
  createSession(input: NewSessionInput): Promise<{ readonly meta: { readonly id: string; readonly agentModeRevision?: number } } | null>;
  setPlanMode(sessionId: string, expectedRevision: number): Promise<unknown>;
  /** 远端会话创建后记下工作区和模型（Host 不返回 workspaceId，03-1；15 T8）。 */
  recordRemoteSession(sessionId: string, prefs: { readonly workspaceId?: string; readonly modelId?: string }): void;
  configure(sessionId: string, configuration: TaskConfiguration): Promise<boolean>;
  submit(input: SubmitTaskInput): Promise<TaskSubmissionResult>;
  pending: {
    read(sessionId: string): PendingSubmissionRecord | null;
    write(sessionId: string, record: Omit<PendingSubmissionRecord, "createdAt">): void;
    clear(sessionId: string): void;
  };
  rememberOptions(sessionId: string, submissionId: string, options: ComposerSendOptions): void;
  forgetOptions(submissionId: string): void;
  /** 第一次提交结果未知、正在用同一标识核对。 */
  notice(sessionId: string, text: string): void;
  /** 提交失败时把正文放回输入框。 */
  restoreDraft(sessionId: string, draft: ComposerDraftRestore): void;
  newSubmissionId(): string;
  now(): number;
};

export type SessionGateway = {
  /** 已有会话直接返回；新建页按运行目标建会话（远端还要 ready）。 */
  ensureSession(sessionId: string | null, send: SendTarget, options: ComposerSendOptions): Promise<string>;
  /** 写 pending 记录 → configure → submit（结果未知时用同一标识再核对一次）。失败时放回草稿并抛错。 */
  submit(sessionId: string, text: string, options: ComposerSendOptions, model: string | undefined): Promise<TaskSubmissionResult>;
};

const NOT_READY = "Host is not ready; your draft has been preserved";
const CONFIGURE_FAILED = "无法更新任务配置，草稿已保留。";
const UNKNOWN = "提交尚未确认，再次发送将核对同一次提交。";

function withoutPreview({ previewUrl: _previewUrl, ...attachment }: ComposerAttachment): ComposerAttachment {
  return attachment;
}

const agentForm = (options: ComposerSendOptions): MainAgentForm => options.mode === "chat" ? "chat" : "agent";

/**
 * 15 T12：App `handleSend` 中「选目标、提交、pending 记录」的部分（03 §2.6）。pending 规则沿用 14 T20：
 * 提交前写入；确认收到或明确被拒绝后清除；结果未知时保留，下次激活会话时恢复为草稿。
 */
export function createSessionGateway(deps: SessionGatewayDeps): SessionGateway {
  const failed = (result: TaskSubmissionResult): result is TaskSubmissionFailure => "status" in result && result.status === "submission-failed";
  return {
    async ensureSession(sessionId, send, options) {
      const { target } = send;
      if (target.kind === "remote" && send.readiness.state !== "ready") throw new Error(NOT_READY);
      if (sessionId) return sessionId;
      const remote = target.kind === "remote";
      const created = await deps.createSession(remote
        ? { hostId: target.hostId, ...(send.remoteWorkspaceId ? { workspaceId: send.remoteWorkspaceId } : {}), agentForm: agentForm(options) }
        : { ...(send.localWorkspaceRoot ? { workspaceRoot: send.localWorkspaceRoot } : {}), agentForm: agentForm(options) });
      if (!created) throw new Error(remote ? "Unable to create remote Session" : "Unable to create Session");
      if (remote) {
        deps.recordRemoteSession(created.meta.id, {
          ...(send.remoteWorkspaceId ? { workspaceId: send.remoteWorkspaceId } : {}),
          ...(send.remoteModelId ? { modelId: send.remoteModelId } : {}),
        });
      }
      if (options.mode === "plan") await deps.setPlanMode(created.meta.id, created.meta.agentModeRevision ?? 0);
      return created.meta.id;
    },

    async submit(sessionId, text, options, model) {
      const submitted = { sessionId, userInput: text, attachments: options.attachments?.map(withoutPreview), fileReferences: options.fileReferences, responseAnnotations: options.responseAnnotations };
      const serialized = JSON.stringify(submitted);
      const saved = deps.pending.read(sessionId);
      // 同样的内容再次发送时复用 submissionId，让 Runtime 去重。
      const submissionId = saved?.content === serialized ? saved.id : deps.newSubmissionId();
      deps.rememberOptions(sessionId, submissionId, options);
      deps.pending.write(sessionId, { content: serialized, id: submissionId, draft: { sessionId, text, attachments: options.attachments?.map(withoutPreview), fileReferences: options.fileReferences, responseAnnotations: options.responseAnnotations } });
      const restore = (error: string, issues?: Pick<TaskSubmissionFailure, "attachmentIssue" | "referenceIssue">) => {
        deps.restoreDraft(sessionId, { id: deps.now(), sessionId, text, attachments: options.attachments, fileReferences: options.fileReferences, responseAnnotations: options.responseAnnotations, error, ...issues });
      };
      try {
        const configured = await deps.configure(sessionId, { model, thinkingEnabled: options.thinkingEnabled, reasoningEffort: options.reasoningEffort, selectedSkillIds: options.selectedSkills });
        if (!configured) throw new Error(CONFIGURE_FAILED);
      } catch (error) {
        deps.pending.clear(sessionId);
        deps.forgetOptions(submissionId);
        const message = error instanceof Error ? error.message : CONFIGURE_FAILED;
        restore(message);
        throw new Error(message);
      }
      const attempt = async (): Promise<TaskSubmissionResult> => {
        try { return await deps.submit({ ...submitted, submissionId }); }
        catch { return { status: "submission-failed", acknowledgement: "unknown", message: UNKNOWN }; }
      };
      let result = await attempt();
      if (failed(result) && result.acknowledgement === "unknown") {
        deps.notice(sessionId, "提交结果尚未确认，正在用同一标识核对。");
        result = await attempt();
      }
      if (failed(result)) {
        if (result.acknowledgement === "rejected") {
          deps.pending.clear(sessionId);
          deps.forgetOptions(submissionId);
        }
        const message = result.acknowledgement === "unknown" ? UNKNOWN : result.message;
        const issues = { ...(result.attachmentIssue ? { attachmentIssue: result.attachmentIssue } : {}), ...(result.referenceIssue ? { referenceIssue: result.referenceIssue } : {}) };
        restore(result.attachmentIssue ? formatChatAttachmentIssue(result.attachmentIssue) : result.referenceIssue ? formatComposerReferenceIssue(result.referenceIssue) : message, issues);
        throw new Error(message);
      }
      deps.pending.clear(sessionId);
      return result;
    },
  };
}
