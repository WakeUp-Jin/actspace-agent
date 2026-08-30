import { useState } from "react";
import { CheckCircle2, ChevronDown, Copy, ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import type { BrowserBridgeStatus } from "@actspace/shared";
import { SectionShell, SettingGroup, TextField } from "./SettingsPrimitives";
import {
  PLUGIN_BTN_SECONDARY,
  hasBrowserBridge,
  useBrowserBridgeStatus,
} from "./browser-bridge-settings-shared";

const PLUGIN_REPO_ROOT_STORAGE_KEY = "actspace.plugin-repo-root.v1";

export function PluginsSection() {
  const bridgeReady = hasBrowserBridge();
  const [repoRoot, setRepoRoot] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(PLUGIN_REPO_ROOT_STORAGE_KEY),
  );
  const { status: browserStatus, refreshStatus: refreshBrowserStatus } = useBrowserBridgeStatus(bridgeReady);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserBuilding, setBrowserBuilding] = useState(false);
  const [browserChecking, setBrowserChecking] = useState(false);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);

  const pickRepoRoot = async () => {
    if (!window.actspace.selectWorkspaceDirectory) return;
    const picked = await window.actspace.selectWorkspaceDirectory();
    if (picked.canceled || !picked.workspaceRoot) return;
    setRepoRoot(picked.workspaceRoot);
    window.localStorage.setItem(PLUGIN_REPO_ROOT_STORAGE_KEY, picked.workspaceRoot);
  };

  const buildInstallBrowserBridge = async () => {
    if (!window.actspace.installBrowserBridgeFromRepo) return;
    setBrowserBusy(true);
    setBrowserBuilding(true);
    setBrowserMessage(null);
    try {
      const result = await window.actspace.installBrowserBridgeFromRepo({ repoRoot: repoRoot ?? "" });
      if (!result.ok) {
        setBrowserMessage(result.error ?? "编译安装失败。");
        await refreshBrowserStatus();
        return;
      }
      setBrowserMessage("本机桥接已准备好。请按下方提示加载或重新加载 Chrome 扩展，然后点击「检查连接」。");
      await refreshBrowserStatus();
    } catch {
      setBrowserMessage("编译安装失败，请查看主进程日志。");
    } finally {
      setBrowserBusy(false);
      setBrowserBuilding(false);
    }
  };

  const installBrowserNativeHost = async () => {
    if (!window.actspace.installBrowserBridgeNativeHost) return;
    setBrowserBusy(true);
    setBrowserMessage(null);
    try {
      const result = await window.actspace.installBrowserBridgeNativeHost();
      setBrowserMessage(
        result.ok
          ? "本机桥接已重新注册。请重新加载 Chrome 扩展后点击「检查连接」。"
          : result.error ?? "本机桥接注册失败。",
      );
      await refreshBrowserStatus();
    } catch {
      setBrowserMessage("本机桥接注册失败，请查看主进程日志。");
    } finally {
      setBrowserBusy(false);
    }
  };

  const checkBrowserConnection = async () => {
    setBrowserBusy(true);
    setBrowserChecking(true);
    setBrowserMessage("正在检查 browser-bridge 连接…");
    try {
      const next = await refreshBrowserStatus();
      if (next?.runState === "ready") {
        setBrowserMessage("连接正常，可以通过 abb 操作 Chrome。");
      } else if (next?.runState === "extension_offline") {
        setBrowserMessage("还没连上。请重新加载 Chrome 扩展，并确认权限已允许。");
      } else if (next?.runState === "host_not_installed") {
        setBrowserMessage("本机桥接还没注册。请先编译并安装，或点击「重新注册本机桥接」。");
      } else if (next?.runState === "not_installed") {
        setBrowserMessage("abb 还没安装。请先点击「编译并安装」。");
      } else {
        setBrowserMessage(next?.lastError ?? "检查失败，请查看高级诊断或主进程日志。");
      }
    } finally {
      setBrowserBusy(false);
      setBrowserChecking(false);
    }
  };

  if (!bridgeReady) {
    return (
      <SectionShell title="扩展" description="管理需要本机程序或外部桥接的扩展。">
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-faint">
          扩展管理仅在桌面端可用。
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="扩展"
      description="这里管理需要本机程序或外部桥接的扩展。后端插件由运行时配置加载，不在此处管理。"
    >
      <SettingGroup title="扩展源码">
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-text-main">扩展源码路径</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
                包含 Browser Bridge 源码的 actspace-agent 仓库路径。设置后可一键编译并安装 Browser Bridge，
                本机需要 Go 工具链。
              </p>
            </div>
            <button
              type="button"
              className={PLUGIN_BTN_SECONDARY}
              onClick={() => void pickRepoRoot()}
              disabled={browserBusy}
            >
              <FolderOpen size={14} strokeWidth={2} className="mr-1.5" />
              选择目录
            </button>
          </div>
          <TextField
            value={repoRoot ?? ""}
            placeholder="/path/to/actspace-agent"
            onCommit={(value) => {
              const next = value.trim() || null;
              setRepoRoot(next);
              if (next) window.localStorage.setItem(PLUGIN_REPO_ROOT_STORAGE_KEY, next);
              else window.localStorage.removeItem(PLUGIN_REPO_ROOT_STORAGE_KEY);
            }}
            disabled={browserBusy}
            ariaLabel="扩展源码路径"
            mono
          />
        </div>
      </SettingGroup>

      <SettingGroup title="已接入的扩展">
        <div className="px-4 py-3.5">
          <BrowserBridgeCard
            status={browserStatus}
            repoRoot={repoRoot}
            busy={browserBusy}
            building={browserBuilding}
            message={browserMessage}
            onBuildInstall={() => void buildInstallBrowserBridge()}
            onInstallHost={() => void installBrowserNativeHost()}
            onRefresh={() => void checkBrowserConnection()}
            checking={browserChecking}
          />
        </div>
      </SettingGroup>
    </SectionShell>
  );
}

