import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ContextPanelConversationKind } from "@actspace/shared";
import { formatApproxTokens, formatShare } from "../../../context-format";
import { cn } from "../../ui/cn";
import type { TrajectoryRevealTarget } from "../../../trajectory";
import { useTrajectoryNavigation } from "../../trajectory/TrajectoryNavigation";
import { CONVERSATION_FILTERS, conversationFilterOf, conversationRows, type CategoryEntry, type ContextCategory, type ConversationFilter } from "./context-panel-model";
import {
  DeltaBadge, FILTER_CHIP_CLASS, Gauge, INITIAL_ROW_LIMIT, ITEM_TITLE_CLASS, ITEM_TOKENS_CLASS, KIND_CHIP_CLASS, ROW_FOCUS_CLASS, ROW_LIMIT_STEP, ShowMoreButton,
} from "./ContextPanelParts";

const FILTER_LABEL: Record<ConversationFilter, string> = { user: "用户", assistant: "助手", "tool-call": "工具调用", "tool-result": "工具结果" };

const ROW_CLASS = "ml-[23px] mr-2 flex w-[calc(100%-31px)] items-center gap-[7px] rounded-act-sm px-1.5 py-[5px] pl-2 text-left";

function kindLabel(kind: ContextPanelConversationKind): string {
  return kind === "thinking" ? "助手 · 思考" : FILTER_LABEL[kind];
}

function revealTargetOf(entry: CategoryEntry): TrajectoryRevealTarget | null {
  if (entry.trajectoryRef?.callId) return { callId: entry.trajectoryRef.callId };
  if (entry.trajectoryRef?.messageId) return { messageId: entry.trajectoryRef.messageId };
  return null;
}

/**
 * 会话内容：只列清单，原文去轨迹看。固定最新在前，类型 chip 可多选；
 * 整行点击跳到轨迹里的对应记录，chip 行右侧「在轨迹中打开」跳到最新一条（只选一个类型时是该类型最新一条）。
 * 过渡数据没有子类型时不显示 chip，没有轨迹身份的行不可点。
 */
export function ContextConversationList({ category }: { category: ContextCategory }) {
  const navigation = useTrajectoryNavigation();
  const [filters, setFilters] = useState<readonly ConversationFilter[]>([]);
  const [limit, setLimit] = useState(INITIAL_ROW_LIMIT);
  const hasKinds = category.entries.some((entry) => entry.kind !== undefined);
  const rows = conversationRows(category.entries, filters);
  const shown = rows.slice(0, limit);
  const single = filters.length === 1 ? filters[0]! : null;

  const toggle = (filter: ConversationFilter) =>
    setFilters((current) => (current.includes(filter) ? current.filter((value) => value !== filter) : [...current, filter]));

  return (
    <div className="pb-1.5">
      {hasKinds || navigation ? (
        <div className="flex items-start gap-1.5 pb-1.5 pl-[31px] pr-3 pt-0.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {hasKinds ? CONVERSATION_FILTERS.map((filter) => (
              <button key={filter} type="button" aria-pressed={filters.includes(filter)} className={cn(FILTER_CHIP_CLASS, ROW_FOCUS_CLASS)} onClick={() => toggle(filter)}>
                {FILTER_LABEL[filter]}
                <b className="ml-1 font-semibold opacity-70">{category.entries.filter((entry) => conversationFilterOf(entry.kind) === filter).length}</b>
              </button>
            )) : null}
          </div>
          {navigation ? (
            <button type="button" onClick={() => navigation.revealInTrajectory({ latest: single })}
              className={cn("inline-flex h-[21px] shrink-0 items-center gap-0.5 whitespace-nowrap rounded-act-xs border-0 bg-transparent px-1 text-act-xxs text-text-faint [cursor:pointer] hover:text-text-main", ROW_FOCUS_CLASS)}>
              {single ? `在轨迹中打开最新${FILTER_LABEL[single]}` : "在轨迹中打开"}
              <ArrowUpRight size={11} strokeWidth={2.4} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {shown.length === 0 ? <p className="py-1.5 pl-[31px] pr-3 text-act-xs text-text-faint">没有这类条目</p> : null}
      {shown.map((entry) => {
        const target = navigation ? revealTargetOf(entry) : null;
        const content = (
          <>
            {entry.kind ? <span className={KIND_CHIP_CLASS}>{kindLabel(entry.kind)}</span> : null}
            <span className={ITEM_TITLE_CLASS}>{entry.title}</span>
            {entry.isNew ? <DeltaBadge tone="new">新增</DeltaBadge> : null}
            <Gauge share={category.totalTokens > 0 ? entry.estimatedTokens / category.totalTokens : 0} colorVar={category.colorVar}
              label={`占本类 ${formatShare(entry.estimatedTokens, category.totalTokens)}`} />
            <span className={ITEM_TOKENS_CLASS}>{formatApproxTokens(entry.estimatedTokens)}</span>
          </>
        );
        if (!target || !navigation) return <div key={entry.key} className={ROW_CLASS} title={entry.title}>{content}<span aria-hidden="true" className="w-[11px] shrink-0" /></div>;
        return (
          <button key={entry.key} type="button" title={`在轨迹中查看：${entry.title}`} onClick={() => navigation.revealInTrajectory(target)}
            className={cn("group border-0 bg-transparent [cursor:pointer] hover:bg-hover-overlay", ROW_CLASS, ROW_FOCUS_CLASS)}>
            {content}
            <ArrowUpRight size={11} strokeWidth={2.4} aria-hidden="true"
              className="shrink-0 text-text-faint opacity-0 transition-opacity duration-(--motion-fast) group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        );
      })}
      <ShowMoreButton hidden={rows.length - shown.length} total={rows.length} onClick={() => setLimit((value) => value + ROW_LIMIT_STEP)} />
    </div>
  );
}
