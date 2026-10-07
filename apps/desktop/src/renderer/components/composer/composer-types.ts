import type { ReactNode } from "react";
import type {
  ChatAttachmentIssue,
  ComposerAttachment,
  ComposerMode,
  ComposerReferenceIssue,
  ContextState,
  ContextUsageSnapshot,
  FileReference,
  ModelReasoningEffort,
  ModelSelectionId,
  ResponseAnnotationReference,
  SessionRunLocation,
  UsableModelView,
  WorkspaceGitContext,
} from "@actspace/shared";
import type { MessageQueueControls } from "./MessageQueueTray";
import type { ReviewStripSummary } from "./ReviewStrip";

// 09 T30：Composer 对外的类型。Composer.tsx 原样 re-export，调用方和测试仍从 "components/Composer" 导入。

export type ComposerSendOptions = {
  model: ModelSelectionId;
  mode: ComposerMode;
  selectedSkills: string[];
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
  attachments?: ComposerAttachment[];
  fileReferences?: FileReference[];
  responseAnnotations?: ResponseAnnotationReference[];
};

export type ComposerWorkspaceOption = {
  value: string;
  label: string;
  workspaceId?: string;
};

/** 本机的 Git 状态、分支和运行位置。运行目标本身（本机 / 远端、能力、是否锁定）从 RunTargetContext 读（15 T6）。 */
export type ComposerExecutionContext = {
  gitContext: WorkspaceGitContext | null;
  selectedBranch?: string;
  runLocation: SessionRunLocation;
  onSelectBranch?: (branch: string) => void;
  onSelectRunLocation?: (location: SessionRunLocation) => void;
  onUseExistingWorkspace?: () => void;
  onCreateWorkspaceFolder?: (name: string) => void;
};

export type ComposerDraftRestore = {
  id: number;
  sessionId: string;
  text: string;
  attachments?: ComposerAttachment[];
  fileReferences?: FileReference[];
  responseAnnotations?: ResponseAnnotationReference[];
  error?: string;
  attachmentIssue?: ChatAttachmentIssue;
  referenceIssue?: ComposerReferenceIssue;
};

export type ComposerDraftReader = (draftKey: string) => string;
export type ComposerDraftWriter = (draftKey: string, text: string) => void;
export type ComposerAttachmentDraftReader = (draftKey: string) => ComposerAttachment[];
export type ComposerAttachmentDraftWriter = (draftKey: string, attachments: ComposerAttachment[]) => void;
export type ComposerReviewSummary = ReviewStripSummary;

export type ComposerSurface = "followup" | "initial";

export type ComposerProps = {
  contextSnapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  sessionId?: string | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  /** 上下文压缩进行中：压缩不可中止，停止按钮置灰。 */
  isCompacting?: boolean;
  /** 提供时运行中仍可输入：发送进入队列，托盘显示在输入框上方。 */
  messageQueue?: MessageQueueControls;
  /** 输入框上方的一次性状态提示（由上层负责定时清除）。 */
  statusNotice?: string | null;
  onSend?: (text: string, options: ComposerSendOptions) => void | Promise<void>;
  onAbort?: () => void;
  /** 运行位置菜单的「连接远端机器…」「连接新机器…」：打开 设置 › 远端 Host。 */
  onConnectHost?: () => void;
  surface?: ComposerSurface;
  /** 来自设置页的默认模型；首次到达时同步选中，用户手动选过后不再覆盖。 */
  defaultModelId?: ModelSelectionId;
  /** 会话级当前模型；提供时由上层持有，避免 initial/followup Composer 切换时丢选择。 */
  selectedModelId?: ModelSelectionId;
  onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  mode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void | Promise<void>;
  selectedSkills?: string[];
  onSelectedSkillsChange?: (skills: string[]) => void;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
  /** 提供时 Context 弹窗显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpandContext?: () => void;
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  executionContext?: ComposerExecutionContext;
  draftRestore?: ComposerDraftRestore | null;
  draftKey?: string;
  readDraft?: ComposerDraftReader;
  writeDraft?: ComposerDraftWriter;
  /** 附件草稿按 draftKey 读写；缺省时附件只存在组件里，切换 draftKey 也不换。 */
  readAttachmentDraft?: ComposerAttachmentDraftReader;
  writeAttachmentDraft?: ComposerAttachmentDraftWriter;
  inputHistory?: string[];
  focusRequestId?: number;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
  models?: UsableModelView[];
  permissionControl?: ReactNode;
  /** 当前会话的草稿回复批注；由上层按会话持有，发送后通过 onResponseAnnotationsChange 清空。 */
  responseAnnotations?: readonly ResponseAnnotationReference[];
  onResponseAnnotationsChange?: (next: ResponseAnnotationReference[]) => void;
  responseAnnotationNotice?: string | null;
};
