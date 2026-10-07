import { ActorRoster } from "./roster/ActorRoster";
import { ActorSoloChat } from "./roster/ActorSoloChat";
import { SpaceDock } from "./dock/SpaceDock";
import { SpaceDemoNotice } from "./SpaceDemoNotice";
import { SpaceNoticeToast } from "./SpaceNoticeToast";
import { SpaceThread } from "./thread/SpaceThread";
import { useSpaceDemoSelector } from "./model/use-space-demo";

/**
 * Space 演示区的中栏（设计文档 §4.1）：常驻的开发中提示 → 对话 / 名册 / 一对一 → 轻提示 → 输入区。
 * 外壳和现有会话一致（白底、顶部让出窗口标题栏），标签栏放在窗口标题栏中间，由 WorkbenchLayout 接。
 */
const SHELL_CLASS =
  "space-workbench grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-surface pt-[var(--window-chrome-strip-height)]";
const BODY_CLASS = "relative flex min-h-0 min-w-0 flex-col";
const DOCK_ZONE_CLASS = "relative grid min-w-0 w-full gap-3 overflow-visible pb-5";

export function SpaceWorkbench() {
  const view = useSpaceDemoSelector((state) => state.view);
  return (
    <main className={SHELL_CLASS} aria-label="Space（开发中演示）">
      <SpaceDemoNotice />
      <div className={BODY_CLASS}>
        {view === "roster" ? <ActorRoster /> : view === "chat" ? <ActorSoloChat /> : <SpaceThread />}
      </div>
      <div className={DOCK_ZONE_CLASS}>
        <SpaceNoticeToast />
        {view === "roster" ? null : <SpaceDock />}
      </div>
    </main>
  );
}
