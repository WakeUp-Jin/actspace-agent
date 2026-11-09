/**
 * 命令行插件行下的「脚本运行时」面板：随包 Python 的版本与核心包，以及数据扩展（numpy / pandas / markitdown）的
 * 下载入口。下载在 main 进程里进行，这里每 1.5 秒拉一次状态直到结束；离线机器按提示手动放 wheel。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PythonRuntimeStatus } from "@actspace/shared";
import { Button } from "../ui/Button";
import { pythonRuntimeApi } from "../../api/python-runtime";

const POLL_INTERVAL_MS = 1_500;

export function PythonRuntimePanel() {
  const [status, setStatus] = useState<PythonRuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await pythonRuntimeApi.getStatus());
      setError(null);
    } catch {
      setError("读取脚本运行时状态失败，请重试。");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const installing = status?.extension.state === "installing";
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [installing, refresh]);

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await pythonRuntimeApi.installExtension());
    } catch {
      setError("没有开始下载，请重试。");
    } finally {
      setBusy(false);
    }
  };

  if (error && status === null) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-act-md border border-line bg-surface px-3.5 py-3 text-act-xs text-text-faint">
        {error}
        <Button size="xs" onClick={() => void refresh()}>重试</Button>
      </div>
    );
  }
  if (status === null) return <p role="status" className="px-3.5 py-3 text-act-xs text-text-faint">读取脚本运行时…</p>;

  const { runtime, extension } = status;
  return (
    <section aria-label="脚本运行时" className="grid gap-3 rounded-act-md border border-line bg-surface px-3.5 py-3.5">
      <div>
        <p className="text-act-sm font-semibold text-text-main">{runtime ? `脚本运行时 · Python ${runtime.version}` : "脚本运行时 · 未随包"}</p>
        <p className="mt-1 text-act-xs leading-relaxed text-text-faint">
          {runtime
            ? "Agent 在命令行里用 actspace-python 运行脚本，随包自带 Office / PDF 处理库，不依赖本机 Python。"
            : "这个构建没有带 Python；Agent 会退回到本机的 python3。打包版本会自带。"}
        </p>
      </div>
      {runtime ? (
        <>
          <div className="grid gap-1 text-act-xs text-text-faint">
            <p>核心包：{runtime.corePackages.join("、")}</p>
            <p className="break-all font-mono">{runtime.root}</p>
          </div>
          <div className="grid gap-2 rounded-act-md bg-surface-subtle p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-act-sm font-medium text-text-main">数据扩展</p>
                <p className="mt-px text-act-xs text-text-faint">{extension.packages.join("、")}：数据分析与文档转 Markdown 需要，按需下载一次。</p>
              </div>
              {extension.state === "ready" ? <span className="whitespace-nowrap rounded-full bg-success-soft px-2 py-px text-act-xxs text-on-success">已安装</span>
                : extension.state === "installing" ? (
                  <span role="status" className="flex items-center gap-1.5 whitespace-nowrap text-act-xs text-text-muted">
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    下载中{extension.progress ? ` ${extension.progress.completed}/${extension.progress.total}` : ""}
                  </span>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => void install()}>{extension.state === "failed" ? "重新下载" : "下载数据扩展"}</Button>
                )}
            </div>
            {extension.state === "failed" && extension.error ? <p role="alert" className="text-act-xs text-on-danger">下载失败：{extension.error}</p> : null}
            {extension.state !== "ready" ? (
              <p className="text-act-xs text-text-faint">离线机器：把对应的 wheel 文件放进下面的目录再点下载，校验通过的文件不会重复下载。<span className="block break-all font-mono">{extension.localWheelsDirectory}</span></p>
            ) : null}
          </div>
        </>
      ) : null}
      {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
    </section>
  );
}
