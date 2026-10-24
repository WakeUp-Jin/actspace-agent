import type { MessageBlock } from "@actspace/shared";
import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import { Database, FileText } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { itemBlocks, type TranscriptItem } from "../../sessions/transcript-model";
import { formatWorked, replyAssistants, turnChanges, turnUsage, workedMs, type Turn, type TurnChanges } from "../../sessions/turn-model";
import { turnUsageView } from "../../sessions/usage-format";
import { turnOutputFiles } from "../../sessions/turn-output-files";
import { Pressable } from "../../ui/Pressable";
import { cx } from "../../ui/cx";
import { AssistantText, CopyButton } from "./blocks/AssistantText";
import { BashRow } from "./blocks/BashRow";
import { DiffCard } from "./blocks/DiffCard";
import { ErrorRow } from "./blocks/ErrorRow";
import { EventRow } from "./blocks/EventRow";
import { ExploreGroup } from "./blocks/ExploreGroup";
import { GenericToolRow } from "./blocks/GenericToolRow";
import { ThinkingRow } from "./blocks/ThinkingRow";
import { TodoCard } from "./blocks/TodoCard";
import { ToolLine } from "./blocks/ToolLine";
import { UserBubble } from "./blocks/UserBubble";
import { UsageSheet } from "./UsageSheet";
import { OutputFiles } from "./OutputFiles";

function BlockView({ block, sessionId }: { readonly block: MessageBlock; readonly sessionId: string }) {
  switch (block.kind) {
    case "user": return <UserBubble text={block.content} />;
    case "assistant": return <AssistantText content={block.content} />;
    case "thinking": return <ThinkingRow title={block.title} content={block.content} running={block.status === "running"} />;
    case "edit_diff":
    case "write_diff": return <DiffCard kind={block.kind} filePath={block.filePath} additions={block.additions} deletions={block.deletions} diff={block.diff} {...(block.status ? { status: block.status } : {})} {...(block.errorMessage ? { errorMessage: block.errorMessage } : {})} />;
    case "bash": return <BashRow sessionId={sessionId} block={{ ...block, ...(block.runId ? { runId: block.runId } : {}) }} />;
    case "todo": return <TodoCard todos={block.todos} completedCount={block.completedCount} />;
    case "error": return <ErrorRow title={block.title} content={block.content} />;
    case "status":
    case "context_compaction": return <EventRow block={block} />;
    default: return <GenericToolRow block={block} />;
  }
}

// 单行过程（工具行、思考）之间 5px，其余块之间 14px。
const LINE_KINDS: ReadonlySet<string> = new Set(["assistant", "todo", "error", "status", "context_compaction", "user"]);
const isLine = (item: TranscriptItem) => item.type === "explore" || !LINE_KINDS.has(item.block.kind);

export function ItemView({ item, sessionId }: { readonly item: TranscriptItem; readonly sessionId: string }) {
  return (
    <div className={cx(isLine(item) && "tl-proc")}>
      {item.type === "explore" ? <ExploreGroup blocks={item.blocks} /> : <BlockView block={item.block} sessionId={sessionId} />}
    </div>
  );
}

function ChangesCard({ changes }: { readonly changes: TurnChanges }) {
  const count = changes.files.length;
  return (
    <div className="changes anim-rise">
      <div className="changes-head">
        <span className="changes-tile"><FileText size={18} strokeWidth={1.8} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-act-md font-medium">已编辑 {count} 个文件</b>
          <small className="text-act-xs tabular-nums"><span className="tl-add">+{changes.additions}</span> <span className="tl-del">-{changes.deletions}</span></small>
        </span>
      </div>
      {changes.files.map(file => (
        <div key={file.path} className="changes-row">
          <span className="min-w-0 flex-1 truncate" title={file.path}>{file.path}</span>
          <span className="tl-add">+{file.additions}</span><span className="tl-del">-{file.deletions}</span>
        </div>
      ))}
    </div>
  );
}

