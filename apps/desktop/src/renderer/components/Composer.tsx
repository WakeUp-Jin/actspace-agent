import { useEffect, useRef } from "react";
import type { ComposerMode, ResponseAnnotationReference } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";
import { ComposerPalette } from "./composer/ComposerPalette";
import { MessageQueueTray } from "./composer/MessageQueueTray";
import { RunTargetRow } from "./composer/RunTargetRow";
import { useComposerOverlay } from "./composer/use-composer-overlay";
import { useComposerDraft } from "./composer/use-composer-draft";
import { ComposerStatusRow } from "./composer/ComposerStatusRow";
import { ComposerAttachments, useComposerAttachments } from "./composer/ComposerAttachments";
import { ComposerInput, composerPlaceholder, useComposerLayout, type ComposerLayout } from "./composer/ComposerInput";
import { useComposerKeyboard } from "./composer/use-composer-keyboard";
import { SLASH_MENU_ID, SlashMenu, runSlashFunction, useSlashMenu, type ComposerSlashResult } from "./composer/SlashMenu";
import { useComposerSkills } from "./composer/use-composer-skills";
import { ComposerToolbar } from "./composer/ComposerToolbar";
import { ReviewStrip } from "./composer/ReviewStrip";
import { useComposerModel } from "./composer/use-composer-model";
import { composerSendOptions, useComposerSend } from "./composer/use-composer-send";
import { ComposerNotices, ComposerSendErrorAlert } from "./composer/ComposerNotices";
import type { ComposerProps, ComposerSendOptions, ComposerSurface } from "./composer/composer-types";
import { composerGitFacts, composerLocalRunTarget, useComposerContextSnapshot } from "./composer/composer-run-context";
import { useRunTargetContext } from "../target/run-target-context";
import { describeReadiness, hostReachable } from "../target/readiness";
import { revokeAttachmentPreviews } from "./composer/attachment-preview";

export type {
  ComposerAttachmentDraftReader,
  ComposerAttachmentDraftWriter,
  ComposerDraftReader,
  ComposerDraftRestore,
  ComposerDraftWriter,
  ComposerExecutionContext,
  ComposerProps,
  ComposerReviewSummary,
  ComposerSendOptions,
  ComposerSurface,
  ComposerWorkspaceOption,
} from "./composer/composer-types";

const COMPOSER_WRAP_CLASS =
  "composer-wrap relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] gap-2 max-[600px]:w-[calc(100%_-_36px)]";
const COMPOSER_INITIAL_WRAP_CLASS =
  "composer-wrap composer-wrap-initial relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),706px)] gap-2 max-[600px]:w-[calc(100%_-_36px)]";
// 低对比细边加柔和阴影，聚焦时两者都加深（09，06 §5.1）。单行时胶囊形，多行时 18px 圆角。
const COMPOSER_PANEL_BASE_CLASS =
  "composer-panel relative grid overflow-visible border shadow-act-composer transition-[box-shadow,border-color,background-color] duration-(--motion-fast) focus-within:shadow-act-composer-focus";
const COMPOSER_PANEL_SHAPE_CLASS: Record<"inline" | "stacked", string> = {
  inline: "rounded-act-pill",
  stacked: "rounded-act-xl",
};
const COMPOSER_PANEL_IDLE_CLASS = "border-composer bg-surface focus-within:border-composer-focus";
const EMPTY_RESPONSE_ANNOTATIONS: readonly ResponseAnnotationReference[] = [];
const COMPOSER_PANEL_DROP_ACTIVE_CLASS = "border-line-strong bg-selected";

function getComposerWrapClass(surface: ComposerSurface) {
  return surface === "initial" ? COMPOSER_INITIAL_WRAP_CLASS : COMPOSER_WRAP_CLASS;
}

function getComposerPanelClass(surface: ComposerSurface, layout: ComposerLayout, dragActive: boolean) {
  return [
    COMPOSER_PANEL_BASE_CLASS,
    surface === "initial" ? "composer-panel-initial" : "",
    COMPOSER_PANEL_SHAPE_CLASS[layout],
    dragActive ? COMPOSER_PANEL_DROP_ACTIVE_CLASS : COMPOSER_PANEL_IDLE_CLASS,
  ].filter(Boolean).join(" ");
}

