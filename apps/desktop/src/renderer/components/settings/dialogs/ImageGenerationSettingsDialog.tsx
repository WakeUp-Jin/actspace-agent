import { useState } from "react";
import { ChevronRight, CircleAlert, KeyRound, ShieldCheck, X } from "lucide-react";
import type { SecretProviderId } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../ui/Dialog";
import { settingsApi } from "../../../api/settings";

export function ImageGenerationSettingsDialog({
  current,
  returnFocus,
  onClose,
  onClear,
  onRefresh,
}: {
  current: { hasApiKey: boolean; baseUrl: string; model: string };
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onClear: (provider: SecretProviderId) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [model, setModel] = useState(current.model);
  const [replaceKey, setReplaceKey] = useState(!current.hasApiKey);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpointLabel = formatImageGenerationEndpoint(baseUrl);

  const save = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      setAdvancedOpen(true);
      setError("Base URL 和模型名称不能为空。");
      return;
    }
    if (!current.hasApiKey && !apiKey.trim()) {
      setError("首次配置时请输入 API Key。");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const result = await settingsApi.updateImageGeneration({
        ...(apiKey.trim() && { apiKey }),
        baseUrl,
        model,
      });
      if (!result.ok) {
        setError(result.error ?? "保存失败。");
        return;
      }
      await onRefresh();
      onClose();
    } catch {
      setError("保存失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError(null);
    try {
      await onClear("image-generation");
      onClose();
    } catch {
      setError("断开失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  };

  return (
    // 保存或断开进行中不能关闭；点遮罩不关闭，免得丢掉刚输入的 Key。
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent size="lg" withDescription closeOnOutsideClick={false} returnFocus={returnFocus} className="max-h-[86vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-act-lg font-semibold text-text-main">
              配置图片生成服务
            </DialogTitle>
            <DialogDescription className="mt-1 text-act-xs leading-relaxed text-text-faint">
              密钥只在 main 进程解密使用；保存后从下一次图片生成调用生效。
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="关闭图片生成服务配置"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-act-md text-text-faint transition hover:bg-surface-subtle"
            onClick={onClose}
            disabled={Boolean(busy)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {current.hasApiKey && !replaceKey ? (
            <div className="flex items-center gap-3 rounded-act-lg border border-line bg-surface-subtle px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md bg-operational-soft text-operational">
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-act-sm font-semibold text-text-main">API Key 已安全保存</div>
                <p className="mt-0.5 text-act-xxs text-text-faint">出于安全原因，已保存的 Key 不会回显。</p>
              </div>
              <Button variant="secondary" autoFocus  onClick={() => setReplaceKey(true)}>
                更换 Key
              </Button>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
              API Key
              <div className="relative">
                <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <input
                  autoFocus
                  type="password"
                  value={apiKey}
                  placeholder={current.hasApiKey ? "输入新 Key；留空保持现有 Key" : "sk-..."}
                  aria-label="图片生成服务 API Key"
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-10 w-full rounded-act-md border border-line bg-surface-subtle pl-9 pr-3 text-act-sm text-text-main outline-none placeholder:text-text-subtle focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                />
              </div>
            </label>
          )}

          <div className="overflow-hidden rounded-act-lg border border-line">
            <button
              type="button"
              aria-label="高级设置"
              aria-expanded={advancedOpen}
              aria-controls="image-generation-advanced-settings"
              className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/20"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <ChevronRight size={16} className={`shrink-0 text-text-faint transition-transform ${advancedOpen ? "rotate-90" : ""}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-act-sm font-semibold text-text-main">高级设置</span>
                <span className="mt-0.5 block truncate text-act-xxs text-text-faint">{model || "未填写模型"} · {endpointLabel}</span>
              </span>
            </button>
            {advancedOpen ? (
              <div id="image-generation-advanced-settings" className="grid gap-4 border-t border-line bg-surface-subtle px-3.5 py-3.5">
                <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
                  Base URL
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="h-10 rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
                  模型名称
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="h-10 rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                  />
                </label>
                {baseUrl.trim().toLowerCase().startsWith("http://") ? (
                  <p className="flex gap-1.5 text-act-xxs leading-relaxed text-on-danger">
                    <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    当前 Base URL 使用 HTTP，API Key 和请求内容可能以未加密网络流量传输。
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div>
            {current.hasApiKey ? (
              <Button variant="danger" onClick={() => void disconnect()} disabled={Boolean(busy)}>
                {busy === "disconnect" ? "断开中…" : "断开服务"}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>取消</Button>
            <Button variant="primary" onClick={() => void save()} disabled={Boolean(busy)}>
              {busy === "save" ? "保存中…" : "保存配置"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function formatImageGenerationEndpoint(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || baseUrl;
  } catch {
    return baseUrl || "未填写地址";
  }
}
