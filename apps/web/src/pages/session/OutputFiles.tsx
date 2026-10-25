import { useEffect, useRef, useState } from "react";
import { useConnectionStore, useHostConnection } from "../../connection/use-connection";
import { readOutputDownload, saveOutputDownload } from "../../sessions/output-download";
import { Button } from "../../ui/Button";

function OutputFile({ sessionId, path }: { readonly sessionId: string; readonly path: string }) {
  const connection = useHostConnection();
  const store = useConnectionStore();
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBusy(false); setSize(null); setError(null);
    return () => { request.current?.abort(); request.current = null; };
  }, [connection, sessionId, path]);

  const download = async () => {
    if (!connection || request.current || store.getState().connection !== connection) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(null);
    try {
      const file = await readOutputDownload(connection.client, sessionId, path, controller.signal);
      if (controller.signal.aborted || store.getState().connection !== connection) return;
      saveOutputDownload(file);
      setSize(file.size);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "下载失败，请重试");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  };

  return (
    <div className="min-w-0 border-t border-line py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 break-all text-act-sm text-text-main">{path}</span>
        <Button className="shrink-0" busy={busy} disabled={!connection} aria-label={`下载 ${path}`} onClick={() => void download()}>{busy ? "下载中" : "下载"}</Button>
      </div>
      {size !== null ? <p className="m-0 text-act-xs text-text-muted" role="status">已请求保存 · {size.toLocaleString()} 字节</p> : null}
      {!connection ? <p className="m-0 text-act-xs text-text-muted">Host 已断开，重连后可下载</p> : null}
      {error ? <p className="m-0 break-words text-act-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

export function OutputFiles({ sessionId, paths }: { readonly sessionId: string; readonly paths: readonly string[] }) {
  if (!paths.length) return null;
  return (
    <section aria-label="产物下载" className="min-w-0 rounded-act-lg border border-line bg-surface px-3 py-2">
      <p className="mb-2 mt-0 text-act-xs text-text-muted">下载点击时的文件快照，单个文件上限 20 MiB</p>
      {paths.map(path => <OutputFile key={JSON.stringify([sessionId, path])} sessionId={sessionId} path={path} />)}
    </section>
  );
}
