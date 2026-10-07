import { useEffect, useState } from "react";
import type { LocalUpdateState } from "@actspace/shared";
import { LocalUpdateProgressDialog, isActiveLocalUpdatePhase } from "../dialogs/LocalUpdateProgressDialog";
import { SettingGroup, SettingRow } from "../SettingsPrimitives";
import { Button } from "../../ui/Button";
import { updatesApi } from "../../../api/updates";

const LOCAL_UPDATE_POLL_MS = 700;

function isLocalUpdateActive(state: LocalUpdateState | null): boolean {
  if (!state) return false;
  return state.running || isActiveLocalUpdatePhase(state.progress.phase);
}

export function LocalUpdateSection() {
  const [state, setState] = useState<LocalUpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  useEffect(() => {
    updatesApi.getState()
      .then(setState)
      .catch(() => {
        setStatus("读取本地更新状态失败。");
      });
  }, []);

  useEffect(() => {
    if (!progressOpen && !isLocalUpdateActive(state)) return;

    let canceled = false;
    const refreshState = async () => {
      try {
        const next = await updatesApi.getState();
        if (!canceled) {
          setState(next);
          if (next.progress.phase === "failed") {
            setStatus(next.progress.message);
          }
        }
      } catch {
        if (!canceled) setStatus("读取本地更新进度失败。");
      }
    };

    void refreshState();
    const timer = window.setInterval(() => void refreshState(), LOCAL_UPDATE_POLL_MS);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [progressOpen, state?.running, state?.progress.phase]);

  const chooseSource = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await updatesApi.selectSource();
      setState(result.state);
      if (!result.canceled && !result.state.sourceValid) {
        setStatus(result.state.reason ?? "所选目录不可用于本地更新。");
      }
    } catch {
      setStatus("选择源码目录失败。");
    } finally {
      setBusy(false);
    }
  };

  const startUpdate = async () => {
    setBusy(true);
    setStatus("正在启动本地更新…");
    setProgressOpen(true);
    try {
      const result = await updatesApi.start();
      setState(result.state);
      setStatus(result.ok ? "本地更新已启动，正在构建。" : result.message ?? "本地更新启动失败。");
      if (!result.ok) setProgressOpen(false);
    } catch {
      setStatus("本地更新启动失败。");
      setProgressOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const sourceText = state?.sourceRoot ?? "尚未选择源码目录";
  const appTargetText = state?.appPath ?? "尚未识别到已安装的 Actspace.app";
  const reason = state?.reason;
  const canStart = Boolean(state?.canUpdate && !busy);
  const active = isLocalUpdateActive(state);

  return (
    <>
        <SettingGroup title="更新来源" headingLevel={3} description="从本机源码重新构建并替换已安装的 Actspace.app。">
          <SettingRow
            title="源码目录"
            description={
              <span className="break-all font-mono text-act-xs text-text-faint">
                {sourceText}
                {state?.sourceRoot && !state.sourceValid ? <span className="ml-2 text-on-danger">目录不可用</span> : null}
              </span>
            }
            control={
              <Button variant="secondary" onClick={() => void chooseSource()} disabled={busy || active}>
                选择目录
              </Button>
            }
            align="start"
          />
          <SettingRow
            title="安装目标"
            description={
              <span className="flex max-w-[430px] flex-col gap-1">
                <span className="break-all font-mono text-act-xs text-text-faint">{appTargetText}</span>
                {state?.appExecutablePath ? (
                  <span className="break-all text-text-subtle">当前进程：{state.appExecutablePath}</span>
                ) : null}
                {typeof state?.appIsPackaged === "boolean" ? (
                  <span className="text-text-subtle">Electron packaged：{state.appIsPackaged ? "是" : "否"}</span>
                ) : null}
              </span>
            }
            align="start"
          />
          <SettingRow
            title="构建并更新"
            description={
              <span className="flex max-w-[430px] flex-col gap-1">
                <span>先在当前应用内完成构建；构建完成后再退出、替换已安装的 Actspace.app 并自动重启。</span>
                {state?.logPath ? <span className="break-all text-text-subtle">日志：{state.logPath}</span> : null}
                {reason ? <span className="text-on-danger">{reason}</span> : null}
                {status ? <span className={status.includes("失败") ? "text-on-danger" : "text-text-muted"}>{status}</span> : null}
              </span>
            }
            control={
              <Button variant="primary" onClick={() => void startUpdate()} disabled={!canStart}>
                {busy || active ? "处理中…" : "构建并更新"}
              </Button>
            }
            align="start"
          />
        </SettingGroup>
      {progressOpen && state ? (
        <LocalUpdateProgressDialog state={state} onClose={() => setProgressOpen(false)} />
      ) : null}
    </>
  );
}
