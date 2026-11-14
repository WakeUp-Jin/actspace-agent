import { memo, type MouseEvent, type ReactNode } from "react";
import type { ComposerAttachment, MessageBlock } from "@actspace/shared";
import { ResponseAnnotationPill } from "../composer/ResponseAnnotationPill";
import { BackgroundNoticeRow } from "../messages/BackgroundNoticeRow";
import { SubagentMessageCard } from "../messages/SubagentMessageCard";
import { TodoListBlock } from "../messages/TodoListBlock";
import { ReplyStreamingContext, WritingReplyContext } from "../messages/reply-streaming-context";
import { ToolActivityGroup } from "../messages/ToolActivityGroup";
import { USER_ANNOTATIONS_ROW_CLASS, UserMessage } from "../messages/UserMessage";
import { renderMessageList, type SubagentOpenHandler, type ReadMessageBlock } from "./render-message";
import { TurnTail } from "../turn-tail/TurnTail";
import { TurnActions } from "./TurnActions";
import {
  finalAssistantMessages,
  getLatestTodoMessage,
  hasToolLikeItem,
  liftSubagentMessages,
  splitTurnMessages,
  workDurationMs,
  type ConversationTurn,
} from "./turns";
import { TurnPromptEditor } from "./TurnPromptEditor";
import { useTurnEdit } from "./turn-edit-context";

const MESSAGE_TURN_CLASS = "message-turn relative flex min-w-0 flex-col gap-0";
// 提问卡片不吸顶，跟着内容滚走；滚出视野后由 PinnedTurnPrompt 在顶部叠一行。
const TURN_PROMPT_CLASS = "turn-prompt min-w-0 py-4";
// 来信唤醒的一轮以来信卡片开头，占提问卡片的位置。
const TURN_LETTER_CLASS = "turn-prompt min-w-0 pt-4 pb-2";
const TURN_PROMPT_CARD_CLASS = "turn-prompt-card overflow-hidden rounded-act-lg border border-line bg-surface";
// 可编辑的提问卡片：悬停边框加深、文本光标，点击原地变成编辑器（agent-edit-resend-rewind.md §5.1）。
const TURN_PROMPT_CARD_EDITABLE_CLASS =
  "cursor-text transition-[border-color] duration-(--motion-fast) hover:border-line-strong";
// 编辑时，编辑器以下（这一轮的正文、轮尾和之后所有轮次）变淡、不响应鼠标；发送时淡出。
const TURN_DIM_CLASS = "transition-[opacity,filter] duration-(--motion-slow) ease-out";
const TURN_DIMMED_CLASS = "pointer-events-none opacity-30 saturate-[.4]";
const TURN_LEAVING_CLASS = "pointer-events-none opacity-0";

/** 编辑时这一轮哪些部分变淡：`body` 是编辑器所在轮（提问之外），`all` 是之后的轮次。 */
export type TurnDim = "body" | "all";
const TURN_BODY_CLASS = "turn-body message-flow flex min-w-0 flex-col";
const ASSISTANT_TURN_GROUP_CLASS = "group/assistant-turn min-w-0";

function renderProcessContent(
  processItems: MessageBlock[],
  isActive: boolean,
  finalReply: MessageBlock[],
  onOpenSubagent?: SubagentOpenHandler,
  replyCompleted = false,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
  onOpenWorkspaceFile?: (path: string, line?: number) => void,
  completeTurn = true,
): ReactNode[] {
  return [
    <ToolActivityGroup
      key="work"
      running={isActive}
      durationMs={completeTurn ? workDurationMs(processItems, finalReply) : undefined}
    >
      {renderMessageList(processItems, onOpenSubagent, replyCompleted, onOpenReadFile, onOpenWorkspaceFile)}
    </ToolActivityGroup>,
  ];
}

function dimClass(dim: TurnDim | undefined, leaving: boolean): string {
  if (!dim) return "";
  return `${TURN_DIM_CLASS} ${leaving ? TURN_LEAVING_CLASS : TURN_DIMMED_CLASS}`;
}

