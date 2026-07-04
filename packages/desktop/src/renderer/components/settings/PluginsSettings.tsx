/**
 * 设置页「插件」分区：管理外部二进制插件的安装、编译与版本
 * （docs/design-docs/agent-plugins-fs-watch.md）。
 *
 * 分工：这里只管插件**进程的安装与生命周期入口**（仓库路径、编译安装、版本、运行状态）；
 * 文件监听功能本身的开关和监听配置在独立的「文件监听」分区，避免用户被"插件"概念挡住。
 */
import { useState } from "react";
import { FolderOpen, Loader2, RotateCcw } from "lucide-react";
import type { AppSettings, SettingsUpdateInput } from "@actspace/shared";
import { SectionShell, SettingGroup, TextField } from "./SettingsPrimitives";
import {
  FS_WATCH_BTN_PRIMARY,
  FS_WATCH_BTN_SECONDARY,
  formatHeartbeat,
  hasFsWatchBridge,
  runStateBadge,
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
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
              <div className="text-[14px] font-semibold text-text-main">actspace-plugins 仓库路径</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
                插件源码所在的本机仓库（git clone 下来的目录）。设置后各插件可一键「编译并安装」，
                编译需要本机已安装 Rust 工具链（rustup.rs）。
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
            placeholder="/path/to/actspace-plugins"
            onCommit={(value) => onUpdate({ plugins: { repoRoot: value.trim() || null } })}
            disabled={busy}
            ariaLabel="actspace-plugins 仓库路径"
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
              提示：在上方设置 actspace-plugins 仓库路径后，可一键「编译并安装」，无需手动构建。
            </p>
          ) : null}
          {status?.installed ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-faint">
              {heartbeat ? <span>最近心跳：{heartbeat}</span> : <span>暂无心跳</span>}
              {status.runState === "error" ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
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
      </SettingGroup>
    </SectionShell>
  );
}
