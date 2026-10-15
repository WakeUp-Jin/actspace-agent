import { Database } from "lucide-react";
import { useMemo, useState } from "react";
import type { TurnUsageSummary } from "@actspace/shared";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { STAT_DIALOG_CONTENT_CLASS, STAT_NOTE_CLASS, StatDialogBody, type StatRow } from "../stats/StatDialog";
import { turnUsageModel } from "./turn-usage";

// 照 DeepSeek Harness 的 TurnUsagePanel：和操作图标同色的信息胶囊；480px 以下只留图标，弹窗里照常有文字。
const PILL_CLASS =
  "turn-usage-pill inline-flex h-7 min-w-0 items-center gap-1 whitespace-nowrap rounded-act-sm border-0 bg-transparent px-2 text-act-xs text-text-faint tabular-nums transition-[background,color] duration-(--motion-base) hover:bg-hover-overlay hover:text-text-muted aria-expanded:bg-hover-overlay aria-expanded:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-[480px]:w-7 max-[480px]:justify-center max-[480px]:px-0";
const PILL_LABEL_CLASS = "min-w-0 truncate max-[480px]:hidden";

const TITLE = "本轮用量";

/** 回复尾部的「用量 88K tok」胶囊，点开是本轮 token 明细和花费。没有用量时不渲染。 */
export function TurnUsagePill({ usage }: { usage: TurnUsageSummary | undefined }) {
  const [open, setOpen] = useState(false);
  const model = useMemo(() => turnUsageModel(usage), [usage]);
  if (!model) return null;

  const rows: StatRow[] = [];
  if (model.routes) rows.push(["提供方 / 模型", model.routes]);
  if (model.cacheHit !== null) rows.push(["缓存命中", `${model.cacheHit}%`]);
  rows.push(["未缓存输入", model.input]);
  rows.push(["缓存读取", model.cacheRead]);
  rows.push(["缓存写入", model.cacheWrite]);
  rows.push([
    "输出",
    model.reasoning ? <>{model.output}<span className={STAT_NOTE_CLASS}>（其中推理 {model.reasoning}）</span></> : model.output,
  ]);
  rows.push([
    "花费",
    model.cost.kind === "known" && model.cost.estimated
      ? <>{model.cost.text}<span className={`${STAT_NOTE_CLASS} ml-1.5`}>预估</span></>
      : model.cost.text,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* 原生 button：和输入框状态栏的统计胶囊一样是纯文字入口，不要 Button 的边框和字重。 */}
        <button className={PILL_CLASS} type="button" aria-haspopup="dialog" aria-label={`${model.label}，查看本轮用量`} data-turn-usage="">
          <Database className="shrink-0" size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className={PILL_LABEL_CLASS}>{model.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} radius="lg" aria-label={TITLE} className={STAT_DIALOG_CONTENT_CLASS}>
        <StatDialogBody icon={Database} dialog={{ title: TITLE, titleValue: model.total, rows }} />
      </PopoverContent>
    </Popover>
  );
}
