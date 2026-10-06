import { useState, type ComponentProps, type ReactNode } from "react";
import { ConversationView } from "../../components/ConversationView";
import { Sidebar } from "../../components/Sidebar";
import { WorkbenchLayout } from "../../components/WorkbenchLayout";
import { ComposerContext, useSessionDrafts, type ComposerContextValue } from "../../components/composer/composer-context";
import { ActiveSessionContext, type ActiveSessionValue } from "../../session/active-session-context";
import { SessionActionsContext, type SessionActionsValue } from "../../session/session-actions-context";
import { createSessionLocalStore } from "../../session/session-local-store";

/**
 * 14 T18：WorkbenchLayout / ConversationView / Sidebar 改为从 Context 读取当前会话、输入框和会话操作。
 * 这里的 Test* 组件接受改造前的平铺 prop，拆进对应的 Provider，其余照常传给组件，用例不用逐个改写。
 */

const DEFAULT_ACTIVE_SESSION: ActiveSessionValue = {
  sessionId: null, title: "", messages: [], contextSnapshot: null, isStreaming: false, isAborting: false, isCompacting: false,
  isSessionReady: true, sendScrollRequestId: 0, composerFocusRequestId: 0,
};

// 用 Record 列出全部字段，Context 增减字段时这里会编译失败。
const ACTIVE_SESSION_KEYS = {
  sessionId: true, title: true, messages: true, contextSnapshot: true, contextState: true, isStreaming: true, isAborting: true,
  isCompacting: true, isSessionReady: true, sendScrollRequestId: true, composerFocusRequestId: true, onSend: true, onAbort: true,
  onRetryCompaction: true,
} satisfies Record<keyof ActiveSessionValue, true>;

const COMPOSER_KEYS = {
  draftKey: true, readDraft: true, writeDraft: true, readAnnotationDraft: true, writeAnnotationDraft: true, messageQueue: true,
  composerNotice: true, defaultModelId: true, selectedModelId: true, onSelectedModelChange: true, composerMode: true,
  onComposerModeChange: true, selectedSkills: true, onSelectedSkillsChange: true, models: true, draftRestore: true,
} satisfies Record<keyof ComposerContextValue, true>;

const SESSION_ACTION_KEYS = {
  onNewSession: true, onAddWorkspace: true, onSelectSession: true, onTogglePin: true, onRenameSession: true, onCopySessionId: true,
  onCopyTranscript: true, onForkSession: true, onArchiveSession: true, onOpenWorkspace: true, onArchiveWorkspace: true,
  onRemoveWorkspace: true,
} satisfies Record<keyof SessionActionsValue, true>;

type Picked<T> = { [K in keyof T]?: T[K] };

function split<T extends object>(props: Record<string, unknown>, keys: Record<string, true>, exclude: readonly string[] = []): { picked: Picked<T>; rest: Record<string, unknown> } {
  const picked: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key in keys && !exclude.includes(key)) picked[key] = value;
    else rest[key] = value;
  }
  return { picked: picked as Picked<T>, rest };
}

export function TestWorkbenchProviders({ activeSession, composer, sessionActions, children }: {
  readonly activeSession?: Partial<ActiveSessionValue>;
  readonly composer?: Partial<ComposerContextValue>;
  readonly sessionActions?: SessionActionsValue;
  readonly children: ReactNode;
}) {
  return (
    <ActiveSessionContext.Provider value={{ ...DEFAULT_ACTIVE_SESSION, ...activeSession }}>
      <ComposerContext.Provider value={{ composerNotice: null, ...composer }}>
        <SessionActionsContext.Provider value={sessionActions ?? {}}>{children}</SessionActionsContext.Provider>
      </ComposerContext.Provider>
    </ActiveSessionContext.Provider>
  );
}

type ConversationViewProps = ComponentProps<typeof ConversationView>;
export type TestConversationViewProps = Partial<ConversationViewProps> & Partial<ActiveSessionValue> & Partial<ComposerContextValue>;

/** ConversationView 自己的 contextSnapshot / contextState / isSessionReady 是合并后的值，仍作为 prop 传入。 */
export function TestConversationView(props: TestConversationViewProps) {
  const own = ["contextSnapshot", "contextState", "isSessionReady"];
  const active = split<ActiveSessionValue>(props, ACTIVE_SESSION_KEYS, own);
  const composer = split<ComposerContextValue>(active.rest, COMPOSER_KEYS);
  const viewProps = { contextSnapshot: null, ...composer.rest } as ConversationViewProps;
  return (
    <TestWorkbenchProviders activeSession={active.picked} composer={composer.picked}>
      <ConversationView {...viewProps} />
    </TestWorkbenchProviders>
  );
}

type SidebarProps = ComponentProps<typeof Sidebar>;
/** 改造前 Sidebar 的操作 prop 名（onRename / onFork / onArchive）与 SessionActionsContext 的不同。 */
type LegacySidebarActions = Omit<SessionActionsValue, "onRenameSession" | "onForkSession" | "onArchiveSession"> & {
  onRename?: SessionActionsValue["onRenameSession"];
  onFork?: SessionActionsValue["onForkSession"];
  onArchive?: SessionActionsValue["onArchiveSession"];
};

export function TestSidebar({ onRename, onFork, onArchive, ...props }: SidebarProps & LegacySidebarActions) {
  const actions = split<SessionActionsValue>(props, SESSION_ACTION_KEYS);
  return (
    <TestWorkbenchProviders sessionActions={{ ...actions.picked, onRenameSession: onRename, onForkSession: onFork, onArchiveSession: onArchive }}>
      <Sidebar {...actions.rest as SidebarProps} />
    </TestWorkbenchProviders>
  );
}

type WorkbenchLayoutProps = ComponentProps<typeof WorkbenchLayout>;
export type TestWorkbenchLayoutProps = WorkbenchLayoutProps & Partial<Omit<ActiveSessionValue, "sessionId">> & Partial<ComposerContextValue> & SessionActionsValue & {
  readonly activeSessionId?: string | null;
};

/** 改造前 WorkbenchLayout 没有 Provider 时用自己的内存 store 存草稿，这里保持同样的行为。 */
export function TestWorkbenchLayout({ activeSessionId = null, ...props }: TestWorkbenchLayoutProps) {
  const [localStore] = useState(createSessionLocalStore);
  const drafts = useSessionDrafts(localStore, activeSessionId);
  const active = split<ActiveSessionValue>(props, ACTIVE_SESSION_KEYS);
  const composer = split<ComposerContextValue>(active.rest, COMPOSER_KEYS);
  const actions = split<SessionActionsValue>(composer.rest, SESSION_ACTION_KEYS);
  return (
    <TestWorkbenchProviders activeSession={{ ...active.picked, sessionId: activeSessionId }} composer={{ ...drafts, ...composer.picked }} sessionActions={actions.picked}>
      <WorkbenchLayout {...actions.rest as WorkbenchLayoutProps} />
    </TestWorkbenchProviders>
  );
}
