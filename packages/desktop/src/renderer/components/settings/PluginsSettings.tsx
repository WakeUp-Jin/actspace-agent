/**
 * 设置页「插件」分区：管理外部二进制插件的安装、编译与版本
 * （docs/design-docs/agent-plugins-fs-watch.md）。
 *
 * 分工：这里只管插件**进程的安装与生命周期入口**（仓库路径、编译安装、版本、运行状态）；
 * 文件监听功能本身的开关和监听配置在独立的「文件监听」分区，避免用户被"插件"概念挡住。
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, Copy, ExternalLink, FolderOpen, Loader2, RotateCcw } from "lucide-react";
import type { AppSettings, BrowserBridgeStatus, SettingsUpdateInput } from "@actspace/shared";
import { SectionShell, SettingGroup, TextField } from "./SettingsPrimitives";
import {
  FS_WATCH_BTN_PRIMARY,
  FS_WATCH_BTN_SECONDARY,
  formatHeartbeat,
  hasFsWatchBridge,
  runStateBadge,
  useBrowserBridgeStatus,
  useFsWatchStatus,
} from "./fs-watch-shared";

export function PluginsSection({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
}) {
  const bridgeReady = hasFsWatchBridge();
  const repoRoot = settings.plugins.repoRoot;
  const { status, refreshStatus } = useFsWatchStatus(bridgeReady);
  const { status: browserStatus, refreshStatus: refreshBrowserStatus } = useBrowserBridgeStatus(bridgeReady);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserBuilding, setBrowserBuilding] = useState(false);
  const [browserChecking, setBrowserChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);

  const install = async () => {
    if (!window.actspace.installFsWatchPlugin) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.actspace.installFsWatchPlugin();
      if (result.ok) {
        setMessage(`安装成功（版本 ${result.binaryVersion ?? "未知"}）。到「文件监听」分区打开开关即可启动。`);
      } else if (!result.canceled) {
        setMessage(result.error ?? "安装失败。");
      }
      await refreshStatus();
    } catch {
      setMessage("安装失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  /**
   * 一键路径：cargo 编译 → 安装二进制 → 直接打开开关（物化 Skill + 启动进程 + Kairos 白名单）。
   * 已在运行时先停掉旧进程，否则旧二进制会继续跑、新版本不生效（也用于升级）。
   */
  const buildInstallAndStart = async () => {
    if (!window.actspace.installFsWatchFromRepo || !window.actspace.setFsWatchEnabled) return;
    setBusy(true);
    setBuilding(true);
    setMessage(null);
    try {
      if (status?.runState === "running") {
        await window.actspace.setFsWatchEnabled({ enabled: false });
      }
      const result = await window.actspace.installFsWatchFromRepo();
      if (!result.ok) {
        setMessage(result.error ?? "编译安装失败。");
        return;
      }
      const started = await window.actspace.setFsWatchEnabled({ enabled: true });
      setMessage(
        started.ok
          ? `编译并安装成功（版本 ${result.binaryVersion ?? "未知"}），监听已启动。`
          : `安装成功，但启动失败：${started.error ?? "未知错误"}`,
      );
      await refreshStatus();
    } catch {
      setMessage("编译安装失败，请查看主进程日志。");
    } finally {
      setBusy(false);
      setBuilding(false);
    }
  };

  const pickRepoRoot = async () => {
    if (!window.actspace.pickPluginsRepoRoot) return;
    const picked = await window.actspace.pickPluginsRepoRoot();
    if (picked.canceled || !picked.path) return;
    onUpdate({ plugins: { repoRoot: picked.path } });
  };

  const retry = async () => {
    if (!window.actspace.retryFsWatch) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.actspace.retryFsWatch();
      if (!result.ok) setMessage(result.error ?? "重试失败。");
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const buildInstallBrowserBridge = async () => {
    if (!window.actspace.installBrowserBridgeFromRepo) return;
    setBrowserBusy(true);
    setBrowserBuilding(true);
    setBrowserMessage(null);
    try {
      const result = await window.actspace.installBrowserBridgeFromRepo();
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
      <SectionShell title="插件" description="管理伴随 actspace 运行的外部插件进程。">
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-faint">
          插件管理仅在桌面端可用。
        </div>
      </SectionShell>
    );
  }

  const badge = status ? runStateBadge(status) : null;
  const heartbeat = formatHeartbeat(status?.lastHeartbeatAt);

  return (
    <SectionShell
      title="插件"
      description="插件是独立运行的本机程序，由 actspace 负责启动、守护与退出；这里管理插件的安装与版本，功能开关和配置在各功能自己的分区。"
    >
      <SettingGroup title="插件仓库">
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-text-main">插件仓库路径</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
                包含 plugins/ 目录的本机仓库路径（actspace-agent 根目录）。设置后各插件可一键「编译并安装」，
                编译需要本机已安装 Go 和 Rust 工具链。
              </p>
            </div>
            <button
              type="button"
              className={FS_WATCH_BTN_SECONDARY}
              onClick={() => void pickRepoRoot()}
              disabled={busy}
            >
              <FolderOpen size={14} strokeWidth={2} className="mr-1.5" />
              选择目录
            </button>
          </div>
          <TextField
            value={repoRoot ?? ""}
            placeholder="/path/to/actspace-agent"
            onCommit={(value) => onUpdate({ plugins: { repoRoot: value.trim() || null } })}
            disabled={busy}
            ariaLabel="插件仓库路径"
            mono
          />
        </div>
      </SettingGroup>

      <SettingGroup title="已接入的插件">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text-main">fs-watch（文件监听）</span>
                {badge ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                    {badge.text}
                  </span>
                ) : null}
                {status?.binaryVersion ? (
                  <span className="text-[11px] text-text-subtle">v{status.binaryVersion}</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
                持续监听指定目录的文件变化并按天写入事件日志。开关与监听目录等配置在「文件监听」分区。
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status?.installed ? (
                repoRoot ? (
                  <button
                    type="button"
                    className={FS_WATCH_BTN_SECONDARY}
                    onClick={() => void buildInstallAndStart()}
                    disabled={busy}
                    title="从插件仓库重新编译并安装最新版本"
                  >
                    {building ? (
                      <>
                        <Loader2 size={14} className="mr-1.5 animate-spin" /> 编译中…
                      </>
                    ) : (
                      "重新编译"
                    )}
                  </button>
                ) : null
              ) : repoRoot ? (
                <>
                  <button
                    type="button"
                    className={FS_WATCH_BTN_PRIMARY}
                    onClick={() => void buildInstallAndStart()}
                    disabled={busy}
                  >
                    {building ? (
                      <>
                        <Loader2 size={14} className="mr-1.5 animate-spin" /> 编译中…
                      </>
                    ) : busy ? (
                      "处理中…"
                    ) : (
                      "编译并安装"
                    )}
                  </button>
                  <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={() => void install()} disabled={busy}>
                    选二进制
                  </button>
                </>
              ) : (
                <button type="button" className={FS_WATCH_BTN_PRIMARY} onClick={() => void install()} disabled={busy}>
                  {busy ? "处理中…" : "选择二进制安装"}
                </button>
              )}
            </div>
          </div>
          {building ? (
            <p className="text-[12px] text-text-faint">
              正在执行 cargo build --release（首次编译需下载依赖，可能需要几分钟）…
            </p>
          ) : null}
          {!status?.installed && !repoRoot ? (
            <p className="text-[12px] text-text-faint">
              提示：在上方设置插件仓库路径后，可一键「编译并安装」，无需手动构建。
            </p>
          ) : null}
          {status?.installed ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-faint">
              {heartbeat ? <span>最近心跳：{heartbeat}</span> : <span>暂无心跳</span>}
              {status.runState === "error" ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-info hover:text-info-hover hover:underline"
                  onClick={() => void retry()}
                  disabled={busy}
                >
                  <RotateCcw size={12} strokeWidth={2.2} /> 重试
                </button>
              ) : null}
            </div>
          ) : null}
          {status?.lastError ? <p className="text-[12px] text-on-danger">{status.lastError}</p> : null}
          {message ? (
            <p className={`text-[12px] ${message.includes("失败") ? "text-on-danger" : "text-on-success"}`}>{message}</p>
          ) : null}
        </div>

        <div className="border-t border-line px-4 py-3.5">
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
  const extensionDir = status?.extensionDir ?? (repoRoot ? `${repoRoot}/plugins/browser-bridge/apps/chrome-extension` : null);
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
            <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={onBuildInstall} disabled={busy}>
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
            className={FS_WATCH_BTN_SECONDARY}
            onClick={onInstallHost}
            disabled={busy || !status?.installed}
            title={!status?.installed ? "请先编译并安装 abb" : "重新写入 Chrome 本机桥接登记"}
          >
            重新注册本机桥接
          </button>
          <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={onRefresh} disabled={busy}>
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
          提示：在上方设置插件仓库路径后，可一键编译 Browser Bridge。
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
            <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={() => void copyExtensionDir()}>
              <Copy size={14} className="mr-1.5" /> 复制扩展目录
            </button>
            <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={() => window.open("chrome://extensions", "_blank")}>
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
