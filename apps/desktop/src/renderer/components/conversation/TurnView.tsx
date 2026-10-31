import { memo, type ReactNode } from "react";
import type { ComposerAttachment, MessageBlock } from "@actspace/shared";
import { ResponseAnnotationPill } from "../composer/ResponseAnnotationPill";
import { BackgroundNoticeRow } from "../messages/BackgroundNoticeRow";
import { TodoListBlock } from "../messages/TodoListBlock";
import { ToolActivityGroup } from "../messages/ToolActivityGroup";
import { USER_ANNOTATIONS_ROW_CLASS, UserMessage } from "../messages/UserMessage";
import { renderMessageList, type AgentTranscriptHandler, type ReadMessageBlock } from "./render-message";
import { TurnTail } from "../turn-tail/TurnTail";
import { TurnActions } from "./TurnActions";
import { finalAssistantMessages, getLatestTodoMessage, hasToolLikeItem, splitTurnMessages, workDurationMs, type ConversationTurn } from "./turns";

const MESSAGE_TURN_CLASS = "message-turn relative flex min-w-0 flex-col gap-0";
const TURN_PROMPT_CLASS =
  "turn-prompt sticky top-0 z-12 min-w-0 bg-[image:var(--act-gradient-surface-fade)] py-4";
const TURN_PROMPT_CARD_CLASS =
  "turn-prompt-card overflow-hidden rounded-act-lg border border-line bg-surface";
const TURN_BODY_CLASS = "turn-body message-flow flex min-w-0 flex-col";
const ASSISTANT_TURN_GROUP_CLASS = "group/assistant-turn min-w-0";

function renderProcessContent(
  processItems: MessageBlock[],
  isActive: boolean,
  finalReply: MessageBlock[],
  onOpenAgentTranscript?: AgentTranscriptHandler,
  replyCompleted = false,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
  onOpenWorkspaceFile?: (path: string) => void,
  completeTurn = true,
): ReactNode[] {
  return [
    <ToolActivityGroup key="work" running={isActive} durationMs={completeTurn ? workDurationMs(processItems, finalReply) : undefined}>
      {renderMessageList(processItems, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile)}
    </ToolActivityGroup>,
  ];
}

function TurnPrompt({
  turn,
  onOpenAttachmentPreview,
  sessionId,
}: {
  turn: ConversationTurn;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
  sessionId?: string | null;
}) {
  if (!turn.user) return turn.notice ? <BackgroundNoticeRow message={turn.notice} /> : null;
  const latestTodo = getLatestTodoMessage(turn.messages);

  return (
    <div className={TURN_PROMPT_CLASS}>
      {turn.user.responseAnnotations?.length ? (
        <div className={USER_ANNOTATIONS_ROW_CLASS}>
          <ResponseAnnotationPill annotations={turn.user.responseAnnotations} variant="sent" />
        </div>
      ) : null}
      <div className={TURN_PROMPT_CARD_CLASS}>
        <UserMessage
          message={turn.user}
          onOpenAttachmentPreview={onOpenAttachmentPreview}
          sessionId={sessionId}
          variant="execution"
        />
        {latestTodo && (latestTodo.totalCount > 0 || latestTodo.status === "failed") ? (
          <TodoListBlock message={latestTodo} attached />
        ) : null}
      </div>
    </div>
  );
}

/**
 * 渲染一个 turn 的正文：含工具时把过程聚合进 ToolActivityGroup（执行中平铺 / 完成后 Worked for 折叠），
 * 最终回复始终留在折叠组外正常渲染；没有工具时回退到原来的平铺渲染。
 */
