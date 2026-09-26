import { BarChart3, Folder, Hash, Sparkles } from "lucide-react";
import { MODEL_REGISTRY, resolveModelSpecByApiModel } from "@actspace/shared";
import type { ContextUsageSnapshot, SessionListItem } from "@actspace/shared";
import { selectRequestContextEstimate } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";

export type SessionHoverPreview = {
  sessionId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  model?: string;
  modelId?: string;
  contextSnapshot?: ContextUsageSnapshot | null;
};

export type SessionPreviewResolver = (session: SessionListItem) => Promise<SessionHoverPreview | null> | SessionHoverPreview | null;

const SESSION_HOVER_CARD_CLASS =
  "session-hover-card w-[min(420px,calc(100vw-32px))] rounded-act-md border border-line bg-surface-raised px-3 py-2.5 text-left text-text-main shadow-act-popover";
const SESSION_HOVER_TITLE_CLASS = "line-clamp-2 text-act-sm font-semibold leading-snug text-text-main";
const SESSION_HOVER_ROWS_CLASS = "mt-2 grid gap-1.5";
const SESSION_HOVER_ROW_CLASS = "grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-act-xs leading-[1.4] text-text-muted";
const SESSION_HOVER_ICON_CLASS = "mt-[1px] h-3.5 w-3.5 text-text-faint";
const SESSION_HOVER_PATH_CLASS = "break-all font-mono text-act-xxs leading-[1.45] text-text-muted [overflow-wrap:anywhere]";
const SESSION_HOVER_LOADING_CLASS = "mt-2 text-act-xxs text-text-faint";

function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens)) return "0";
  const safe = Math.max(0, Math.floor(tokens));
  if (safe < 1_000) return safe.toLocaleString("zh-CN");
  if (safe < 1_000_000) return `${Math.floor(safe / 1_000)}K`;
  return `${Math.floor(safe / 1_000_000)}M`;
}

function resolveModelLabel(preview: SessionHoverPreview | null | undefined): string | null {
  if (!preview) return null;
  if (preview.modelId && preview.modelId in MODEL_REGISTRY) {
    return MODEL_REGISTRY[preview.modelId as keyof typeof MODEL_REGISTRY].label;
  }
  if (preview.modelId?.includes(":")) {
    return preview.modelId;
  }
  if (preview.model) {
    return resolveModelSpecByApiModel(preview.model)?.label ?? preview.model;
  }
  return null;
}

export function SessionHoverPreviewCard({
  session,
  title,
  preview,
  loading,
}: {
  session: SessionListItem;
  title: string;
  preview: SessionHoverPreview | null;
  loading: boolean;
}) {
  const sessionProjection = useOptionalSessionProjection();
  const workspaceRoot = preview?.workspaceRoot ?? session.workspaceRoot;
  const modelLabel = resolveModelLabel(preview);
  const sessionId = preview?.sessionId ?? session.id;
  const projectionMatchesSession = sessionProjection?.sessionId === sessionId;
  const projectionCell = projectionMatchesSession ? sessionProjection?.cell ?? null : null;
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const snapshot = preview?.contextSnapshot
    ?? (projectedContextEstimate ? contextEstimateToSnapshot(projectedContextEstimate) : null);
  const hasDetails = Boolean(sessionId || workspaceRoot || modelLabel || snapshot);

  return (
    <div className={SESSION_HOVER_CARD_CLASS}>
      <div className={SESSION_HOVER_TITLE_CLASS}>{title}</div>
      {hasDetails ? (
        <div className={SESSION_HOVER_ROWS_CLASS}>
          <div className={SESSION_HOVER_ROW_CLASS}>
            <Hash size={14} strokeWidth={1.8} className={SESSION_HOVER_ICON_CLASS} aria-hidden="true" />
            <span className={SESSION_HOVER_PATH_CLASS}>sessionId: {sessionId}</span>
          </div>
          {workspaceRoot ? (
            <div className={SESSION_HOVER_ROW_CLASS}>
              <Folder size={14} strokeWidth={1.8} className={SESSION_HOVER_ICON_CLASS} aria-hidden="true" />
              <span className={SESSION_HOVER_PATH_CLASS}>{workspaceRoot}</span>
            </div>
          ) : null}
          {modelLabel ? (
            <div className={SESSION_HOVER_ROW_CLASS}>
              <Sparkles size={14} strokeWidth={1.8} className={SESSION_HOVER_ICON_CLASS} aria-hidden="true" />
              <span className="min-w-0 text-text-muted">{modelLabel}</span>
            </div>
          ) : null}
          {snapshot?.cumulativeTokens !== undefined ? (
            <div className={SESSION_HOVER_ROW_CLASS}>
              <BarChart3 size={14} className={SESSION_HOVER_ICON_CLASS} aria-hidden="true" />
              <span>累计 Token：{formatTokenCount(snapshot.cumulativeTokens)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading ? <div className={SESSION_HOVER_LOADING_CLASS}>正在加载会话详情…</div> : null}
    </div>
  );
}
