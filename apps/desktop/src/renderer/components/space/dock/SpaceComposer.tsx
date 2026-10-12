import { Eye, Folder, ShieldCheck } from "lucide-react";
import type { ContextUsageSnapshot } from "@actspace/shared";
import { Composer } from "../../Composer";
import type { ComposerExecutionContext } from "../../composer/composer-types";
import { contextUsageDisplay } from "../../composer/ComposerStatusRow";
import { useSpaceDemoActions, useSpaceDemoState } from "../model/use-space-demo";
import { COORD_TAB, contextUsageOf, currentTab, nameOf, panelScope } from "../model/selectors";
import type { ContextUsage } from "../model/panel-fixtures";

// 草稿只放内存：key 按上下文区分，切换 Space / 标签 / 一对一对象时各存各的。
const drafts = new Map<string, string>();
const readDraft = (key: string): string => drafts.get(key) ?? "";
const writeDraft = (key: string, text: string): void => {
  if (text) drafts.set(key, text);
  else drafts.delete(key);
};

// 协调 Agent 没有分支和权限，状态行由这里自己画（D31），通过 Composer 的 statusRow 换掉默认那一行。
const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))";

/** mock 用量 → Composer 认识的快照；k token 换成 token */
function toSnapshot(usage: ContextUsage): ContextUsageSnapshot {
  return {
    totalTokens: Math.round(usage.total * 1000),
    maxTokens: usage.max * 1000,
    percentUsed: usage.pct,
    buckets: usage.parts.map((part) => ({ label: part.name, tokens: Math.round(part.value * 1000) })),
  };
}

function CoordStatusRow({ dirs, snapshot }: { dirs: string[]; snapshot: ContextUsageSnapshot | null }) {
  const display = contextUsageDisplay(snapshot);
  return (
    <div className={`flex min-h-5 items-center justify-between gap-3 px-3 text-act-sm leading-5 text-text-faint`} aria-label="协调 Agent 的范围">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5" title={dirs.join(", ")}>
          <Folder className="shrink-0 text-text-subtle" size={14} strokeWidth={2} aria-hidden="true" />
          <span className="truncate">{dirs.join(", ")}</span>
        </span>
        <span className="shrink-0 opacity-60" aria-hidden="true">·</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Eye className="shrink-0 text-text-subtle" size={14} strokeWidth={2} aria-hidden="true" />
          <span>只读，交事给 Actor</span>
        </span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-text-muted" title={`上下文已用 ${display.percentLabel}`}>
        <span
          className="h-[15px] w-[15px] shrink-0 rounded-full"
          aria-hidden="true"
          style={{
            background: `conic-gradient(${display.ringColor} ${display.ringPercent}%, var(--act-color-border) ${display.ringPercent}%)`,
            WebkitMask: RING_MASK,
            mask: RING_MASK,
          }}
        />
        <span>{display.percentLabel}</span>
      </span>
    </div>
  );
}

/** 把 Composer 接到演示 store：发送走 `actions.send`，占位符、草稿、状态行按当前上下文变 */
export function SpaceComposer() {
  const state = useSpaceDemoState();
  const actions = useSpaceDemoActions();
  const scope = panelScope(state);
  const usage = contextUsageOf(state);
  const tab = currentTab(state);
  const coord = state.view === "space" && tab === COORD_TAB;
  const soloId = state.view === "chat" ? state.chatWith : null;
  const actorId = state.view === "space" && !coord ? tab : null;

  let placeholder = "接下来做什么？";
  let draftKey = `space:${state.spaceId}:${tab}`;
  if (soloId) {
    placeholder = `和${nameOf(state.actors, soloId)}说…`;
    draftKey = `space-chat:${soloId}`;
  } else if (actorId) {
    placeholder = `对${nameOf(state.actors, actorId)}说…`;
  }

  const executionContext: ComposerExecutionContext | undefined = scope && !scope.coord
    ? {
        gitContext: { status: "ready", workspaceRoot: scope.dir, currentBranch: scope.branch, branches: [] },
        selectedBranch: scope.branch,
        runLocation: scope.tree ? "worktree" : "this_mac",
      }
    : undefined;

  const snapshot = usage ? toSnapshot(usage) : null;
  return (
    <Composer
      surface="followup"
      placeholder={placeholder}
      statusRow={coord ? <CoordStatusRow dirs={scope?.roots ?? []} snapshot={snapshot} /> : undefined}
      contextSnapshot={snapshot}
      onSend={(text) => actions.send(text)}
      draftKey={draftKey}
      readDraft={readDraft}
      writeDraft={writeDraft}
      executionContext={executionContext}
      onExpandContext={coord ? undefined : () => actions.openPanelTab("context")}
      permissionControl={coord ? undefined : (
        <span className="inline-flex items-center gap-1.5 text-text-muted" title="权限：自动">
          <ShieldCheck className="shrink-0 text-text-subtle" size={14} strokeWidth={2} aria-hidden="true" />
          <span>自动</span>
        </span>
      )}
    />
  );
}
