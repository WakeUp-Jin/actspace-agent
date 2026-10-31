import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerAttachment, ComposerMode, ModelSelectionId } from "@actspace/shared";
import { SessionProjectionScope, useOptionalSessionProjection } from "../../../session";
import { ActiveSessionContext } from "../../../session/active-session-context";
import { useSessionTranscript } from "../../../session/use-session-transcript";
import { useSessionLocalState, type SessionLocalState } from "../../../session/session-local-store";
import { loadEarlier } from "../../../session/session-pages";
import { Composer, type ComposerSendOptions } from "../../Composer";
import { useSessionDrafts } from "../../composer/composer-context";
import { TurnView } from "../../conversation/TurnView";
import { PinnedTurnPrompt } from "../../conversation/PinnedTurnPrompt";
import { groupMessagesIntoTurns, userInputHistory } from "../../conversation/turns";
import { useStickToBottom } from "../../conversation/use-stick-to-bottom";
import { ScrollToBottomButton } from "../../ScrollToBottomButton";
import { Button } from "../../ui/Button";
import { PermissionModeControl } from "../../workbench/PermissionModeControl";
import { useRightPanel, type RightPanelTab } from "../RightPanelContext";
import { useSideChatRuntime, type SideChatRuntimeValue } from "./side-chat-runtime";
import { countInheritedTurns, hideInheritedMessages, sideChatBoundarySeq, sideChatDividerText, sideChatOwnTitle, sideChatTitleFromMessages } from "./side-chat-transcript";

type SideChatTab = Extract<RightPanelTab, { kind: "sideChat" }>;

// 右栏比会话区窄：消息和输入框两侧只留 14px。
const SIDE_CHAT_CLASS = "side-chat flex min-h-0 flex-1 flex-col bg-surface [--conversation-inline-padding:14px]";
const SIDE_CHAT_SCROLL_CLASS = "h-full min-h-0 overflow-auto pb-4 [scrollbar-gutter:stable]";
const SIDE_CHAT_COLUMN_CLASS = "w-[calc(100%_-_28px)] max-w-(--conversation-content-width)";
const SIDE_CHAT_STACK_CLASS = `mx-auto flex ${SIDE_CHAT_COLUMN_CLASS} flex-col gap-6 pt-3`;
// 分隔线：居中的一行小字，两侧细线；随消息一起滚走，不是悬浮的提示条。
const SIDE_CHAT_DIVIDER_CLASS =
  "m-0 flex items-center gap-2.5 text-act-xxs leading-4 text-text-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line";
const SIDE_CHAT_EMPTY_CLASS = "grid gap-1 px-2 pt-8 text-center";
const SIDE_CHAT_NOTE_CLASS = "m-0 px-1 text-act-xs leading-5 text-text-muted";

const selectUnread = (state: SessionLocalState) => state.unread;
const selectDraft = (state: SessionLocalState) => state.draft ?? null;
const selectModel = (state: SessionLocalState) => state.selectedModelId;
const selectSkills = (state: SessionLocalState) => state.composer?.selectedSkills;
const NO_SKILLS: string[] = [];
const noop = () => {};

/** 右栏的一个侧边对话：分隔线 → 分叉之后的消息 → 输入框。 */
export function SideChatView({ tab }: { tab: SideChatTab }) {
  const runtime = useSideChatRuntime();
  if (!runtime) return null;
  return (
    <SessionProjectionScope sessionId={tab.sessionId}>
      <SideChatBody key={tab.sessionId} tab={tab} runtime={runtime} />
    </SessionProjectionScope>
  );
}

