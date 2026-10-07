import { useState } from "react";
import type { SecretProviderId, SetProviderKeyResult } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../ui/Dialog";

const PROVIDER_LABELS: Record<SecretProviderId, string> = {
  deepseek: "DeepSeek",
  kimi: "Kimi",
  openrouter: "OpenRouter",
  zhipu: "智谱 Web Search",
  tavily: "Tavily",
  tinyfish: "TinyFish",
  exa: "Exa",
  "speech-minimax": "MiniMax 语音",
  "image-generation": "图片生成服务",
};

export function ProviderKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: SecretProviderId;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<SetProviderKeyResult>;
}) {
  const label = PROVIDER_LABELS[provider];
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) {
      setError("请输入 API Key。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(value);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error ?? "保存失败，请稍后重试。");
      }
    } catch {
      setError("保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="sm" surface="raised" backdrop="overlay" withDescription className="p-5">
        <DialogTitle asChild><h3 className="text-act-lg font-bold text-text-main">连接 {label}</h3></DialogTitle>
        <DialogDescription className="mt-1.5 text-act-xs leading-relaxed text-text-faint">
          输入你的 {label} API Key，将经系统密钥串加密后保存在本机，不会以明文形式落盘或上传。
        </DialogDescription>
        <input
          type="password"
          autoFocus
          value={value}
          placeholder="sk-..."
          aria-label={`${label} API Key`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className="mt-4 h-10 w-full rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none transition-colors focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
        />
        {error ? <p className="mt-2 text-act-xs text-on-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