const clock = (iso: string | undefined) => {
  const time = iso ? new Date(iso) : null;
  return time && Number.isFinite(time.getTime()) ? time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
};

function TurnTail({ turn }: { readonly turn: Turn }) {
  const [usageOpen, setUsageOpen] = useState(false);
  const replies = replyAssistants(turn);
  const text = replies.map(block => block.content).join("\n\n");
  const view = turnUsageView(turnUsage(turn));
  const time = clock(replies[replies.length - 1]?.createdAt);
  return (
    <div className="tl-tail flex items-center gap-0.5 text-act-xs text-text-faint">
      <CopyButton text={text} size={15} />
      {time ? <span className="px-1.5 tabular-nums">{time}</span> : null}
      {view ? (
        <>
          <Pressable onClick={() => setUsageOpen(true)} className="inline-flex h-[26px] w-auto items-center gap-1 rounded-act-pill px-2 tabular-nums hover:bg-hover-overlay">
            <Database size={14} strokeWidth={1.75} aria-hidden />{view.label}
          </Pressable>
          <UsageSheet open={usageOpen} onOpenChange={setUsageOpen} view={view} />
        </>
      ) : null}
    </div>
  );
}

type TurnViewProps = {
  readonly turn: Turn;
  readonly sessionId: string;
  /** 正在进行的一轮：过程直接展开，不显示改动卡和尾栏。 */
  readonly active: boolean;
  /** 挂在某个过程条目后面的审批卡（按条目 key）。 */
  readonly approvalsAfter: ReadonlyMap<string, readonly ApprovalRequest[]>;
  readonly renderApproval: (request: ApprovalRequest) => ReactNode;
  /** 等模型首个输出时的占位、末尾审批卡等，放在过程最后。 */
  readonly trailing?: ReactNode;
};

/** 一轮：用户消息 →（完成后折叠成「Worked for …」的）过程 → 回复 → 改动卡 → 尾栏 → 错误 / 状态。 */
export function TurnView({ turn, sessionId, active, approvalsAfter, renderApproval, trailing }: TurnViewProps) {
  const [open, setOpen] = useState(false);
  const hasApprovals = turn.process.some(item => approvalsAfter.has(item.key));
  const folded = !active && !hasApprovals && turn.process.length > 0 && turn.reply.length > 0;
  // 等审批的命令由审批卡代替那一行（卡里已经有命令），和桌面端一致
  const process = turn.process.map(item => {
    const requests = approvalsAfter.get(item.key) ?? [];
    const replaced = requests.length > 0 && item.type === "block" && item.block.kind === "bash";
    return (
      <Fragment key={item.key}>
        {replaced ? null : <ItemView item={item} sessionId={sessionId} />}
        {requests.map(request => <div key={request.requestId}>{renderApproval(request)}</div>)}
      </Fragment>
    );
  });
  const changes = active ? null : turnChanges(turn);
  const showTail = !active && turn.reply.some(item => itemBlocks(item).some(block => block.kind === "assistant" && block.content.trim()));
  return (
    <>
      {turn.user ? <div className="tl-user flex flex-col"><UserBubble text={turn.user.content} /></div> : null}
      {folded ? (
        <div className="tl-proc">
          <ToolLine verb={formatWorked(workedMs(turn))} open={open} onToggle={() => setOpen(value => !value)}>
            <div className="timeline mt-[7px]">{process}</div>
          </ToolLine>
        </div>
      ) : process}
      {trailing}
      {turn.reply.map(item => <ItemView key={item.key} item={item} sessionId={sessionId} />)}
      {changes ? <ChangesCard changes={changes} /> : null}
      <OutputFiles sessionId={sessionId} paths={turnOutputFiles(turn)} />
      {showTail ? <TurnTail turn={turn} /> : null}
      {turn.tail.map(item => <ItemView key={item.key} item={item} sessionId={sessionId} />)}
    </>
  );
}
