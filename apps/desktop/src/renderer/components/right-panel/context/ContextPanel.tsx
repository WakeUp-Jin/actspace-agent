import { useMemo, useState } from "react";
import type { ContextState } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { buildCategories } from "./context-panel-model";
import { ContextBrowser } from "./ContextBrowser";
import { ContextEvents } from "./ContextEvents";
import { ContextOverview } from "./ContextOverview";
import { ContextPaths } from "./ContextPaths";
import { ContextStats } from "./ContextStats";
import { ContextTrend } from "./ContextTrend";
import { useContextPanel } from "./use-context-panel";

const BODY_CLASS = "flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3";
const EMPTY_CLASS = "p-[18px] text-act-sm text-text-muted";
const NOTE_CLASS = "m-0 text-center text-act-xxs text-text-faint";

/**
 * 右侧面板的 Context Tab（见 `front-右侧面板与文件渲染规范.md`「Context 面板」）：
 * 当前上下文、会话统计、路径、上下文明细、趋势、事件六块。只看占用，会话原文在轨迹里读。
 * 后端 `describeContextPanel` 未实现时是过渡视图：没有对比、趋势和事件，底部写明。
 */
export function ContextPanel({ sessionId, contextRevision, contextState, workspaceRoot }: {
  sessionId: string | null;
  contextRevision?: number;
  contextState?: ContextState | null;
  workspaceRoot?: string;
}) {
  const { data, loading, error, retry, refresh, paging, loadMore } = useContextPanel({ sessionId, revision: contextRevision, fallbackState: contextState ?? null });
  const [focus, setFocus] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);
  const view = data?.view ?? null;
  const categories = useMemo(() => (view ? buildCategories(view, { compare: compare && view.previous !== null && view.previous.comparable !== false }) : []), [view, compare]);

  if (!sessionId) return <div className={EMPTY_CLASS}>开始对话后，这里会列出喂给模型的上下文。</div>;
  const errorBar = error ? <ErrorBar message={error} onRetry={retry} /> : null;
  if (!view) {
    return (
      <div className={BODY_CLASS}>
        {errorBar}
        {error ? null : <div className={EMPTY_CLASS}>{loading ? "正在读取上下文…" : "当前没有可展示的上下文。"}</div>}
      </div>
    );
  }

  const status = view.current.status;
  return (
    <div className={BODY_CLASS} data-context-source={data?.source}>
      {errorBar}
      {status === "stale" || status === "recovering" ? (
        <p className="m-0 rounded-act-md bg-warning-soft px-2.5 py-2 text-act-xxs text-warning">{view.current.basis === "last-request" ? "当前 Context 尚未加载，以下显示最近请求输入。" : "上下文正在重建，数字可能滞后。"}</p>
      ) : null}
      {status === "unavailable" ? (
        <div className={EMPTY_CLASS}>当前没有可展示的上下文。开始对话后，这里会列出喂给模型的上下文。</div>
      ) : (
        <ContextOverview view={view} categories={categories} focus={focus} onFocus={setFocus} />
      )}
      {view.history?.error ? <ErrorBar message={view.history.error} onRetry={retry} /> : null}
      {view.history?.status === "syncing" || view.history?.status === "rebuilding" ? <p className={NOTE_CLASS}>历史索引同步中（已处理 {Math.max(0, view.history.indexedThroughSeq + 1)} / {Math.max(0, view.history.targetThroughSeq + 1)} 条记录），完整统计稍后显示。</p> : null}
      <ContextStats stats={view.stats} />
      {data?.source === "backend" ? <ContextPaths sessionId={sessionId} disclosure={view.disclosure} workspaceRoot={workspaceRoot} onStale={refresh} /> : null}
      {status === "unavailable" ? null : (
        <ContextBrowser view={view} categories={categories} compare={compare} onCompareChange={setCompare} focus={focus} />
      )}
      {view.entriesPage?.truncated ? <Button variant="secondary" size="xs" disabled={paging} onClick={() => void loadMore()}>{paging ? "正在读取…" : `加载更多明细（共 ${view.entriesPage.total} 项）`}</Button> : null}
      {data?.source === "backend" ? (
        <>
          <ContextTrend points={view.trend} />
          <ContextEvents events={view.events} />
          {view.limits?.trend.truncated || view.limits?.events.truncated ? <p className={NOTE_CLASS}>展示最近 {view.limits.trend.returnedCount} 次请求、{view.limits.events.returnedCount} 个事件；会话统计包含全部历史。</p> : null}
        </>
      ) : (
        <p className={NOTE_CLASS}>趋势、事件和路径需要后端数据，暂未提供</p>
      )}
      <p className={NOTE_CLASS}>≈ 为本地估算 · 实际值来自服务商返回的用量</p>
    </div>
  );
}

function ErrorBar({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-act-md bg-danger-soft px-2.5 py-1.5 text-act-xs text-danger">
      <div className="min-w-0 flex-1">
        <p className="m-0">上下文读取失败，请重试。</p>
        <details className="mt-1">
          <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-focus-ring">错误详情</summary>
          <p className="m-0 mt-1 whitespace-pre-wrap break-all">{message}</p>
        </details>
      </div>
      <Button variant="secondary" size="xs" className="shrink-0" onClick={onRetry}>重试</Button>
    </div>
  );
}
