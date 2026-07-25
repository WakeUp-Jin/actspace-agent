/**
 * 设置页「文件监听」分区：fs-watch 功能的开关、运行状态与监听配置
 * （docs/design-docs/agent-plugins-fs-watch.md）。
 *
 * 分工：这里面向用户管**功能**（开/关、监听哪些目录、参数）；插件二进制的
 * 安装、编译与版本管理在「插件」分区。未安装时本分区引导用户先去安装。
 */
import { useCallback, useEffect, useState } from "react";
import { CircleAlert, FolderPlus, Loader2, RotateCcw, X } from "lucide-react";
import type { FsWatchConfigView } from "@actspace/shared";
import { SectionShell, SettingGroup, SettingRow, Stepper, Toggle } from "./SettingsPrimitives";
import {
  FS_WATCH_BTN_SECONDARY,
  formatHeartbeat,
  hasFsWatchBridge,
  runStateBadge,
  useFsWatchStatus,
} from "./fs-watch-shared";

export function FileWatchSection() {
  const bridgeReady = hasFsWatchBridge();
  const { status, refreshStatus } = useFsWatchStatus(bridgeReady);
  const [config, setConfig] = useState<FsWatchConfigView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshConfig = useCallback(async () => {
    if (!bridgeReady || !window.actspace.getFsWatchConfig) return;
    try {
      setConfig(await window.actspace.getFsWatchConfig());
    } catch (error) {
      console.error("Failed to load fs-watch config", error);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

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
      <SectionShell title="文件监听" description="持续监听本机目录的文件变化，供 Kairos 读取。">
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-faint">
          文件监听仅在桌面端可用。
        </div>
      </SectionShell>
    );
  }

  if (status && !status.installed) {
    return (
      <SectionShell
        title="文件监听"
        description="持续监听指定目录的文件创建 / 修改 / 删除 / 重命名，按天写入事件日志，供 Kairos 读取。"
      >
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-faint">
          尚未安装文件监听插件（fs-watch）。请先到「插件」分区完成安装，安装后回到这里开启并配置监听。
        </div>
      </SectionShell>
    );
  }

  const badge = status ? runStateBadge(status) : null;
  const heartbeat = formatHeartbeat(status?.lastHeartbeatAt);

  return (
    <SectionShell
      title="文件监听"
      description="持续监听指定目录的文件创建 / 修改 / 删除 / 重命名，按天写入事件日志；开启后会自动为 Kairos 启用同名 Skill，让它能读取这些变化。"
    >
      <SettingGroup title="开关与状态">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text-main">启用文件监听</span>
                {badge ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                    {badge.text}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">
                关闭不会删除历史事件日志，再次开启无缝续写。
              </p>
            </div>
            <Toggle
              checked={Boolean(status?.enabled)}
              onChange={(next) => void setEnabled(next)}
              disabled={busy}
              ariaLabel="文件监听开关"
            />
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
      </SettingGroup>

      {config ? (
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
              <button type="button" className={FS_WATCH_BTN_SECONDARY} onClick={() => void addRoot()}>
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
            {status ? (
              <SettingRow
                title="事件输出目录"
                description={<span className="break-all">{status.outDir}</span>}
                align="start"
              />
            ) : null}
          </SettingGroup>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-text-faint">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      )}
    </SectionShell>
  );
}
