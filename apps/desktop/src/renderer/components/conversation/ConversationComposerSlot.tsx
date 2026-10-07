import type { ComponentProps } from "react";
import { useActiveSession } from "../../session/active-session-context";
import { useRunTargetContext } from "../../target/run-target-context";
import { Composer } from "../Composer";
import { useComposerContext } from "../composer/composer-context";

type ComposerProps = ComponentProps<typeof Composer>;

type ConversationComposerSlotProps = Pick<
  ComposerProps,
  | "surface"
  | "contextSnapshot"
  | "contextState"
  | "inputHistory"
  | "focusRequestId"
  | "onOpenAttachmentPreview"
  | "onExpandContext"
  | "reviewSummary"
  | "onOpenReview"
  | "permissionControl"
  | "responseAnnotations"
  | "onResponseAnnotationsChange"
  | "responseAnnotationNotice"
  | "onConnectHost"
>;

/**
 * 会话页里的 Composer：会话、草稿、模型和运行目标从 Context 读，
 * 其余（上下文用量、批注、聚焦请求等会话页自己算的）由 ConversationView 传入。
 */
export function ConversationComposerSlot(props: ConversationComposerSlotProps) {
  const { sessionId, isStreaming, isAborting, isCompacting, onSend, onAbort } = useActiveSession();
  const {
    messageQueue, composerNotice, defaultModelId, selectedModelId, onSelectedModelChange, composerMode, onComposerModeChange,
    selectedSkills, onSelectedSkillsChange, models, draftRestore, draftKey, readDraft, writeDraft, readAttachmentDraft, writeAttachmentDraft,
  } = useComposerContext();
  const { workspaceOptions, selectedWorkspaceRoot, onSelectWorkspace, execution: executionContext } = useRunTargetContext();
  return (
    <Composer
      {...props}
      isStreaming={isStreaming}
      isAborting={isAborting}
      isCompacting={isCompacting}
      messageQueue={messageQueue}
      statusNotice={composerNotice}
      onSend={onSend}
      onAbort={onAbort}
      defaultModelId={defaultModelId}
      selectedModelId={selectedModelId}
      onSelectedModelChange={onSelectedModelChange}
      mode={composerMode}
      onModeChange={onComposerModeChange}
      selectedSkills={selectedSkills}
      onSelectedSkillsChange={onSelectedSkillsChange}
      workspaceOptions={workspaceOptions}
      selectedWorkspaceRoot={selectedWorkspaceRoot}
      onSelectWorkspace={onSelectWorkspace}
      executionContext={executionContext}
      draftRestore={draftRestore}
      draftKey={draftKey}
      readDraft={readDraft}
      writeDraft={writeDraft}
      readAttachmentDraft={readAttachmentDraft}
      writeAttachmentDraft={writeAttachmentDraft}
      models={models}
      sessionId={sessionId}
    />
  );
}