function TurnPrompt({
  turn,
  editable,
  onOpenAttachmentPreview,
  sessionId,
  onOpenSubagent,
}: {
  turn: ConversationTurn;
  editable: boolean;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
  sessionId?: string | null;
  onOpenSubagent?: SubagentOpenHandler;
}) {
  const edit = useTurnEdit();
  if (!turn.user) {
    if (!turn.notice) return null;
    if (turn.notice.taskKind === "agent_message")
      return (
        <div className={TURN_LETTER_CLASS}>
          <SubagentMessageCard message={turn.notice} onOpenSubagent={onOpenSubagent} />
        </div>
      );
    return <BackgroundNoticeRow message={turn.notice} onOpenSubagent={onOpenSubagent} />;
  }
  const latestTodo = getLatestTodoMessage(turn.messages);
  const editing = edit?.editing?.turnId === turn.id ? edit.editing : null;
  if (edit && editing) {
    return (
      <div className={TURN_PROMPT_CLASS}>
        <TurnPromptEditor
          key={editing.key}
          sessionId={edit.sessionId}
          initial={editing.draft}
          onCancel={edit.cancel}
          onSubmit={edit.submit}
        />
      </div>
    );
  }
  const canEdit = editable && edit !== null;
  // 拖选文字、点附件预览时不进入编辑。
  const startEdit = (event: MouseEvent<HTMLDivElement>) => {
    if (!canEdit || window.getSelection()?.toString()) return;
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    edit.start(turn.id);
  };

  return (
    <div className={TURN_PROMPT_CLASS}>
      {turn.user.responseAnnotations?.length ? (
        <div className={USER_ANNOTATIONS_ROW_CLASS}>
          <ResponseAnnotationPill annotations={turn.user.responseAnnotations} variant="sent" />
        </div>
      ) : null}
      <div
        className={canEdit ? `${TURN_PROMPT_CARD_CLASS} ${TURN_PROMPT_CARD_EDITABLE_CLASS}` : TURN_PROMPT_CARD_CLASS}
        data-editable={canEdit ? "true" : undefined}
        title={canEdit ? "点击编辑并重新发送" : undefined}
        onClick={canEdit ? startEdit : undefined}
      >
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
  onOpenSubagent?: SubagentOpenHandler,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
  onOpenWorkspaceFile?: (path: string, line?: number) => void,
) {
  const { workItems, finalReply, failures } = splitTurnMessages(turn.messages);
  const replyCompleted = !isActive && finalReply.length > 0;
  const attachTodoToPrompt = Boolean(turn.user);
  const preparationItems = workItems.filter((message) => message.kind === "workspace_preparation");
  const latestTodo = attachTodoToPrompt ? getLatestTodoMessage(workItems) : undefined;
  const { process: processItems, letters } = liftSubagentMessages(
    workItems.filter(
      (message) => message.kind !== "workspace_preparation" && (!attachTodoToPrompt || message.kind !== "todo"),
    ),
    isActive,
  );
  const processContent =
    processItems.length === 0
      ? null
      : hasToolLikeItem(processItems)
        ? renderProcessContent(
            processItems,
            isActive,
            finalReply,
            onOpenSubagent,
            replyCompleted,
            onOpenReadFile,
            onOpenWorkspaceFile,
            Boolean(turn.user),
          )
        : renderMessageList(processItems, onOpenSubagent, replyCompleted, onOpenReadFile, onOpenWorkspaceFile);

  if (!hasToolLikeItem(processItems) && !latestTodo) {
    return renderMessageList(turn.messages, onOpenSubagent, replyCompleted, onOpenReadFile, onOpenWorkspaceFile);
  }

  return (
    <>
      {preparationItems.length > 0
        ? renderMessageList(preparationItems, onOpenSubagent, false, onOpenReadFile, onOpenWorkspaceFile)
        : null}
      {processContent}
      {letters.length > 0
        ? renderMessageList(letters, onOpenSubagent, false, onOpenReadFile, onOpenWorkspaceFile)
        : null}
      {finalReply.length > 0 ? (
        <div className={`message-flow${processContent ? " message-flow-final" : ""}`}>
          {renderMessageList(finalReply, onOpenSubagent, false, onOpenReadFile, onOpenWorkspaceFile)}
        </div>
      ) : null}
      {failures.length > 0
        ? renderMessageList(failures, onOpenSubagent, false, onOpenReadFile, onOpenWorkspaceFile)
        : null}
    </>
  );
}

/** 正在写的回复：这一轮还在跑，且最后一项是回复。回复后面已经接了工具、思考或等待行，说明它写完了。 */
function writingReplyId(turn: ConversationTurn, isActive: boolean): string | null {
  if (!isActive) return null;
  const last = turn.messages.at(-1);
  return last?.kind === "assistant" ? last.id : null;
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
  onOpenSubagent?: SubagentOpenHandler;
  onOpenReadFile?: (message: ReadMessageBlock) => void;
  onOpenWorkspaceFile?: (path: string, line?: number) => void;
  /** 提问卡片可以点开编辑（会话空闲、不是继承来的轮次）。 */
  editable?: boolean;
  /** 有提问正在编辑时，这一轮变淡的部分。 */
  dim?: TurnDim;
  /** 编辑后发送：变淡的部分淡出。 */
  leaving?: boolean;
};

/** 一轮对话：用户输入、过程和最终回复、轮尾（改动卡、交付卡、图片）、回复操作。 */
export const TurnView = memo(function TurnView({
  turn,
  isActive,
  isLatest = false,
  sessionId,
  workspaceRoot,
  turnNumber,
  setTurnElement,
  onOpenAttachmentPreview,
  onOpenSubagent,
  onOpenReadFile,
  onOpenWorkspaceFile,
  editable = false,
  dim,
  leaving = false,
}: TurnViewProps) {
  const assistantMessages = finalAssistantMessages(turn);
  const promptDim = dim === "all" ? dimClass(dim, leaving) : "";
  return (
    <section
      className={MESSAGE_TURN_CLASS}
      ref={turn.user ? (element) => setTurnElement(turn.id, element) : undefined}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 240px" }}
      data-conversation-turn-id={turn.user ? turn.id : undefined}
    >
      <div className={promptDim || undefined}>
        <TurnPrompt
          turn={turn}
          editable={editable}
          onOpenAttachmentPreview={onOpenAttachmentPreview}
          sessionId={sessionId}
          onOpenSubagent={onOpenSubagent}
        />
      </div>
      <div className={dim ? `${ASSISTANT_TURN_GROUP_CLASS} ${dimClass(dim, leaving)}` : ASSISTANT_TURN_GROUP_CLASS}>
        <ReplyStreamingContext.Provider value={isActive}>
          <WritingReplyContext.Provider value={writingReplyId(turn, isActive)}>
            <div className={TURN_BODY_CLASS}>
              {renderTurnBody(turn, isActive, onOpenSubagent, onOpenReadFile, onOpenWorkspaceFile)}
            </div>
          </WritingReplyContext.Provider>
        </ReplyStreamingContext.Provider>
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
  return (
    before.id === after.id &&
    before.user === after.user &&
    before.messages.length === after.messages.length &&
    before.messages.every((message, index) => message === after.messages[index])
  );
}