export function Composer({
  surface = "followup", sessionId, contextSnapshot, contextState, statusNotice = null, permissionControl,
  isStreaming = false, isAborting = false, isCompacting = false, messageQueue, onSend, onAbort,
  models, defaultModelId, selectedModelId: controlledSelectedModelId, onSelectedModelChange,
  mode = "agent", onModeChange, selectedSkills = [], onSelectedSkillsChange,
  workspaceOptions = [], selectedWorkspaceRoot, onSelectWorkspace, executionContext, onConnectHost,
  draftKey, readDraft, writeDraft, readAttachmentDraft, writeAttachmentDraft, draftRestore, inputHistory = [], focusRequestId = 0,
  onOpenAttachmentPreview, onExpandContext, reviewSummary, onOpenReview,
  responseAnnotations = EMPTY_RESPONSE_ANNOTATIONS, onResponseAnnotationsChange, responseAnnotationNotice,
}: ComposerProps) {
  const isChatForm = mode === "chat";
  const { target, capabilities, readiness, choices } = useRunTargetContext();
  const isRemoteTarget = target.kind === "remote";
  const remoteHost = target.kind === "remote" ? choices?.hosts.find((host) => host.hostId === target.hostId) : undefined;
  const effectiveContextSnapshot = useComposerContextSnapshot(sessionId, contextState, contextSnapshot);
  const overlays = useComposerOverlay();
  // 有队列时运行中也能输入；没有队列的调用方保持运行中锁定输入框。
  const inputLocked = isStreaming && !messageQueue;
  const attachmentState = useComposerAttachments({
    draftKey,
    readAttachmentDraft,
    writeAttachmentDraft,
    isChatForm,
    isRemoteTarget,
    inputLocked,
    onBeforePick: () => overlays.setOpen({ kind: "palette" }, false),
    onRemoved: (attachmentId) => sender.clearAttachmentIssue(attachmentId),
  });
  const { attachments, setAttachments, setError: setAttachmentError } = attachmentState;
  const composerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const draft = useComposerDraft({
    draftKey,
    readDraft,
    writeDraft,
    draftRestore,
    focusRequestId,
    inputRef,
    onSwitched: () => {
      sender.setError(null);
      keyboard.resetHistory();
      slash.reset();
      layout.resetStuck();
    },
    onRestored: (restore) => {
      keyboard.resetHistory();
      setAttachments((current) => {
        const restored = restore.attachments ?? [];
        revokeAttachmentPreviews(current, restored);
        return restored;
      });
      setAttachmentError(null);
      sender.setError(restore.error ? { message: restore.error, issue: restore.attachmentIssue } : null);
      slash.reset();
    },
  });
  const { message, setMessage, setText: setDraftText } = draft;
  const hasAttachments = attachments.length > 0 || (!isChatForm && selectedSkills.length > 0);
  // 远端是否可发送只看 readiness（15 T7）；不能时的原因进发送按钮 tooltip 和状态行。
  const remoteReady = readiness.state === "ready";
  const remoteNotReady = isRemoteTarget && readiness.state !== "ready" ? describeReadiness(readiness, target.hostName) : null;
  const model = useComposerModel({
    target,
    sessionId: sessionId ?? null,
    models,
    defaultModelId,
    selectedModelId: controlledSelectedModelId,
    onSelectedModelChange,
    remoteReady,
    selectedSkills,
  });
  const sender = useComposerSend({
    sessionId,
    draftKey,
    writeDraft,
    onSend,
    remote: isRemoteTarget,
    ready: Boolean(message.trim() || attachments.length > 0 || responseAnnotations.length > 0) && model.available,
    text: message,
    attachments,
    clearDraft: () => {
      setDraftText("");
      keyboard.resetHistory();
      setAttachments([]);
      if (responseAnnotations.length > 0) onResponseAnnotationsChange?.([]);
      setAttachmentError(null);
      closeFloatingPanels();
    },
    restoreDraft: (text, sentAttachments) => {
      setMessage(current => current || text);
      setAttachments(current => current.length ? current : sentAttachments);
    },
  });
  const skills = useComposerSkills({ workspaceRoot: selectedWorkspaceRoot, selected: selectedSkills, onSelectedChange: onSelectedSkillsChange });
  const slash = useSlashMenu({
    message,
    inputLocked,
    isChatForm,
    isStreaming,
    skills: skills.items,
    composerRef,
    inputRef,
    setDraftText,
    onDraftReplaced: () => keyboard.resetHistory(),
  });
  const keyboard = useComposerKeyboard({
    inputRef,
    message,
    setDraftText,
    inputHistory,
    modeShortcut: !isChatForm,
    onModeShortcut: () => selectMode("plan"),
    slash: {
      open: slash.open,
      resultCount: slash.results.length,
      active: slash.active,
      dismiss: slash.dismiss,
      move: slash.move,
      select: selectSlashResult,
    },
    onSend: sendCurrentMessage,
  });
  const layout = useComposerLayout({
    surface,
    mode,
    message,
    inputRef,
    hasExtras: hasAttachments || responseAnnotations.length > 0,
    remeasureKey: model.selectedModelId,
  });
  const { branchLabel, runLocation } = composerGitFacts(executionContext);

  // Composer 只挂一次（16 T14），换会话不重挂：开着的菜单和上下文用量浮层收起，不带到下一个会话。
  useEffect(() => {
    closeFloatingPanels();
    slash.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在换会话时收起
  }, [draftKey]);

  useEffect(() => {
    if (!slash.open) return;
    overlays.close();
    void skills.load();
  }, [selectedWorkspaceRoot, slash.open]);

  useEffect(() => {
    if (overlays.overlay === null) return;
    slash.dismiss();
  }, [overlays.overlay]);

  // 打开 `+` 面板就加载 Skills：主页的搜索也要能搜到它们。
  useEffect(() => {
    if (!overlays.paletteOpen || isChatForm) return;
    void skills.load();
  }, [overlays.paletteOpen, isChatForm, selectedWorkspaceRoot]);

  function closeFloatingPanels() {
    overlays.close();
    slash.dismiss();
  }

  function selectMode(nextMode: ComposerMode) {
    overlays.setOpen({ kind: "palette" }, false);
    void Promise.resolve(onModeChange?.(nextMode)).catch((error: unknown) => {
      sender.setError({ message: error instanceof Error ? error.message : String(error) });
    });
  }

  function createSendOptions(includeAttachments: boolean): ComposerSendOptions {
    return composerSendOptions({
      model: model.selectedModelId,
      mode,
      selectedSkills,
      runtimeOptions: model.runtimeOptions,
      ...(includeAttachments ? { attachments, responseAnnotations } : {}),
    });
  }

  function selectSlashResult(result: ComposerSlashResult | undefined) {
    if (!result) return;
    if (result.kind === "skill") skills.toggle(result.item.name);
    // /compact 在运行中锁定输入或模型不可用时不执行，菜单保持打开。
    else if (!runSlashFunction(result.item.id, {
      selectMode,
      compact: onSend && !inputLocked && model.available ? () => onSend("/compact", createSendOptions(false)) : undefined,
      openContext: onExpandContext,
      openReview: onOpenReview,
    })) return;
    slash.finish();
  }

  function sendCurrentMessage() {
    if (inputLocked) return;
    sender.send(createSendOptions(true));
  }

  function renderComposerInput() {
    return (
      <ComposerInput
        inputRef={inputRef}
        surface={surface}
        placeholder={composerPlaceholder(mode, surface, isStreaming && Boolean(messageQueue))}
        value={message}
        disabled={inputLocked}
        slash={{ open: slash.open, menuId: SLASH_MENU_ID, activeOptionId: slash.activeOptionId }}
        onChange={(text) => {
          setDraftText(text);
          keyboard.resetHistory();
          slash.reset();
        }}
        onPaste={(event) => {
          void attachmentState.pasteImages(event);
        }}
        onKeyDown={keyboard.onKeyDown}
      />
    );
  }

  function renderAttachmentStrip() {
    if (!hasAttachments) return null;
    return (
      <ComposerAttachments
        attachments={attachments}
        selectedSkills={selectedSkills}
        issueAttachmentId={sender.error?.issue?.attachmentId}
        onPreview={onOpenAttachmentPreview}
        onRemove={attachmentState.remove}
        onRemoveSkill={skills.toggle}
      />
    );
  }

  function exitMode() {
    selectMode("agent");
    overlays.close();
    // chip 随之卸载，焦点交还输入框，不落到 body 上。
    inputRef.current?.focus();
  }

  function renderToolbar() {
    return (
      <ComposerToolbar
        mode={mode}
        isStreaming={isStreaming}
        paletteOpen={overlays.paletteOpen}
        onTogglePalette={() => overlays.toggle({ kind: "palette" })}
        onExitMode={exitMode}
        model={{
          catalog: model.catalog,
          selectedModelId: model.catalogSelectedModelId,
          onSelect: (modelId) => {
            model.selectModel(modelId);
            overlays.setOpen({ kind: "model" }, false);
          },
          options: model.pickerOptions,
          open: overlays.modelOpen,
          onOpenChange: (open) => overlays.setOpen({ kind: "model" }, open),
          triggerLabel: model.displayLabel,
          triggerTitle: model.title,
          disabled: isRemoteTarget && remoteHost?.state !== "connected",
        }}
        send={{
          isStreaming,
          isAborting,
          isCompacting,
          queueEnabled: Boolean(messageQueue),
          canSend: sender.canSend,
          modelAvailable: model.available,
          notReady: remoteNotReady,
          hostReachable: hostReachable(readiness),
        }}
        onSend={sendCurrentMessage}
        onAbort={onAbort}
      />
    );
  }

  function renderPanel() {
    const acceptsFiles = isChatForm || capabilities.attachments.files;
    return (
      <ComposerPalette
        open={overlays.paletteOpen}
        onOpenChange={(open) => overlays.setOpen({ kind: "palette" }, open)}
        onReturnFocus={() => inputRef.current?.focus()}
        mode={mode}
        sessionStarted={surface !== "initial"}
        modeDisabled={isStreaming}
        onSelectMode={selectMode}
        attachment={{
          label: acceptsFiles ? "图片与文件" : "图片",
          description: isChatForm ? "PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV" : undefined,
          icon: acceptsFiles ? "files" : "images",
          onSelect: () => void (acceptsFiles ? attachmentState.selectFiles() : attachmentState.selectImages()),
        }}
        skills={isChatForm ? null : {
          items: skills.items,
          loading: skills.loading,
          error: skills.error,
          selected: selectedSkills,
          onToggle: skills.toggle,
          onRetry: () => void skills.load(true),
        }}
      >
        <div
          className={getComposerPanelClass(surface, layout.layout, attachmentState.dragActive)}
          aria-label="消息输入面板"
          {...attachmentState.dropTarget}
        >
          <ComposerNotices
            annotations={onResponseAnnotationsChange ? { items: responseAnnotations, notice: responseAnnotationNotice, onClear: () => onResponseAnnotationsChange([]) } : undefined}
            statusNotice={statusNotice}
            sending={sender.sending}
            uploadProgress={sender.uploadProgress}
            attachmentError={attachmentState.error}
          >
            {renderAttachmentStrip()}
          </ComposerNotices>
          <div
            ref={layout.bodyRef}
            className={layout.bodyClass}
            data-layout={layout.layout}
          >
            {renderComposerInput()}
            {renderToolbar()}
          </div>
          <SlashMenu
            surface={surface}
            slash={slash}
            mode={mode}
            selectedSkills={selectedSkills}
            skillsLoading={skills.loading}
            skillsError={skills.error}
            skillCount={skills.items.length}
            onSelect={selectSlashResult}
            onRetrySkills={() => void skills.load(true)}
          />
        </div>
      </ComposerPalette>
    );
  }

  function renderReviewActionsStrip() {
    if (!capabilities.review.enabled || isChatForm || !reviewSummary || reviewSummary.status === "empty") return null;
    return <ReviewStrip summary={reviewSummary} onOpenReview={onOpenReview} />;
  }

  function renderComposerStatusRow() {
    if (surface !== "followup") return null;
    return (
      <ComposerStatusRow
        form={isChatForm ? "chat" : "agent"}
        target={target}
        notReady={remoteNotReady}
        host={remoteHost}
        remoteDescription={choices?.description}
        branchLabel={branchLabel}
        runLocation={runLocation}
        permissionControl={permissionControl}
        context={{
          snapshot: effectiveContextSnapshot,
          open: overlays.contextOpen,
          onToggle: () => overlays.toggle({ kind: "context" }),
        }}
      />
    );
  }

  function renderInitialContextRow() {
    // 只在新建页；对话中运行目标已锁定，由状态行只读显示。
    if (surface !== "initial") return null;
    // Chat 不用工作区和分支：本机 Chat 整行不显示，远端 Chat 只留运行位置。
    if (isChatForm && !isRemoteTarget) return null;
    return (
      <RunTargetRow
        openField={overlays.runTargetField}
        onOpenChange={(field, open) => overlays.setOpen({ kind: "run-target", field }, open)}
        target={target}
        notReady={remoteNotReady}
        locationOnly={isChatForm}
        hosts={choices?.hosts ?? []}
        remoteDescription={choices?.description}
        onSelectHost={(hostId) => choices?.selectHost(hostId)}
        onSelectRemoteWorkspace={(workspaceId) => choices?.selectWorkspace(workspaceId)}
        onConnectHost={() => onConnectHost?.()}
        local={composerLocalRunTarget({ workspaceOptions, selectedWorkspaceRoot, onSelectWorkspace, executionContext, newWorktree: capabilities.newWorktree })}
      />
    );
  }

  return (
    <footer className={getComposerWrapClass(surface)} ref={composerRef}>
      {overlays.contextOpen ? (
        <ContextPopup
          anchorRef={composerRef}
          snapshot={effectiveContextSnapshot}
          contextState={contextState}
          onClose={() => overlays.setOpen({ kind: "context" }, false)}
          onExpand={
            onExpandContext
              ? () => {
                  onExpandContext();
                  overlays.setOpen({ kind: "context" }, false);
                }
              : undefined
          }
        />
      ) : null}
      {renderReviewActionsStrip()}
      {renderInitialContextRow()}
      {sender.error ? <ComposerSendErrorAlert message={sender.error.message} /> : null}
      {/* 队列托盘在输入框外面、紧贴在它上方（09）：不随输入框的圆角和单行 / 多行变化。 */}
      {messageQueue ? (
        <MessageQueueTray
          controls={messageQueue}
          inputEmpty={!message.trim() && attachments.length === 0 && responseAnnotations.length === 0}
        />
      ) : null}
      {renderPanel()}
      {renderComposerStatusRow()}
    </footer>
  );
}
