import type { ContextPanelEvent } from "@actspace/shared";
import { formatSignedTokens } from "../../../context-format";
import { cn } from "../../ui/cn";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_TITLE_CLASS } from "./ContextPanelParts";

const KIND_LABEL: Record<ContextPanelEvent["kind"], string> = {
  inject: "注入",
  compact: "压缩",
  "tools-changed": "工具集",
  "model-switch": "模型",
  "mode-switch": "模式",
};

const KIND_CLASS: Record<ContextPanelEvent["kind"], string> = {
  inject: "bg-success-soft text-success",
  compact: "bg-danger-soft text-danger",
  "tools-changed": "border border-line bg-surface-subtle text-text-muted",
  "model-switch": "border border-line bg-surface-subtle text-text-muted",
  "mode-switch": "border border-line bg-surface-subtle text-text-muted",
};

function positionOf(event: ContextPanelEvent): string {
  if (event.turnIndex === null) return "";
  return event.stepIndex === null ? `第 ${event.turnIndex} 轮` : `第 ${event.turnIndex} 轮 · 步 ${event.stepIndex}`;
}

/** ⑤ 上下文事件：按时间倒序；token 增减增绿减红，没有增减的（如切换模型）留空。 */
export function ContextEvents({ events }: { events: readonly ContextPanelEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className={CARD_CLASS} aria-label="上下文事件">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>上下文事件</span>
      </div>
      <ul className="m-0 flex list-none flex-col px-3 pb-2.5 pt-1.5">
        {events.map((event) => {
          const delta = event.tokenDelta ?? 0;
          return (
            <li key={event.id} className="flex items-center gap-2 border-b border-dashed border-line py-[5px] text-act-xs last:border-b-0">
              <span className={cn("shrink-0 rounded-act-xs px-1.5 text-act-xxs font-medium leading-[17px]", KIND_CLASS[event.kind])}>{KIND_LABEL[event.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-text-main" title={`${event.label}${event.inferred ? "（根据请求推导）" : ""}`}>{event.label}{event.inferred ? "（根据请求推导）" : ""}</span>
              <span className="shrink-0 whitespace-nowrap text-act-xxs text-text-faint">{positionOf(event)}</span>
              <span className={cn("w-[46px] shrink-0 text-right font-semibold tabular-nums", delta > 0 ? "text-success" : "text-danger")}>
                {formatSignedTokens(delta)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
