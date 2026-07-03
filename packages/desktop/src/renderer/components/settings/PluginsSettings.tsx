/**
 * 设置页「插件」分区：管理外部二进制插件的安装、开关、运行状态与配置。
 * 当前唯一插件：fs-watch 文件监听（docs/design-docs/agent-plugins-fs-watch.md）。
 *
 * 与「Skills」分区的分工：这里管**进程**（装/跑/停/配），Skills 分区管**知识能力**的启停。
 */
import { useCallback, useEffect, useState } from "react";
import { CircleAlert, FolderPlus, Loader2, RotateCcw, X } from "lucide-react";
import type { FsWatchConfigView, FsWatchStatus } from "@actspace/shared";
import { SectionShell, SettingGroup, SettingRow, Stepper, Toggle } from "./SettingsPrimitives";

const BTN_PRIMARY =
  "inline-flex h-8 items-center rounded-act-md bg-brand px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_POLL_MS = 2000;

function hasFsWatchBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getFsWatchStatus);
}

function runStateBadge(status: FsWatchStatus): { text: string; className: string } {
  switch (status.runState) {
    case "not_installed":
      return { text: "未安装", className: "bg-surface-subtle text-text-faint" };
    case "running":
      return status.heartbeatFresh
        ? { text: "运行中", className: "bg-success-soft text-on-success" }
        : { text: "启动中", className: "bg-brand-soft text-brand" };
    case "error":
      return { text: "异常", className: "bg-danger-soft text-on-danger" };
    default:
      return { text: "已停止", className: "bg-surface-subtle text-text-faint" };
  }
}

function formatHeartbeat(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function PluginsSection() {
  const bridgeReady = hasFsWatchBridge();
  const [status, setStatus] = useState<FsWatchStatus | null>(null);
  const [config, setConfig] = useState<FsWatchConfigView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getFsWatchStatus) return;
    try {
      setStatus(await window.actspace.getFsWatchStatus());
    } catch (error) {
      console.error("Failed to load fs-watch status", error);
    }
  }, [bridgeReady]);

  const refreshConfig = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getFsWatchConfig) return;
    try {
      setConfig(await window.actspace.getFsWatchConfig());
    } catch (error) {
      console.error("Failed to load fs-watch config", error);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refreshStatus();
    void refreshConfig();
    const timer = window.setInterval(() => void refreshStatus(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatus, refreshConfig]);

  const install = async () => {
    if (!window.actspace.installFsWatchPlugin) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.actspace.installFsWatchPlugin();
      if (result.ok) {
        setMessage(`安装成功（版本 ${result.binaryVersion ?? "未知"}）。打开下方开关即可启动监听。`);
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

  const setEnabled = async (enabled: boolean) => {
    if (!window.actspace.setFsWatchEnabled) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.actspace.setFsWatchEnabled({ enabled });
      if (!result.ok) setMessage(result.error ?? "操作失败。");
      await refreshStatus();
    } catch {
      setMessage("操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
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

  const updateConfig = async (patch: Parameters<NonNullable<typeof window.actspace.updateFsWatchConfig>>[0]) => {
    if (!window.actspace.updateFsWatchConfig) return;
    try {
      setConfig(await window.actspace.updateFsWatchConfig(patch));
      await refreshStatus();
    } catch {
      setMessage("保存配置失败。");
    }
  };

  const addRoot = async () => {
    if (!window.actspace.pickFsWatchRoot || !config) return;
    const picked = await window.actspace.pickFsWatchRoot();
    if (picked.canceled || !picked.path) return;
    if (config.roots.includes(picked.path)) return;
    await updateConfig({ roots: [...config.roots, picked.path] });
  };

  const removeRoot = async (path: string) => {
    if (!config) return;
    await updateConfig({ roots: config.roots.filter((root) => root !== path) });
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
      description="插件是独立运行的本机程序，由 actspace 负责启动、守护与退出；与「Skills」不同，这里管理的是进程本身。"
    >
      <SettingGroup title="文件监听（fs-watch）">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text-main">文件监听</span>
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
                持续监听指定目录的文件创建 / 修改 / 删除 / 重命名，按天写入事件日志；开启后会自动为
                Kairos 启用同名 Skill，让它能读取这些变化。
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status?.installed ? (
                <Toggle
                  checked={Boolean(status?.enabled)}
                  onChange={(next) => void setEnabled(next)}
                  disabled={busy}
                  ariaLabel="文件监听开关"
                />
              ) : (
                <button type="button" className={BTN_PRIMARY} onClick={() => void install()} disabled={busy}>
                  {busy ? "处理中…" : "选择二进制安装"}
                </button>
              )}
            </div>
          </div>
          {status?.installed ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-faint">
              {heartbeat ? <span>最近心跳：{heartbeat}</span> : <span>暂无心跳</span>}
              {status.overflow ? (
                <span className="inline-flex items-center gap-1 text-on-danger">
                  <CircleAlert size={12} strokeWidth={2.2} /> 当日事件量超限，记录不完整
                </span>
              ) : null}
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

      {status?.installed && config ? (
        <>
          <SettingGroup title="监听目录">
            {config.roots.length === 0 ? (
              <div className="px-4 py-4 text-[13px] text-text-faint">尚未添加监听目录。</div>
            ) : (
              config.roots.map((root) => (
                <div key={root} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1 break-all text-[13px] text-text-main">{root}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-act-md text-text-faint transition hover:bg-danger-soft hover:text-on-danger"
                    aria-label={`移除监听目录 ${root}`}
                    onClick={() => void removeRoot(root)}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))
            )}
            <div className="px-4 py-3">
              <button type="button" className={BTN_SECONDARY} onClick={() => void addRoot()}>
                <FolderPlus size={14} strokeWidth={2} className="mr-1.5" />
                添加目录
              </button>
            </div>
          </SettingGroup>

          <SettingGroup title="监听参数">
            <SettingRow
              title="合并窗口"
              description="同一文件在该时间窗口内的连续变化合并为一条事件（毫秒）。"
              control={
                <Stepper
                  value={config.debounceMs}
                  onChange={(value) => void updateConfig({ debounceMs: value })}
                  min={100}
                  max={5000}
                  step={100}
                  format={(value) => `${value}ms`}
                  defaultValue={500}
                  ariaLabel="合并窗口"
                />
              }
            />
            <SettingRow
              title="日志保留"
              description="事件日志按天存储，超过保留天数自动清理。"
              control={
                <Stepper
                  value={config.retentionDays}
                  onChange={(value) => void updateConfig({ retentionDays: value })}
                  min={1}
                  max={90}
                  step={1}
                  format={(value) => `${value} 天`}
                  defaultValue={14}
                  ariaLabel="日志保留天数"
                />
              }
            />
            <SettingRow
              title="排除隐藏文件"
              description="忽略以 . 开头的文件与目录（.git、.env 等始终按名单排除）。"
              control={
                <Toggle
                  checked={config.excludeHidden}
                  onChange={(next) => void updateConfig({ excludeHidden: next })}
                  ariaLabel="排除隐藏文件"
                />
              }
            />
            <SettingRow
              title="排除名单"
              description={<span className="break-all">{config.excludeNames.join("、")}</span>}
              align="start"
            />
            <SettingRow
              title="事件输出目录"
              description={<span className="break-all">{status.outDir}</span>}
              align="start"
            />
          </SettingGroup>
        </>
      ) : null}

      {busy && !status ? (
        <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-text-faint">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : null}
    </SectionShell>
  );
}
