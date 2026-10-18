import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { navigate } from "../../app/router";
import { useWide } from "../../app/use-wide";
import { useHostDescription } from "../../connection/use-connection";
import { UNTITLED, workspaceOf } from "../../sessions/session-row-model";
import { markSeen } from "../../sessions/unread-store";
import { useSessionList } from "../../sessions/use-session-list";
import { HeaderButton, PageHeader } from "../../ui/PageHeader";

/** 详情顶栏：返回（窄屏）· 标题 + 工作区名。 */
export function DetailHeader({ sessionId, title }: { readonly sessionId: string; readonly title: string | null }) {
  const wide = useWide();
  const { sessions } = useSessionList();
  const workspaces = useHostDescription()?.workspaces ?? [];
  const item = sessions?.find(session => session.sessionId === sessionId);
  const workspace = workspaceOf(item?.workspaceRoot ?? null, workspaces);
  // 打开着的会话随更新一直记为已读
  useEffect(() => { if (item) markSeen(item.sessionId, item.updatedAt); }, [item?.sessionId, item?.updatedAt]);
  const shown = title?.trim() || item?.metadata.title?.trim() || UNTITLED;
  return (
    <PageHeader
      title={shown}
      sub={<span className="truncate">{workspace.name}</span>}
      left={wide ? undefined : <HeaderButton label="返回" onClick={() => navigate({ name: "home" })}><ChevronLeft size={22} aria-hidden /></HeaderButton>}
    />
  );
}
