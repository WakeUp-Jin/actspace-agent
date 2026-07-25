import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AppShutdownNotice } from "@actspace/shared";

/**
 * 优雅退出遮罩。
 *
 * 主进程在 `before-quit` 时会 `preventDefault()` 拦下退出、先让 Kairos 收尾
 * （停循环 + abort 正在飞的 LLM 请求 + flush 写盘），并通过 `app:shutting-down`
 * 通知 renderer。这里收到通知后铺一层全屏遮罩，告诉用户「正在安全关闭」，
 * 避免用户以为软件卡死而强杀进程导致丢账。
 *
 * - 仅桌面端（`window.actspace.onShuttingDown` 存在）才挂监听；mock 模式直接 no-op。
 * - 遮罩一旦出现就不再撤下——后续要么进程退出、要么主进程 5s 超时强退。
 * - 颜色全部走主题语义类（浅/深双主题翻转），不写死字面量色值。
 */
export function ShutdownOverlay() {
  const [notice, setNotice] = useState<AppShutdownNotice | null>(null);

  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.actspace : undefined;
    if (!bridge?.onShuttingDown) return;
    const off = bridge.onShuttingDown((next) => setNotice(next));
    return off;
  }, []);

  if (!notice) return null;

  const isLocalUpdate = notice.reason === "local_update";

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={isLocalUpdate ? "Actspace 准备更新" : "Kairos 正在关闭"}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-app-bg/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 rounded-act-lg border border-line bg-surface px-9 py-8 text-center shadow-act-soft">
        <Loader2 size={30} className="animate-spin text-operational" aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[16px] font-semibold text-text-main">
            {isLocalUpdate ? "Actspace 准备替换应用…" : "Kairos 正在安全关闭…"}
          </p>
          <p className="m-0 text-[13px] leading-relaxed text-text-faint">
            {isLocalUpdate
              ? "构建已完成，当前窗口即将关闭，替换完成后会自动重新打开。"
              : "正在停止自治循环并保存数据，请稍候，窗口随后会自动关闭。"}
          </p>
        </div>
      </div>
    </div>
  );
}
