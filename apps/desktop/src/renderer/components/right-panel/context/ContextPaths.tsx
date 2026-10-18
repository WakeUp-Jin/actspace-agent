import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ContextDisclosureSummary } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { PATH_INITIAL_ROWS, PATH_ROW_STEP, type ContextPathVisibility } from "./context-paths-model";
import { ContextPathList } from "./ContextPathList";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS, FILTER_CHIP_CLASS, HelpHint, ROW_FOCUS_CLASS, TRACK_CLASS } from "./ContextPanelParts";
import { useContextPaths } from "./use-context-paths";

const PATHS_HINT = "活跃路径以一行「路径 — 说明」放进模型上下文，告诉模型有哪些文件可以读，不包含文件全文。活跃最多 100 条；超出的或本周期没再用到的，会在压缩时转为睡眠，只留在索引里，模型仍可按需读取。睡眠路径被重新读到后，下次压缩时回到活跃。";
const CYCLE_HINT = "每次上下文压缩开启一个新周期；活跃集合只在压缩时重新排定，读取文件不会立刻改变活跃 / 睡眠。";
const LABEL: Record<ContextPathVisibility, string> = { active: "活跃", sleeping: "睡眠" };

/**
 * 「路径」卡片（交接文档 front-Context面板Step刷新与路径展示交接.md）：周期和活跃 / 睡眠两格统计始终显示，
 * 两格兼当切换；下面的列表默认收起，点开关才按版本分页读取。路径列表不计入 Token。
 */
