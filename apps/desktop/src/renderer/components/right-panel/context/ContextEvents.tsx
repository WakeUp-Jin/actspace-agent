import type { ContextPanelEvent, ContextPanelEventKind } from "@actspace/shared";
import { formatSignedTokens } from "../../../context-format";
import { cn } from "../../ui/cn";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS } from "./ContextPanelParts";

const KIND_LABEL: Record<ContextPanelEventKind, string> = {
  files: "文件",
  runtime: "运行",
  subagents: "子 Agent",
  background: "后台",
  inject: "补充",
  compact: "压缩",
  "tools-changed": "工具",
  "model-switch": "模型",
  "mode-switch": "模式",
};

const NEUTRAL_CLASS = "border border-line bg-surface-subtle text-text-muted leading-4";
const KIND_CLASS: Record<ContextPanelEventKind, string> = {
  files: "bg-success-soft text-success",
  runtime: "bg-info-soft text-info",
  subagents: "bg-warning-soft text-warning",
  background: "bg-warning-soft text-warning",
  inject: NEUTRAL_CLASS,
  compact: "bg-danger-soft text-danger",
  "tools-changed": NEUTRAL_CLASS,
  "model-switch": NEUTRAL_CLASS,
  "mode-switch": NEUTRAL_CLASS,
};

/** 旧后端的事件没有 kind 映射时按「补充」显示，不崩。 */
const kindOf = (event: ContextPanelEvent): ContextPanelEventKind => (event.kind in KIND_LABEL ? event.kind : "inject");

function positionOf(event: ContextPanelEvent): string {
  if (event.turnIndex === null) return "";
  return event.stepIndex === null ? `第 ${event.turnIndex} 轮` : `第 ${event.turnIndex} 轮 · 步 ${event.stepIndex}`;
}

/** 增减：增绿减红，0 写「±0」用弱色，未知留空。 */
function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-act-xs font-semibold tabular-nums text-text-faint">±0</span>;
  return (
    <span className={cn("text-act-xs font-semibold tabular-nums", value > 0 ? "text-success" : "text-danger")}>
      {formatSignedTokens(value)}
    </span>
  );
}

/**
 * ⑤ 上下文事件（规范 §2 第 6 块）：按时间倒序。每行左边类型标签，中间标题和说明，右边 token 增减和「第 N 轮 · 步 M」。
 * 由相邻请求推导的事件只在悬停说明里写「根据请求推导」。
 */
export function ContextEvents({ events }: { events: readonly ContextPanelEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className={CARD_CLASS} aria-label="上下文事件">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>上下文事件</span>
        <span className={CARD_META_CLASS}>{events.length} 个 · 新的在上</span>
      </div>
      <ul className="m-0 flex list-none flex-col px-3 pb-2.5 pt-1">
        {events.map((event) => {
          const kind = kindOf(event);
          const label = event.count && event.count > 1 ? `${event.label} ×${event.count}` : event.label;
          const hint = [label, event.detail, event.inferred ? "根据请求推导" : ""].filter(Boolean).join("\n");
          const position = positionOf(event);
          return (
            <li
              key={event.id}
              data-context-event={kind}
              title={hint}
              className="flex items-start gap-2 border-b border-dashed border-line py-1.5 text-act-xs last:border-b-0"
            >
              <span
                className={cn(
                  "mt-px shrink-0 whitespace-nowrap rounded-act-xs px-1.5 text-act-xxs font-medium leading-4.5",
                  KIND_CLASS[kind],
                )}
              >
                {KIND_LABEL[kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-text-main">{label}</div>
                {event.detail ? (
                  <div className="mt-px truncate text-act-xxs text-text-faint">{event.detail}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <Delta value={event.tokenDelta} />
                {position ? (
                  <span className="mt-px whitespace-nowrap text-act-xxs tabular-nums text-text-faint">{position}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
