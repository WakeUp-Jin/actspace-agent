import { useRef, useState } from "react";
import { ChevronDown, Copy, ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import type { BrowserBridgeStatus } from "@actspace/shared";
import { Button } from "../ui/Button";

export function BrowserConnectPanel({ status, refresh }: { status: BrowserBridgeStatus | null; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const action = async (operation: () => Promise<{ ok: boolean; error?: string }> | undefined) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result?.ok) setError(result?.error ?? "操作未完成，请重试。");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作未完成，请重试。");
    } finally { actionPending.current = false; setBusy(false); }
  };
  const state = status?.runState;
  const awaiting = status?.enabled && state !== "ready";
  const title = state === "ready" ? "已连接，可以在对话中使用 Chrome"
    : state === "waiting_for_runtime" ? "Chrome 已连接，正在接入 Agent"
    : state === "awaiting_selection" ? "发现多个 Chrome 连接，请确认目标"
    : state === "host_not_installed" ? "本机组件需要修复"
    : state === "update_required" ? "Chrome 扩展需要更新"
    : state === "extension_offline" ? "等待 Chrome 扩展连接"
    : state === "error" ? "连接遇到问题"
    : state === "not_installed" ? "准备连接组件"
    : "连接 Chrome 浏览器";
  return (
    <div className="grid gap-3 rounded-act-md border border-line bg-surface px-3.5 py-3.5">
      <div>
        <p className="text-act-sm font-semibold text-text-main">{title}</p>
        <p className="mt-1 text-act-xs leading-relaxed text-text-faint">
          {state === "ready" ? "可查询标签页、读取网页，并在你批准后执行会修改页面的操作。"
            : state === "waiting_for_runtime" ? "当前任务会继续执行；安全空闲后自动启用浏览器工具。"
            : state === "awaiting_selection" ? "请在想要连接的 Chrome 用户资料中点击 ActSpace Browser 扩展图标，随后自动完成选择。"
            : awaiting ? "加载扩展后会自动检查，无需重启 ActSpace 或手动刷新。"
            : "开始连接会准备并登记随应用提供的本机组件；随后按页面指引在 Chrome 中加载扩展。"}
        </p>
      </div>
      {!status?.enabled && <Button className="justify-self-start" disabled={busy || !window.actspace.connectBrowserBridge} onClick={() => void action(() => window.actspace.connectBrowserBridge?.())}>
        {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}开始连接
      </Button>}
      {awaiting && status?.extensionDir && <div className="grid gap-2 rounded-act-md bg-surface-subtle p-3 text-act-xs text-text-muted">
        <p>在 Chrome 扩展程序页面开启“开发者模式”，点击“加载未打包的扩展程序”，选择下方目录。Chrome 的权限提示由你确认。</p>
        <p className="break-all font-mono">{status.extensionDir}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.openBrowserExtensions?.())}><ExternalLink size={14} className="mr-1.5" />打开扩展页</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void action(async () => { await navigator.clipboard.writeText(status.extensionDir!); return { ok: true }; })}><Copy size={14} className="mr-1.5" />复制目录</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.revealBrowserExtensionDirectory?.())}><FolderOpen size={14} className="mr-1.5" />在 Finder 中显示</Button>
        </div>
      </div>}
      {status?.enabled && <div className="flex flex-wrap gap-2">
        {state === "error" || state === "host_not_installed" || state === "not_installed" || state === "update_required" ? <Button variant="secondary" disabled={busy} onClick={() => void action(() => state === "update_required" ? window.actspace.prepareBrowserBridgeUpdate?.() : window.actspace.connectBrowserBridge?.())}>{state === "update_required" ? "准备更新" : "修复连接"}</Button> : null}
        <Button variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.disconnectBrowserBridge?.())}>断开连接</Button>
      </div>}
      {error && <p role="alert" className="text-act-xs text-on-danger">{error}</p>}
      {status?.lastError && <p className="text-act-xs text-on-danger">{status.lastError}</p>}
      <button type="button" aria-expanded={details} onClick={() => setDetails((value) => !value)} className="flex items-center gap-1 text-act-xs text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <ChevronDown size={14} className={details ? "" : "-rotate-90"} />连接详情
      </button>
      {details && <div className="grid gap-1 text-act-xs text-text-faint">
        <p>组件：{status?.installed ? "已安装" : "未安装"} · 扩展：{status?.bridgeReady ? "已验证" : "等待连接"} · Agent：{status?.runtimeReady ? "已接入" : "等待接入"}</p>
        {status?.selectedInstanceId && <p>目标：{status.selectedInstanceId.slice(0, 8)}</p>}
        {status?.preparedExtensionVersion && <p>扩展版本：准备 {status.preparedExtensionVersion} · 运行 {status.runningExtensionVersion ?? "未连接"}</p>}
        {status?.doctorChecks.map((check) => <p key={check.name}>{check.name}：{check.status} · {check.detail}</p>)}
        {status?.enabled && status.selectedInstanceId && <div className="mt-2 grid gap-2">
          <p>更换 Chrome 用户资料会停止当前浏览器调用。随后在目标资料中点击扩展图标确认。</p>
          <Button className="justify-self-start" variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.selectBrowserBridgeInstance?.(""))}>更换 Chrome 用户资料</Button>
        </div>}
      </div>}
      <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)} className="text-left text-act-xs text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">高级开发选项</button>
      {advanced && <div className="grid gap-2 rounded-act-md bg-surface-subtle p-3 text-act-xs text-text-faint">
        <p>可加载本地源码中的扩展，默认仍使用随应用提供的本机组件。从源码编译仅在显式点击时执行，需要 Go。</p>
        {status?.sourceRoot && <p className="break-all">源码：{status.sourceRoot}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void action(async () => {
            const selected = await window.actspace.selectWorkspaceDirectory?.();
            if (!selected?.workspaceRoot || selected.canceled) return { ok: true };
            return window.actspace.useBrowserSourceExtension?.(selected.workspaceRoot) ?? { ok: false };
          })}>选择源码扩展</Button>
          {status?.sourceRoot && <Button variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.installBrowserBridgeFromRepo?.({ repoRoot: status.sourceRoot! }))}>从源码编译</Button>}
          {status?.sourceRoot && <Button variant="secondary" disabled={busy} onClick={() => void action(() => window.actspace.useBrowserSourceExtension?.(null))}>切回随包扩展</Button>}
        </div>
        <p>更换来源后，请在 Chrome 扩展页移除旧加载位置，并按页面显示的目录重新加载。</p>
      </div>}
    </div>
  );
}
