import { useEffect } from "react";
import type { ConnectionStore } from "../connection/connection-store";
import { ConnectionContext, useConnection, useConnectionStore } from "../connection/use-connection";
import { ConnectPage } from "../pages/connect/ConnectPage";
import { SessionDetail } from "../pages/session/SessionDetail";
import { NewSessionPanel } from "../pages/sessions/NewSessionPanel";
import { SessionListPane } from "../pages/sessions/SessionListPane";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { UpdateToast } from "../pwa/UpdateToast";
import { SessionListProvider } from "../sessions/use-session-list";
import { ToastProvider } from "../ui/Toast";
import { EmptyDetail, Layout } from "./Layout";
import { closeNewSession, useNewSessionOpen } from "./new-session";
import { useRoute } from "./router";
import { applyTheme, readTheme } from "./theme";
import { useWide } from "./use-wide";

function Shell() {
  const store = useConnectionStore();
  const state = useConnection();
  const route = useRoute();
  const wide = useWide();
  const newSession = useNewSessionOpen();
  useEffect(() => { store.start(); }, [store]);

  // 没有可用 token（首次、吊销、登录失效）时只显示连接页。
  if (route.name === "connect" || !state.host?.token) return <ConnectPage />;

  const selected = route.name === "session" ? route.sessionId : null;
  const list = <SessionListPane selectedSessionId={selected} />;
  const page = route.name === "session" ? <SessionDetail key={route.sessionId} sessionId={route.sessionId} /> : route.name === "settings" ? <SettingsPage /> : null;
  return (
    <Layout
      wide={wide}
      list={list}
      detail={wide ? page ?? <EmptyDetail /> : page}
      overlay={newSession ? <NewSessionPanel onClose={closeNewSession} /> : null}
    />
  );
}

/** store 由入口创建并活过整个页面：StrictMode 开发期会卸载再挂载一次，不能在卸载时 dispose。 */
export function App({ store }: { readonly store: ConnectionStore }) {
  useEffect(() => { applyTheme(readTheme()); }, []);
  return (
    <ConnectionContext.Provider value={store}>
      <ToastProvider>
        <SessionListProvider>
          <Shell />
          <UpdateToast />
        </SessionListProvider>
      </ToastProvider>
    </ConnectionContext.Provider>
  );
}
