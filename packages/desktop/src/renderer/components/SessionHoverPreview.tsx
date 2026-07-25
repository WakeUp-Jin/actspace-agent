import { BarChart3, Folder, Hash, Sparkles } from "lucide-react";
import { MODEL_REGISTRY, resolveModelSpecByApiModel } from "@actspace/shared";
import type { ContextUsageSnapshot, SessionListItem } from "@actspace/shared";

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
const SESSION_HOVER_TITLE_CLASS = "line-clamp-2 text-[13px] font-semibold leading-snug text-text-main";
const SESSION_HOVER_ROWS_CLASS = "mt-2 grid gap-1.5";
const SESSION_HOVER_ROW_CLASS = "grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-[12px] leading-[1.4] text-text-muted";
const SESSION_HOVER_ICON_CLASS = "mt-[1px] h-3.5 w-3.5 text-text-faint";
const SESSION_HOVER_PATH_CLASS = "break-all font-mono text-[11px] leading-[1.45] text-text-muted [overflow-wrap:anywhere]";
const SESSION_HOVER_CONTEXT_META_CLASS = "flex min-w-0 items-center justify-between gap-3";
const SESSION_HOVER_CONTEXT_TRACK_CLASS = "mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--act-color-border-strong)]";
const SESSION_HOVER_CONTEXT_BAR_CLASS = "h-full rounded-full bg-brand";
const SESSION_HOVER_LOADING_CLASS = "mt-2 text-[11px] text-text-faint";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatTokenCount(tokens: number): string {
  return Number.isFinite(tokens) ? tokens.toLocaleString() : "0";
}

function formatContextPercent(snapshot: ContextUsageSnapshot): string {
  if (snapshot.totalTokens > 0 && snapshot.percentUsed <= 0) return "<1";
  return `${clampPercent(snapshot.percentUsed)}`;
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
  const workspaceRoot = preview?.workspaceRoot ?? session.workspaceRoot;
  const modelLabel = resolveModelLabel(preview);
  const snapshot = preview?.contextSnapshot ?? null;
  const sessionId = preview?.sessionId ?? session.id;
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
          {snapshot ? (
            <div className={SESSION_HOVER_ROW_CLASS}>
              <BarChart3 size={14} strokeWidth={1.8} className={SESSION_HOVER_ICON_CLASS} aria-hidden="true" />
              <div className="min-w-0">
                <div className={SESSION_HOVER_CONTEXT_META_CLASS}>
                  <span>Context {formatContextPercent(snapshot)}%</span>
                  <span className="whitespace-nowrap font-medium text-text-main">
                    {formatTokenCount(snapshot.totalTokens)} / {formatTokenCount(snapshot.maxTokens)}
                  </span>
                </div>
                <div className={SESSION_HOVER_CONTEXT_TRACK_CLASS} aria-hidden="true">
                  <div
                    className={SESSION_HOVER_CONTEXT_BAR_CLASS}
                    style={{ width: `${clampPercent(snapshot.percentUsed)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading ? <div className={SESSION_HOVER_LOADING_CLASS}>Loading session details...</div> : null}
    </div>
  );
}