function BrowserBridgeCard({
  status,
  repoRoot,
  busy,
  building,
  checking,
  message,
  onBuildInstall,
  onInstallHost,
  onRefresh,
}: {
  status: BrowserBridgeStatus | null;
  repoRoot: string | null;
  busy: boolean;
  building: boolean;
  checking: boolean;
  message: string | null;
  onBuildInstall: () => void;
  onInstallHost: () => void;
  onRefresh: () => void;
}) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const badge = browserBridgeBadge(status);
  const extensionDir = status?.extensionDir ?? (repoRoot ? `${repoRoot}/browser-bridge/apps/chrome-extension` : null);
  const bridgeReady = status?.runState === "ready";
  const hostReady = status ? status.runState !== "not_installed" && status.runState !== "host_not_installed" : false;
  const extensionReady = status?.runState === "ready";

  const copyExtensionDir = async () => {
    if (!extensionDir) return;
    await navigator.clipboard?.writeText(extensionDir);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-text-main">browser-bridge（Browser Use）</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.text}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
            通过 `abb` CLI、本机桥接和 Chrome 扩展接入真实 Chrome。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {repoRoot ? (
            <button type="button" className={PLUGIN_BTN_SECONDARY} onClick={onBuildInstall} disabled={busy}>
              {building ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> 编译中…
                </>
              ) : status?.installed ? (
                "重新编译"
              ) : (
                "编译并安装"
              )}
            </button>
          ) : null}
          <button
            type="button"
            className={PLUGIN_BTN_SECONDARY}
            onClick={onInstallHost}
            disabled={busy || !status?.installed}
            title={!status?.installed ? "请先编译并安装 abb" : "重新写入 Chrome 本机桥接登记"}
          >
            重新注册本机桥接
          </button>
          <button type="button" className={PLUGIN_BTN_SECONDARY} onClick={onRefresh} disabled={busy}>
            {checking ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" /> 检查中…
              </>
            ) : (
              "检查连接"
            )}
          </button>
        </div>
      </div>

      {building ? (
        <p className="text-[12px] text-text-faint">正在构建 `abb` 并注册本机桥接，首次构建可能需要几分钟…</p>
      ) : null}
      {!status?.installed && !repoRoot ? (
        <p className="text-[12px] text-text-faint">
          提示：在上方设置扩展源码路径后，可一键编译 Browser Bridge。
        </p>
      ) : null}
      {status?.installed ? (
        <div className="grid gap-1 text-[12px] text-text-faint">
          <StatusLine label="abb" ok={true} text={status.abbPath} />
          <StatusLine label="本机桥接" ok={hostReady} text={hostReady ? "已注册" : "未注册"} />
          <StatusLine label="Chrome 扩展" ok={extensionReady} text={extensionReady ? "已连接" : "等待加载或重新加载"} />
        </div>
      ) : null}

      {status?.installed && extensionDir && !bridgeReady ? (
        <div className="rounded-act-md border border-line bg-surface-subtle px-3 py-2.5 text-[12px] text-text-faint">
          <div className="font-semibold text-text-main">浏览器扩展需要手动加载一次</div>
          <ol className="mt-1 grid gap-0.5">
            <li>1. 打开 Chrome 的扩展程序页面，并确认开发者模式已开启。</li>
            <li>2. 点击「加载未打包的扩展程序」。</li>
            <li className="break-all">3. 选择目录：{extensionDir}</li>
            <li>4. 加载或重新加载后，回到这里点击「检查连接」。</li>
          </ol>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={PLUGIN_BTN_SECONDARY} onClick={() => void copyExtensionDir()}>
              <Copy size={14} className="mr-1.5" /> 复制扩展目录
            </button>
            <button type="button" className={PLUGIN_BTN_SECONDARY} onClick={() => window.open("chrome://extensions", "_blank")}>
              <ExternalLink size={14} className="mr-1.5" /> 打开扩展页
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-[12px] ${message.includes("失败") ? "text-on-danger" : "text-on-success"}`}>{message}</p>
      ) : null}
      {status?.lastError ? <p className="text-[12px] text-on-danger">{status.lastError}</p> : null}
      {status?.doctorChecks.length ? (
        <div className="pt-1">
          <button
            type="button"
            className="inline-flex items-center text-[12px] font-semibold text-text-faint transition hover:text-text-main"
            onClick={() => setShowDiagnostics((value) => !value)}
          >
            <ChevronDown size={14} className={`mr-1 transition ${showDiagnostics ? "" : "-rotate-90"}`} />
            高级诊断
          </button>
          {showDiagnostics ? (
            <div className="mt-1 grid gap-1 text-[12px] text-text-faint">
              {status.doctorChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-1.5">
                  <CheckCircle2
                    size={13}
                    className={check.status === "ok" ? "mt-0.5 shrink-0 text-on-success" : "mt-0.5 shrink-0 text-text-subtle"}
                  />
                  <span>
                    <span className="font-semibold text-text-main">{check.name}</span>：{check.status}
                    <span className="text-text-faint"> — {check.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusLine({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <CheckCircle2 size={13} className={ok ? "mt-0.5 shrink-0 text-on-success" : "mt-0.5 shrink-0 text-text-subtle"} />
      <span className="break-all">
        <span className="font-semibold text-text-main">{label}</span>：{text}
      </span>
    </div>
  );
}

function browserBridgeBadge(status: BrowserBridgeStatus | null): { text: string; className: string } {
  switch (status?.runState) {
    case "ready":
      return { text: "已连接", className: "bg-success-soft text-on-success" };
    case "extension_offline":
      return { text: "扩展未连接", className: "bg-warning-soft text-on-warning" };
    case "host_not_installed":
      return { text: "Host 未安装", className: "bg-warning-soft text-on-warning" };
    case "error":
      return { text: "异常", className: "bg-danger-soft text-on-danger" };
    case "not_installed":
    default:
      return { text: "未安装", className: "bg-surface-subtle text-text-faint" };
  }
}