function renderTurnBody(
  turn: ConversationTurn,
  isActive: boolean,
  onOpenAgentTranscript?: AgentTranscriptHandler,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
  onOpenWorkspaceFile?: (path: string) => void,
) {
  const { workItems, finalReply, failures } = splitTurnMessages(turn.messages);
  const replyCompleted = !isActive && finalReply.length > 0;
  const attachTodoToPrompt = Boolean(turn.user);
  const preparationItems = workItems.filter((message) => message.kind === "workspace_preparation");
  const latestTodo = attachTodoToPrompt ? getLatestTodoMessage(workItems) : undefined;
  const processItems = workItems.filter(
    (message) => message.kind !== "workspace_preparation" && (!attachTodoToPrompt || message.kind !== "todo"),
  );
  const processContent = processItems.length === 0
    ? null
    : hasToolLikeItem(processItems)
      ? renderProcessContent(processItems, isActive, finalReply, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile, Boolean(turn.user))
      : renderMessageList(processItems, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile);

  if (!hasToolLikeItem(processItems) && !latestTodo) {
    return renderMessageList(turn.messages, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile);
  }

  return (
    <>
      {preparationItems.length > 0 ? renderMessageList(preparationItems, onOpenAgentTranscript, false, onOpenReadFile, onOpenWorkspaceFile) : null}
      {processContent}
      {finalReply.length > 0 ? <div className={`message-flow${processContent ? " message-flow-final" : ""}`}>{renderMessageList(finalReply, onOpenAgentTranscript, false, onOpenReadFile, onOpenWorkspaceFile)}</div> : null}
      {failures.length > 0 ? renderMessageList(failures, onOpenAgentTranscript, false, onOpenReadFile, onOpenWorkspaceFile) : null}
    </>
  );
}

type TurnViewProps = {
  turn: ConversationTurn;
  /** 正在流式输出的最后一轮。 */
  isActive: boolean;
  /** 会话里的最后一轮：它的回复操作一直显示，更早的轮次悬停才出现。 */
  isLatest?: boolean;
  sessionId: string | null;
  workspaceRoot?: string | null;
  /** 从 1 开始的用户轮次；更早的历史还没加载时为空（编号不可靠）。 */
  turnNumber?: number;
  /** 有用户输入的轮次登记到轮次导航；没有用户输入的（压缩、工作树准备）不登记。 */
  setTurnElement: (turnId: string, element: HTMLElement | null) => void;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
  onOpenAgentTranscript?: AgentTranscriptHandler;
  onOpenReadFile?: (message: ReadMessageBlock) => void;
  onOpenWorkspaceFile?: (path: string) => void;
};

/** 一轮对话：用户输入（吸顶）、过程和最终回复、轮尾（改动卡、交付卡、图片）、回复操作。 */
export const TurnView = memo(function TurnView({
  turn,
  isActive,
  isLatest = false,
  sessionId,
  workspaceRoot,
  turnNumber,
  setTurnElement,
  onOpenAttachmentPreview,
  onOpenAgentTranscript,
  onOpenReadFile,
  onOpenWorkspaceFile,
}: TurnViewProps) {
  const assistantMessages = finalAssistantMessages(turn);
  return (
    <section
      className={MESSAGE_TURN_CLASS}
      ref={turn.user ? (element) => setTurnElement(turn.id, element) : undefined}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 240px" }}
      data-conversation-turn-id={turn.user ? turn.id : undefined}
    >
      <TurnPrompt turn={turn} onOpenAttachmentPreview={onOpenAttachmentPreview} sessionId={sessionId} />
      <div className={ASSISTANT_TURN_GROUP_CLASS}>
        <div className={TURN_BODY_CLASS}>
          {renderTurnBody(turn, isActive, onOpenAgentTranscript, onOpenReadFile, onOpenWorkspaceFile)}
        </div>
        {splitTurnMessages(turn.messages).finalReply.length > 0 && !isActive ? (
          <TurnTail
            turnId={turn.id}
            turnNumber={turnNumber}
            messages={turn.messages}
            sessionId={sessionId}
            workspaceRoot={workspaceRoot}
          />
        ) : null}
        <TurnActions
          completeTurn={Boolean(turn.user)}
          revealAlways={isLatest && !isActive}
          turnActive={isActive}
          sessionId={sessionId}
          assistantMessages={assistantMessages}
        />
      </div>
    </section>
  );
}, sameTurnViewProps);

/**
 * 每次投影都会重新分组出新的 turn 对象，但历史轮次里的消息块引用不变：
 * 按消息逐个比引用，流式时只有最后一轮重渲染。
 */
function sameTurnViewProps(previous: TurnViewProps, next: TurnViewProps): boolean {
  for (const key of Object.keys(next) as (keyof TurnViewProps)[]) {
    if (key !== "turn" && !Object.is(previous[key], next[key])) return false;
  }
  if (Object.keys(previous).length !== Object.keys(next).length) return false;
  const before = previous.turn;
  const after = next.turn;
  if (before === after) return true;
  return before.id === after.id
    && before.user === after.user
    && before.messages.length === after.messages.length
    && before.messages.every((message, index) => message === after.messages[index]);
}
