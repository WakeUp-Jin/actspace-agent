import type { ReactNode } from "react";
import type { ClientSessionStore } from "@actspace/client/sessions";
import { ComposerContext, type ComposerContextValue } from "../components/composer/composer-context";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { SessionProjectionProvider } from "../session";
import { ActiveSessionContext, type ActiveSessionValue } from "../session/active-session-context";
import { SessionActionsContext, type SessionActionsValue } from "../session/session-actions-context";
import { SessionBrowseContext, type SessionBrowseState } from "../session/SessionBrowseContext";
import { SessionLocalStoreContext, type SessionLocalStore } from "../session/session-local-store";

/**
 * App 的 Provider 嵌套（14 S7）。各 value 由 App 用 `useMemo` 生成，这里只负责按固定顺序挂上。
 */
export function AppProviders({
  sessionStore,
  browse,
  localStore,
  activeSession,
  composer,
  sessionActions,
  children,
}: {
  readonly sessionStore: ClientSessionStore;
  readonly browse: SessionBrowseState;
  readonly localStore: SessionLocalStore;
  readonly activeSession: ActiveSessionValue;
  readonly composer: ComposerContextValue;
  readonly sessionActions: SessionActionsValue;
  readonly children: ReactNode;
}) {
  return (
    <SessionProjectionProvider sessionId={activeSession.sessionId} store={sessionStore}>
      <SessionBrowseContext.Provider value={browse}>
        <SessionLocalStoreContext.Provider value={localStore}>
          <ActiveSessionContext.Provider value={activeSession}>
            <ComposerContext.Provider value={composer}>
              <SessionActionsContext.Provider value={sessionActions}>
                <RightPanelProvider>{children}</RightPanelProvider>
              </SessionActionsContext.Provider>
            </ComposerContext.Provider>
          </ActiveSessionContext.Provider>
        </SessionLocalStoreContext.Provider>
      </SessionBrowseContext.Provider>
    </SessionProjectionProvider>
  );
}
