import { Settings } from "lucide-react";
import { navigate } from "../../app/router";
import { useConnection } from "../../connection/use-connection";
import { hostDisplayName } from "../../sessions/session-row-model";
import { cx } from "../../ui/cx";
import { HeaderButton, PageHeader } from "../../ui/PageHeader";

function StatusLine() {
  const state = useConnection();
  const name = hostDisplayName(state.host?.url);
  if (state.status === "ready" && state.maintenance) return <span className="truncate text-warning">服务器维护中</span>;
  const online = state.status === "ready";
  const connecting = state.status === "connecting" || state.status === "reconnecting";
  return (
    <span className="flex min-w-0 items-center gap-1" aria-live="polite">
      <span aria-hidden className={cx("size-1.5 flex-none rounded-full", online ? "bg-success" : connecting ? "pulse-dot bg-warning" : "bg-text-faint")} />
      <span className="truncate">{name} · {online ? "在线" : connecting ? "连接中" : "离线"}</span>
    </span>
  );
}

/** 首页顶栏：回到顶部 · 「会话」+ 服务器状态 · 设置。 */
export function ListHeader({ onTop }: { readonly onTop: () => void }) {
  return (
    <PageHeader
      title="会话"
      sub={<StatusLine />}
      left={<HeaderButton label="回到顶部" onClick={onTop}><span className="text-act-md font-extrabold tracking-tight">A</span></HeaderButton>}
      right={<HeaderButton label="设置" onClick={() => navigate({ name: "settings" })}><Settings size={20} aria-hidden /></HeaderButton>}
    />
  );
}
