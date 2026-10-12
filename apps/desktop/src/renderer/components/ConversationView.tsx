import { useRunTargetContext } from "../target/run-target-context";
import { useSessionBrowse } from "../session/SessionBrowseContext";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/Button";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, WheelEvent as ReactWheelEvent } from "react";
import type { ComposerAttachment, ContextState, ContextUsageSnapshot } from "@actspace/shared";
import { ResponseAnnotationContext, annotatableMessageIds } from "./messages/response-annotation-context";
import { ResponseSelectionMenu } from "./messages/ResponseSelectionMenu";
import { ResponseAnnotationCommentPopover } from "./messages/ResponseAnnotationCommentPopover";
import { ResponseAnnotationHighlights } from "./messages/ResponseAnnotationHighlights";
import { useResponseAnnotationState } from "./messages/useResponseAnnotationState";
import type { ComposerReviewSummary } from "./Composer";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { CompactionRetryContext } from "./messages/CompactCommandBlock";
import type { SessionMainView } from "./SessionViewToggle";
import { TrajectoryView } from "./TrajectoryView";
import { selectComposer, selectRequestContextEstimate, selectSurfaceMessages } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";
import { useActiveSession } from "../session/active-session-context";
import { useComposerContext } from "./composer/composer-context";
import { ConversationComposerSlot } from "./conversation/ConversationComposerSlot";
import type { AgentMessageBlock } from "./conversation/render-message";
import { TurnNavigator, useTurnNavigator } from "./conversation/TurnNavigator";
import { TurnView } from "./conversation/TurnView";
import { createTurnNavigationItems, groupMessagesIntoTurns, userInputHistory } from "./conversation/turns";
import { useWorkspaceFileLinks } from "./conversation/use-workspace-file-links";

const CONVERSATION_SHELL_CLASS =
  "conversation-shell grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] bg-surface pt-[var(--window-chrome-strip-height)]";
const MESSAGE_VIEWPORT_CLASS = "conversation-message-viewport relative col-start-1 row-start-1 min-h-0 min-w-0";
const MESSAGE_SCROLL_CLASS = "message-scroll h-full min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_SCROLL_INITIAL_CLASS =
  "message-scroll message-scroll-initial h-full min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_STACK_CLASS =
  "message-stack mx-auto flex min-w-0 w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-col gap-7 pb-7";
// Composer 只挂一处（16 T14）：空会话时这一格叠在消息区上、居中显示（滚动与留白和原来放在消息区里时相同）；
// 有消息后回到底部一行。切换只换两层 div 的 class，Composer 不重新挂载，焦点和输入法状态都还在。
const INITIAL_COMPOSER_SCROLL_CLASS =
  "initial-composer-scroll relative col-start-1 row-start-1 h-full min-h-0 min-w-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const INITIAL_COMPOSER_STAGE_CLASS =
  "initial-composer-stage flex h-full min-h-[420px] items-center justify-center px-[var(--conversation-inline-padding)]";
const COMPOSER_ZONE_CLASS = "composer-zone col-start-1 row-start-2 grid min-w-0 w-full gap-3 overflow-visible pb-5";
// 距顶部小于该距离时预取更早消息，让用户上滑时历史已经接上，而不是撞到顶部再等。
const EARLIER_PRELOAD_THRESHOLD_PX = 240;
const SCROLL_BOTTOM_THRESHOLD_PX = 80;