export function ContextPaths({ sessionId, disclosure, workspaceRoot, onStale }: {
  sessionId: string;
  disclosure: ContextDisclosureSummary | undefined;
  workspaceRoot?: string;
  onStale: () => void;
}) {
  const [visibility, setVisibility] = useState<ContextPathVisibility>("active");
  const [expanded, setExpanded] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [rows, setRows] = useState<Record<ContextPathVisibility, number>>({ active: PATH_INITIAL_ROWS, sleeping: PATH_INITIAL_ROWS });
  const ready = disclosure?.status === "ready" ? disclosure : null;
  const { list, loadMore, retry } = useContextPaths({ sessionId, disclosure, visibility, enabled: expanded && ready !== null, onStale });

  if (!ready) {
    return (
      <section className={CARD_CLASS} aria-label="路径">
        <div className={CARD_HEAD_CLASS}><span className={CARD_TITLE_CLASS}>路径</span><HelpHint text={PATHS_HINT} /></div>
        <p className="m-0 px-3 pb-3 pt-1.5 text-act-xs text-text-faint">当前会话没有路径记录。</p>
      </section>
    );
  }

  const count = visibility === "active" ? ready.activeCount : ready.sleepingCount;
  const full = ready.activeCount >= ready.activeLimit;
  const total = list?.loaded ? list.total : count;
  const shown = list ? list.paths.slice(0, rows[visibility]) : [];
  const hidden = Math.max(0, total - shown.length);
  const showMore = () => {
    const next = rows[visibility] + PATH_ROW_STEP;
    setRows(current => ({ ...current, [visibility]: next }));
    if (list && next > list.paths.length) loadMore();
  };

  return (
    <section className={CARD_CLASS} aria-label="路径">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>路径</span>
        <HelpHint text={PATHS_HINT} />
        <span className={cn(CARD_META_CLASS, "inline-flex items-center gap-1")}>第 {ready.cycle} 压缩周期<HelpHint text={CYCLE_HINT} /></span>
      </div>
      <div className="mx-3 mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-act-md border border-line bg-line">
        <SummaryCell selected={visibility === "active"} onSelect={() => setVisibility("active")} label="活跃"
          value={<>{ready.activeCount}<small className="ml-0.5 text-act-xxs font-normal text-text-faint">/ {ready.activeLimit}</small></>}>
          <span className={cn("mt-1.5 block h-1 overflow-hidden rounded-full", TRACK_CLASS)}>
            <i className={cn("block h-full rounded-full", full ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, (ready.activeCount / Math.max(1, ready.activeLimit)) * 100)}%` }} />
          </span>
        </SummaryCell>
        <SummaryCell selected={visibility === "sleeping"} onSelect={() => setVisibility("sleeping")} label="睡眠" sleeping
          value={ready.sleepingCount.toLocaleString()}>
          <span className="mt-0.5 block text-act-xxs text-text-faint">在索引中，按需读取</span>
        </SummaryCell>
      </div>
      {full ? <p className="m-0 mx-3 mt-2 rounded-act-md bg-warning-soft px-2.5 py-1.5 text-act-xxs text-warning">活跃路径已满 {ready.activeLimit} 条，之后新出现的路径会先进入睡眠。</p> : null}
      {ready.activeCount + ready.sleepingCount === 0 ? (
        <p className="m-0 px-3 pb-3 pt-2.5 text-center text-act-xs text-text-faint">还没有记录到文件路径。Agent 读写文件后会出现在这里。</p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
            {/* 列表开关是一行小字，和明细分类行同类的原生按钮。 */}
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
              className={cn("-ml-1.5 inline-flex items-center gap-1 rounded-act-sm border-0 bg-transparent py-0.5 pl-1 pr-1.5 text-act-xxs text-text-muted [cursor:pointer] hover:bg-hover-overlay hover:text-text-main", ROW_FOCUS_CLASS)}>
              <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" className={cn("shrink-0 text-text-faint transition-transform duration-(--motion-fast)", expanded && "rotate-90")} />
              <span className="tabular-nums">{expanded ? `${LABEL[visibility]} · 已显示 ${shown.length} / ${total.toLocaleString()}` : `显示${LABEL[visibility]}路径 · ${count.toLocaleString()} 条`}</span>
            </button>
            {expanded ? (
              <span className="ml-auto flex gap-1" role="group" aria-label="列表样式">
                {/* 和「对话轮次」筛选同一种小胶囊。 */}
                <button type="button" aria-pressed={grouped} onClick={() => setGrouped(true)} className={cn(FILTER_CHIP_CLASS, ROW_FOCUS_CLASS)}>按目录</button>
                <button type="button" aria-pressed={!grouped} onClick={() => setGrouped(false)} className={cn(FILTER_CHIP_CLASS, ROW_FOCUS_CLASS)}>平铺</button>
              </span>
            ) : null}
          </div>
          {expanded ? (
            <div className="pb-2">
              {list?.error ? (
                <div role="alert" className="mx-3 my-1.5 flex items-center gap-2 rounded-act-md bg-danger-soft px-2.5 py-1.5 text-act-xs text-danger">
                  <span className="min-w-0 flex-1" title={list.error}>{LABEL[visibility]}路径读取失败。</span>
                  <Button variant="secondary" size="xs" onClick={retry}>重试</Button>
                </div>
              ) : null}
              {shown.length ? <ContextPathList paths={shown} cycle={ready.cycle} grouped={grouped} workspaceRoot={workspaceRoot} /> : null}
              {!list?.loaded && !list?.error ? <p className="m-0 px-3 py-1.5 text-act-xs text-text-faint">正在读取{LABEL[visibility]}路径…</p> : null}
              {list?.loaded && !list.paths.length && !list.error ? <p className="m-0 px-3 py-1.5 text-act-xs text-text-faint">没有{LABEL[visibility]}路径。</p> : null}
              {list?.loaded && hidden > 0 && !list.error ? (
                <Button variant="ghost" size="xs" className="ml-4 mt-1" busy={list.loading} disabled={list.loading} onClick={showMore}>
                  {list.loading ? "正在读取…" : `再显示 ${Math.min(PATH_ROW_STEP, hidden)} 项（共 ${total.toLocaleString()}）`}
                </Button>
              ) : null}
              <p className="m-0 px-3 pt-2 text-center text-act-xxs text-text-faint">导航行已计入「补充上下文」，不重复计 Token</p>
            </div>
          ) : <div className="h-1.5" />}
        </>
      )}
    </section>
  );
}

function SummaryCell({ selected, onSelect, label, value, sleeping, children }: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  value: ReactNode;
  sleeping?: boolean;
  children: ReactNode;
}) {
  return (
    // 两格统计兼当列表切换，整格可点，Button 原语的尺寸和底色不适合。
    <button type="button" aria-pressed={selected} onClick={onSelect}
      className={cn(
        "relative flex flex-col justify-start border-0 bg-surface px-2.5 py-2 text-left [cursor:pointer] hover:bg-hover-overlay",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 aria-pressed:bg-surface-subtle aria-pressed:after:bg-text-main",
        ROW_FOCUS_CLASS,
      )}>
      <span className="flex items-center gap-1.5 text-act-xxs text-text-faint">
        <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", sleeping ? "border-[1.5px] border-line-strong" : "bg-success")} />
        {label}
      </span>
      <span className="mt-px block text-act-lg font-semibold tabular-nums tracking-tight text-text-main">{value}</span>
      {children}
    </button>
  );
}