function SideChatBody({ tab, runtime }: { tab: SideChatTab; runtime: SideChatRuntimeValue }) {
  const sessionId = tab.sessionId;
  const { localStore, sessionStore, retain, markRead, send, abort, setMode } = runtime;
  const projection = useOptionalSessionProjection();
  const cell = projection?.sessionId === sessionId ? projection.cell : null;
  const snapshot = cell?.snapshot ?? null;
  const transcript = useSessionTranscript(runtime, sessionId, undefined);
  const { sessionRecord, live, isCompacting } = transcript;
  const boundarySeq = sideChatBoundarySeq(snapshot?.lineage);
  const messages = useMemo(() => hideInheritedMessages(transcript.messages, boundarySeq), [transcript.messages, boundarySeq]);
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);
  const inputHistory = useMemo(() => userInputHistory(messages), [messages]);
  const inheritedTurnCount = tab.inheritedTurnCount ?? countInheritedTurns(cell?.window, boundarySeq);
  const workspaceRoot = sessionRecord?.meta.workspaceRoot;
  const mode: ComposerMode = snapshot?.agentMode ?? sessionRecord?.meta.agentMode ?? "plan";
  const { replaceTab } = useRightPanel();
  const stick = useStickToBottom(messages);
  const [earlierLoading, setEarlierLoading] = useState(false);

  useEffect(() => retain(sessionId), [retain, sessionId]);

  // 面板里看得到就算读过：跑完一轮时不留未读点。
  const unread = useSessionLocalState(localStore, sessionId, selectUnread);
  useEffect(() => { if (unread) markRead(sessionId); }, [unread, markRead, sessionId]);

  // tab 标题：会话自己的标题优先，没有时用第一条问题。
  const parentTitle = useContext(ActiveSessionContext)?.title;
  const ownTitle = sideChatOwnTitle(snapshot?.metadata.title, parentTitle);
  const title = ownTitle ?? sideChatTitleFromMessages(messages);
  useEffect(() => {
    if (title && title !== tab.title) replaceTab({ ...tab, title });
  }, [title, tab, replaceTab]);
  // 还没有自己的标题时把第一条问题存成标题（每个侧边对话只写一次）。
  const renamedRef = useRef(false);
  const { rename } = runtime;
  useEffect(() => {
    if (!snapshot || ownTitle || !title || renamedRef.current) return;
    renamedRef.current = true;
    void rename(sessionId, title).catch((error: unknown) => console.error("Failed to title side chat", error));
  }, [snapshot, ownTitle, title, rename, sessionId]);

  const drafts = useSessionDrafts(localStore, sessionId);
  const draftRestore = useSessionLocalState(localStore, sessionId, selectDraft);
  const storedModel = useSessionLocalState(localStore, sessionId, selectModel);
  const selectedSkills = useSessionLocalState(localStore, sessionId, selectSkills) ?? NO_SKILLS;
  const selectedModelId = storedModel ?? runtime.parentModelId;
  const onSelectedModelChange = useCallback((modelId: ModelSelectionId) => {
    localStore.update(sessionId, (state) => ({ ...state, selectedModelId: modelId }));
  }, [localStore, sessionId]);
  const onSelectedSkillsChange = useCallback((skills: string[]) => {
    localStore.update(sessionId, (state) => ({ ...state, composer: { mode: state.composer?.mode ?? mode, selectedSkills: skills } }));
  }, [localStore, sessionId, mode]);
  const onSend = useCallback((text: string, options: ComposerSendOptions) => {
    stick.scrollToBottom();
    return send(sessionId, text, options);
  }, [send, sessionId, stick.scrollToBottom]);
  const onAbort = useCallback(() => abort(sessionId), [abort, sessionId]);
  const onModeChange = useCallback((next: ComposerMode) => setMode(sessionId, next), [setMode, sessionId]);
  const { openTab } = useRightPanel();
  const openAttachmentPreview = useCallback((attachment: ComposerAttachment) => {
    if (attachment.previewUrl) openTab({ id: `composer-attachment:${attachment.id}`, kind: "image", title: attachment.name, src: attachment.previewUrl });
  }, [openTab]);

  // 侧边对话自己聊得很长时，窗口外还有分叉之后的消息：按需往前补页（分叉之前的不显示，也就不补）。
  const hasEarlier = transcript.historyBefore !== null && boundarySeq !== null && transcript.historyBefore > boundarySeq + 1;
  const requestEarlier = () => {
    if (earlierLoading) return;
    setEarlierLoading(true);
    void loadEarlier(sessionStore, sessionId).catch(console.error).finally(() => setEarlierLoading(false));
  };
  const retry = () => { void projection?.bridge?.refreshRelated(sessionId); };

  const permissionControl = mode !== "chat" && snapshot ? (
    <PermissionModeControl
      sessionId={sessionId}
      mode={snapshot.permissionMode ?? "default"}
      disabled={false}
      onChanged={async () => { await projection?.bridge?.refreshRelated(sessionId); }}
    />
  ) : null;
  const notice = runtime.notice?.sessionId === sessionId ? runtime.notice.text : null;
  const loading = !sessionRecord && cell?.status !== "error";

  return (
    <section className={SIDE_CHAT_CLASS} aria-label={`侧边对话：${tab.title}`}>
      <div className="relative min-h-0 flex-1">
        <div ref={stick.scrollRef} className={SIDE_CHAT_SCROLL_CLASS} onScroll={stick.onScroll} aria-label="侧边对话消息">
          <div ref={stick.contentRef} className={SIDE_CHAT_STACK_CLASS}>
            {hasEarlier ? (
              <Button variant="ghost" size="xs" className="self-center" busy={earlierLoading} disabled={earlierLoading} onClick={requestEarlier}>
                {earlierLoading ? "正在加载…" : "加载更早的消息"}
              </Button>
            ) : null}
            <p className={SIDE_CHAT_DIVIDER_CLASS} data-testid="side-chat-divider">{sideChatDividerText(inheritedTurnCount, tab.runningTurnExcluded)}</p>
            {cell?.status === "error" ? (
              <p role="alert" className={SIDE_CHAT_NOTE_CLASS}>
                侧边对话读取失败：{cell.error ?? "未知错误"} <Button variant="ghost" size="xs" onClick={retry}>重试</Button>
              </p>
            ) : loading ? (
              <p role="status" className={SIDE_CHAT_NOTE_CLASS}>正在加载侧边对话…</p>
            ) : turns.length === 0 && !live.isStreaming ? (
              <div className={SIDE_CHAT_EMPTY_CLASS}>
                <p className="m-0 text-act-sm font-medium text-text-main">在这里另起一条线问，不打断主会话</p>
                <p className="m-0 text-act-xs leading-5 text-text-faint">
                  {mode === "plan" ? "默认 Plan 模式，只用只读工具；需要改文件时在输入框里退出 Plan。" : "这里的对话不会回到主会话。"}
                </p>
              </div>
            ) : turns.map((turn, index) => (
              <TurnView
                key={turn.id}
                turn={turn}
                isActive={live.isStreaming && index === turns.length - 1}
                isLatest={index === turns.length - 1}
                sessionId={sessionId}
                workspaceRoot={workspaceRoot}
                setTurnElement={noop}
                onOpenAttachmentPreview={openAttachmentPreview}
              />
            ))}
          </div>
        </div>
        <PinnedTurnPrompt scrollRef={stick.scrollRef} turns={turns} className={SIDE_CHAT_COLUMN_CLASS} />
        {stick.awayFromBottom ? <ScrollToBottomButton onClick={stick.scrollToBottom} /> : null}
      </div>
      <div className="shrink-0 pb-3 pt-1">
        <Composer
          surface="followup"
          sessionId={sessionId}
          contextSnapshot={sessionRecord?.contextSnapshot ?? null}
          contextState={sessionRecord?.contextState ?? null}
          statusNotice={notice}
          permissionControl={permissionControl}
          isStreaming={live.isStreaming}
          isAborting={live.isAborting}
          isCompacting={isCompacting}
          onSend={onSend}
          onAbort={live.isStreaming ? onAbort : undefined}
          models={runtime.models}
          defaultModelId={runtime.defaultModelId}
          selectedModelId={selectedModelId}
          onSelectedModelChange={onSelectedModelChange}
          mode={mode}
          onModeChange={onModeChange}
          selectedSkills={selectedSkills}
          onSelectedSkillsChange={onSelectedSkillsChange}
          selectedWorkspaceRoot={workspaceRoot}
          draftRestore={draftRestore}
          {...drafts}
          inputHistory={inputHistory}
          onOpenAttachmentPreview={openAttachmentPreview}
        />
      </div>
    </section>
  );
}