export function ConversationView({
  contextSnapshot,
  contextState,
  durableSurfaceMessageCount,
  composerPhase,
  isSessionReady = true,
  reviewSummary,
  onOpenReview,
  onConnectHost,
  activeView = "chat",
  permissionControl,
}: {
  /** 与投影合并后的上下文用量（WorkbenchLayout 计算）。 */
  contextSnapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  /** Durable Surface count from ClientSessionStore; prevents the composer from treating a stale local list as blank. */
  durableSurfaceMessageCount?: number;
  /** Session-owned phase from ClientSessionStore; local message length is only a fallback for isolated tests. */
  composerPhase?: "blank" | "engaging" | "active";
  isSessionReady?: boolean;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
  /** 运行位置菜单的「连接远端机器…」：打开 设置 › 远端 Host。 */
  onConnectHost?: () => void;
  activeView?: SessionMainView;
  permissionControl?: ReactNode;
}) {
  const { sessionId, messages, isStreaming, isAborting, sendScrollRequestId, composerFocusRequestId, onAbort, onRetryCompaction } = useActiveSession();
  const { draftRestore, draftKey, readAnnotationDraft, writeAnnotationDraft } = useComposerContext();
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection !== null && sessionProjection.sessionId !== null && (sessionId === null || sessionId === undefined || sessionProjection.sessionId === sessionId)
    ? sessionProjection.cell
    : null;
  const browse = useSessionBrowse();
  const { target, selectedWorkspaceRoot } = useRunTargetContext();
  // 14 S9：App 读页失败用 browse.messageError；投影 cell 的打开 / refresh 失败（bridge 重试用完前也会先显示）用 cell 的 status/error。
  const projectionError = projectionCell?.status === "error" ? `会话同步失败：${projectionCell.error ?? "未知错误"}` : null;
  // 15 S2：key 损坏时不去读页，也不给「重试」。
  const locatorError = target.kind === "invalid" ? "会话标识损坏，无法打开这个会话。" : null;
  const sessionError = locatorError ?? browse?.messageError ?? projectionError;
  const projectionBridge = sessionProjection?.bridge ?? null;
  const projectionSessionId = sessionProjection?.sessionId ?? null;
  const retrySession = useCallback(() => {
    if (browse) { browse.retryMessages(); return; }
    // 没有 App（单独挂 SessionProjectionProvider）时直接重新打开；失败会再次写进 cell。
    if (projectionBridge && projectionSessionId) void projectionBridge.open(projectionSessionId).catch(() => undefined);
  }, [browse, projectionBridge, projectionSessionId]);
  const historyAnchor = useRef<{ sessionId: string | null | undefined; height: number; top: number } | null>(null);
  const projectedSurfaceMessages = projectionCell ? selectSurfaceMessages(projectionCell) : [];
  const projectedComposer = projectionCell ? selectComposer(projectionCell) : null;
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const effectiveContextSnapshot = contextSnapshot
    ?? (projectedContextEstimate ? contextEstimateToSnapshot(projectedContextEstimate) : null);
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);
  const inputHistory = useMemo(() => userInputHistory(messages), [messages]);
  const turnNavigationItems = useMemo(
    () => createTurnNavigationItems(turns, isStreaming),
    [isStreaming, turns],
  );
  const durableMessageCount = durableSurfaceMessageCount ?? (projectedSurfaceMessages.length > 0 ? projectedSurfaceMessages.length : messages.length);
  const hasConversationContent = durableMessageCount > 0 || messages.length > 0;
  const requestedComposerPhase = composerPhase ?? projectedComposer?.phase;
  const resolvedComposerPhase = requestedComposerPhase === "blank" && hasConversationContent
    ? "active"
    : requestedComposerPhase ?? (durableMessageCount === 0 ? "blank" : "active");
  const projectionSessionReady = projectionCell !== null && projectionCell.status !== "error";
  const resolvedSessionReady = (projectedComposer != null && projectedComposer.phase !== "blank") || isSessionReady || projectionSessionReady;
  const waitingForInitialList = browse?.listLoading && !resolvedSessionReady;
  const isInitialComposer = !browse?.messageLoading && !sessionError && !waitingForInitialList && resolvedSessionReady && resolvedComposerPhase === "blank" && !isStreaming;
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  // 可批注的回复随 messages 变化；经 ref 读取，canAnnotate 保持稳定，选区监听不随每次流式刷新重挂。
  const annotatableIdsRef = useRef<ReadonlySet<string>>(new Set());
  annotatableIdsRef.current = useMemo(() => annotatableMessageIds(messages), [messages]);
  const canAnnotate = useCallback((messageId: string) => annotatableIdsRef.current.has(messageId), []);
  const annotations = useResponseAnnotationState({ draftKey, draftRestore, readAnnotationDraft, writeAnnotationDraft, scrollContainerRef, canAnnotate });
  // 评论框保存 / 取消后把焦点还给 Composer：和上层的聚焦请求叠加成同一个递增 id。
  const [annotationFocusRequest, setAnnotationFocusRequest] = useState(0);
  const focusRequestId = composerFocusRequestId + annotationFocusRequest;
  const updateConversationViewportRef = useRef<() => void>(() => {});
  // 是否「贴底自动跟随」：流式输出时保持视图贴底；用户向上滚动阅读历史则暂停，
  // 滚回接近底部时恢复（类似 Cursor 的聊天滚动）。
  const stickToBottomRef = useRef(true);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const turnNavigator = useTurnNavigator(turnNavigationItems);
  const { sync: syncTurnNavigator, scrollToTurn } = turnNavigator;
  const openedSubagentRuns = useRef(new Set<string>());
  const { openTab } = useRightPanel();
  const openContextTab = () => openTab({ id: "context", kind: "context", title: "上下文" });
  const openAttachmentPreview = useCallback((attachment: ComposerAttachment) => {
    if (!attachment.previewUrl) return;
    openTab({
      id: `composer-attachment:${attachment.id}`,
      kind: "image",
      title: attachment.name,
      src: attachment.previewUrl,
    });
  }, [openTab]);

  const openAgentTranscript = useCallback((message: AgentMessageBlock) => {
    if (sessionId) openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId, selected: message });
  }, [sessionId, openTab]);
  const { openReadFile, openWorkspaceFile } = useWorkspaceFileLinks();
  useEffect(() => {
    const turn = turns.at(-1);
    if (!sessionId || !isStreaming || !turn?.messages.some((message) => message.kind === "agent")) return;
    const key = `${sessionId}:${turn.id}`;
    if (openedSubagentRuns.current.has(key)) return;
    openedSubagentRuns.current.add(key);
    openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId });
  }, [sessionId, turns, isStreaming, openTab]);

  const updateConversationViewport = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const scrollable = el.scrollHeight > el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = !scrollable || distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = atBottom;
    setIsAwayFromBottom(scrollable && !atBottom);
    syncTurnNavigator(el, scrollable, atBottom);
  }, [syncTurnNavigator]);

  useLayoutEffect(() => {
    updateConversationViewportRef.current = updateConversationViewport;
  }, [updateConversationViewport]);

  // 用户滚动时统一更新贴底状态、回底按钮和当前轮次。
  const requestEarlier = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !browse?.hasEarlier || browse.earlierLoading) return;
    stickToBottomRef.current = false;
    historyAnchor.current = { sessionId, height: el.scrollHeight, top: el.scrollTop };
    void browse.loadEarlier();
  }, [browse, sessionId]);
  const handleMessagesScroll = useCallback(() => {
    updateConversationViewport();
    if ((scrollContainerRef.current?.scrollTop ?? Infinity) < EARLIER_PRELOAD_THRESHOLD_PX && !browse?.earlierError) requestEarlier();
  }, [updateConversationViewport, requestEarlier, browse?.earlierError]);
  // 已停在顶部时继续向上滚不会产生 scroll 事件，用 wheel 兜底。
  const handleMessagesWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.deltaY >= 0 || (scrollContainerRef.current?.scrollTop ?? Infinity) > 0 || browse?.earlierError) return;
    requestEarlier();
  }, [requestEarlier, browse?.earlierError]);

  // 流式输出 / 消息增长时，若仍处于贴底状态则跟随滚动到底部。
  const scrollToBottomIfStuck = useCallback(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updateConversationViewportRef.current();
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    bottomAnchorRef.current?.scrollIntoView?.({ block: "end" });
    el.scrollTop = el.scrollHeight;
    setIsAwayFromBottom(false);
    updateConversationViewportRef.current();
  }, []);

  const navigateToTurn = useCallback((turnId: string) => {
    const scrolled = scrollToTurn(turnId, () => {
      stickToBottomRef.current = false;
      setIsAwayFromBottom(true);
    });
    if (scrolled) updateConversationViewport();
  }, [scrollToTurn, updateConversationViewport]);

  useEffect(() => {
    if (sendScrollRequestId === 0) {
      return;
    }

    // 发送新消息时强制回到底部并恢复自动跟随。
    scrollToBottom();
  }, [scrollToBottom, sendScrollRequestId]);

  // 切换会话时重置为贴底状态，避免上一会话的「已上滚」状态影响新会话。
  useEffect(() => {
    stickToBottomRef.current = true;
    historyAnchor.current = null;
    setIsAwayFromBottom(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    const anchor = historyAnchor.current;
    const el = scrollContainerRef.current;
    if (anchor && anchor.sessionId === sessionId && el && !browse?.earlierLoading) {
      el.scrollTop = anchor.top + el.scrollHeight - anchor.height;
      historyAnchor.current = null;
    } else if (!anchor) scrollToBottomIfStuck();
    updateConversationViewport();
  }, [messages, sessionId, browse?.earlierLoading, scrollToBottomIfStuck, updateConversationViewport]);

  // 已加载的消息填不满视口时没有滚动条，也就不会有上滑动作：继续自动补页直到出现滚动或没有更早消息。
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || el.clientHeight === 0 || browse?.earlierError) return;
    if (el.scrollHeight > el.clientHeight + 1) return;
    // 补页不是用户上滑，保留贴底跟随，避免刚打开会话后流式输出不再自动滚到底。
    const wasStuckToBottom = stickToBottomRef.current;
    requestEarlier();
    stickToBottomRef.current = wasStuckToBottom;
  }, [messages, browse?.hasEarlier, browse?.earlierLoading, browse?.earlierError, requestEarlier]);

  // 同一条 running 消息内部变高时（例如 write_file 持续追加 code preview），
  // messages 引用可能不变；观察消息栈尺寸，保持贴底状态继续跟随尾部。
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const viewport = scrollContainerRef.current;
    const stack = messageStackRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      scrollToBottomIfStuck();
      updateConversationViewport();
    });
    observer.observe(viewport);
    if (stack) observer.observe(stack);
    return () => observer.disconnect();
  }, [messages, scrollToBottomIfStuck, updateConversationViewport]);

  const composerSlotProps = {
    contextSnapshot: effectiveContextSnapshot,
    contextState,
    onOpenAttachmentPreview: openAttachmentPreview,
    onExpandContext: openContextTab,
    responseAnnotations: annotations.drafts,
    onResponseAnnotationsChange: annotations.setDrafts,
    responseAnnotationNotice: annotations.notice,
    inputHistory,
    focusRequestId,
    permissionControl,
    onConnectHost,
  };

  if (messages.length === 0 && (browse?.messageLoading || waitingForInitialList || sessionError)) {
    return <main className={CONVERSATION_SHELL_CLASS}><p role={sessionError ? 'alert' : 'status'} className="px-5 py-4 text-act-md leading-5 text-text-muted">
      {sessionError ?? (browse?.messageLoading ? '正在加载消息…' : '正在加载会话…')}
      {sessionError && !locatorError && <button type="button" onClick={retrySession}>重试</button>}
    </p></main>;
  }
  return (
    <ResponseAnnotationContext.Provider value={annotations.contextValue}>
    <CompactionRetryContext.Provider value={onRetryCompaction}>
    <main className={CONVERSATION_SHELL_CLASS}>
      <ResponseSelectionMenu
        scrollContainerRef={scrollContainerRef}
        canAnnotate={canAnnotate}
        onAddAnnotation={annotations.contextValue.addDraft}
      />
      <ResponseAnnotationCommentPopover
        scrollContainerRef={scrollContainerRef}
        onClose={() => setAnnotationFocusRequest((current) => current + 1)}
      />
      <div className={MESSAGE_VIEWPORT_CLASS}>
        <div
          className={activeView === "trajectory" ? "hidden" : "block h-full min-h-0"}
          aria-hidden={activeView === "trajectory"}
        >
          <section
            ref={scrollContainerRef}
            onScroll={handleMessagesScroll}
            onWheel={handleMessagesWheel}
            className={isInitialComposer ? MESSAGE_SCROLL_INITIAL_CLASS : MESSAGE_SCROLL_CLASS}
            aria-label="会话消息"
          >
              {browse?.messageLoading && <p role="status" className="px-5 py-3 text-act-md leading-5 text-text-muted">正在加载消息…</p>}
              {sessionError && <p role="alert" className="px-5 py-3 text-act-md leading-5 text-text-muted">{sessionError}{locatorError ? null : <> <button type="button" onClick={retrySession}>重试</button></>}</p>}
              {browse?.earlierLoading && <p role="status" className="flex items-center justify-center gap-1.5 py-2 text-act-xs leading-4 text-text-faint"><Loader2 className="animate-spin" size={12} aria-hidden="true" />正在加载更早消息…</p>}
              {browse?.earlierError && <p role="alert" className="px-5 text-act-xs leading-4 text-text-muted">{browse.earlierError} <button type="button" onClick={requestEarlier}>重试</button></p>}
              {isInitialComposer ? null : (
                <div ref={messageStackRef} className={MESSAGE_STACK_CLASS}>
                  {turns.map((turn, turnIndex) => (
                    <TurnView
                      key={turn.id}
                      turn={turn}
                      isActive={isStreaming && turnIndex === turns.length - 1}
                      sessionId={sessionId}
                      workspaceRoot={selectedWorkspaceRoot}
                      setTurnElement={turnNavigator.setTurnElement}
                      onOpenAttachmentPreview={openAttachmentPreview}
                      onOpenAgentTranscript={openAgentTranscript}
                      onOpenReadFile={openReadFile}
                      onOpenWorkspaceFile={openWorkspaceFile}
                    />
                  ))}
                  <div ref={bottomAnchorRef} aria-hidden="true" />
                </div>
              )}
          </section>

          <TurnNavigator
            items={turnNavigationItems}
            visible={turnNavigator.railVisible}
            activeTurnId={turnNavigator.activeTurnId}
            onNavigate={navigateToTurn}
          />
          {isAwayFromBottom ? <ScrollToBottomButton onClick={scrollToBottom} /> : null}
        </div>
        {activeView === "trajectory" ? <div className="flex h-full min-h-0 flex-col">
          {isStreaming ? <div className="flex shrink-0 justify-end border-b border-line px-4 py-2"><Button size="xs" onClick={onAbort} disabled={isAborting}>{isAborting ? "正在停止…" : "停止"}</Button></div> : null}
          <div className="min-h-0 flex-1"><TrajectoryView /></div>
        </div> : null}
      </div>
      {/* 放在消息区之后：React 按树序挂 ref 并跑 layout effect，放前面时首帧拿不到 scrollContainerRef。 */}
      <ResponseAnnotationHighlights messages={messages} scrollContainerRef={scrollContainerRef} />

      {resolvedSessionReady ? (
        <div className={isInitialComposer ? INITIAL_COMPOSER_SCROLL_CLASS : COMPOSER_ZONE_CLASS} style={activeView === "trajectory" ? { display: "none" } : undefined} aria-hidden={activeView === "trajectory"}>
          <div className={isInitialComposer ? INITIAL_COMPOSER_STAGE_CLASS : "contents"}>
            <ConversationComposerSlot
              surface={isInitialComposer ? "initial" : "followup"}
              {...composerSlotProps}
              reviewSummary={isInitialComposer ? undefined : reviewSummary}
              onOpenReview={isInitialComposer ? undefined : onOpenReview}
            />
          </div>
        </div>
      ) : null}
    </main>
    </CompactionRetryContext.Provider>
    </ResponseAnnotationContext.Provider>
  );
}
