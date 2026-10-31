import type { ReactNode } from "react";
import type { ClientSessionStore } from "@actspace/client/sessions";
import { ComposerContext, type ComposerContextValue } from "../components/composer/composer-context";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { SessionProjectionProvider } from "../session";
import { ActiveSessionContext, type ActiveSessionValue } from "../session/active-session-context";
import { SessionActionsContext, type SessionActionsValue } from "../session/session-actions-context";
import { SessionBrowseContext, type SessionBrowseState } from "../session/SessionBrowseContext";
import { SessionLocalStoreContext, type SessionLocalStore } from "../session/session-local-store";
import { RunTargetContext, type RunTargetValue } from "../target/run-target-context";
import { SideChatRuntimeContext, type SideChatRuntimeValue } from "../components/right-panel/side-chat/side-chat-runtime";

/**
 * App 的 Provider 嵌套（14 S7；15 T5 加入 RunTargetContext；侧边对话加入 SideChatRuntimeContext）。各 value 由 App 用 `useMemo` 生成，这里只负责按固定顺序挂上。
 */
export function AppProviders({
  sessionStore,
  browse,
  localStore,
  activeSession,
  composer,
  sessionActions,
  runTarget,
  sideChat,
  children,
}: {
  readonly sessionStore: ClientSessionStore;
  readonly browse: SessionBrowseState;
  readonly localStore: SessionLocalStore;
  readonly activeSession: ActiveSessionValue;
  readonly composer: ComposerContextValue;
  readonly sessionActions: SessionActionsValue;
  readonly runTarget: RunTargetValue;
  /** 右栏侧边对话；单独渲染（测试）时可省略。 */
  readonly sideChat?: SideChatRuntimeValue;
  readonly children: ReactNode;
}) {
  return (
    <SessionProjectionProvider sessionId={activeSession.sessionId} store={sessionStore}>
      <SessionBrowseContext.Provider value={browse}>
        <SessionLocalStoreContext.Provider value={localStore}>
          <ActiveSessionContext.Provider value={activeSession}>
            <RunTargetContext.Provider value={runTarget}>
              <ComposerContext.Provider value={composer}>
                <SessionActionsContext.Provider value={sessionActions}>
                  <SideChatRuntimeContext.Provider value={sideChat ?? null}>
                    <RightPanelProvider>{children}</RightPanelProvider>
                  </SideChatRuntimeContext.Provider>
                </SessionActionsContext.Provider>
              </ComposerContext.Provider>
            </RunTargetContext.Provider>
          </ActiveSessionContext.Provider>
        </SessionLocalStoreContext.Provider>
      </SessionBrowseContext.Provider>
    </SessionProjectionProvider>
  );
}
