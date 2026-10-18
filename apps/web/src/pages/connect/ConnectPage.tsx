import { useState } from "react";
import { navigate } from "../../app/router";
import { defaultDeviceName } from "../../connection/saved-hosts";
import { useConnection, useConnectionStore } from "../../connection/use-connection";
import { Button } from "../../ui/Button";
import { describeConnectError, revokedMessage, type ConnectMessage } from "./connect-errors";
import { PairCodeInput } from "./PairCodeInput";

function FieldError({ id, message }: { readonly id: string; readonly message: string | undefined }) {
  return message ? <p id={id} role="alert" className="m-0 -mt-2 mb-3.5 ml-0.5 text-act-sm text-danger">{message}</p> : null;
}

/** 首次连接 / 吊销后重新配对（front-web-pwa客户端规范 §5）。 */
export function ConnectPage() {
  const store = useConnectionStore();
  const state = useConnection();
  const [url, setUrl] = useState(() => state.host?.url ?? location.origin);
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => state.host?.name || defaultDeviceName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ConnectMessage | null>(null);
  const revoked = revokedMessage(state.revokedReason);

  const submit = async () => {
    if (busy) return;
    if (!url.trim()) return setError({ field: "url", message: "请填写服务器地址" });
    if (!code.trim()) return setError({ field: "code", message: "请填写配对码" });
    setBusy(true); setError(null);
    try {
      await store.pair(url, code, name || defaultDeviceName());
      navigate({ name: "home" }, { replace: true });
    } catch (reason) {
      setError(describeConnectError(reason, url));
    } finally { setBusy(false); }
  };
  const at = (field: ConnectMessage["field"]) => (error?.field === field ? error.message : undefined);

  return (
    <div className="relative mx-auto h-dvh w-full max-w-[480px] overflow-y-auto">
      <form className="flex min-h-full flex-col px-6 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(72px,calc(env(safe-area-inset-top)+48px))]" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <img src="/icons/icon.svg" alt="" className="size-[52px] rounded-act-lg" />
        <h1 className="m-0 mb-1.5 mt-[18px] text-act-title font-semibold tracking-tight">连接你的服务器</h1>
        <p className="m-0 mb-[22px] text-act-md leading-relaxed text-text-muted">通过 agent-host 直连服务器上的 Agent，会话和审批都留在服务器上。</p>
        {revoked ? <p role="alert" className="m-0 mb-5 rounded-act-lg bg-warning-soft px-3.5 py-3 text-act-md text-on-warning">{revoked}</p> : null}
        <label className="mb-3.5 block text-act-xs font-medium text-text-faint">服务器地址
          <input id="connect-url" value={url} onChange={event => setUrl(event.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-invalid={error?.field === "url" || undefined} aria-describedby="connect-url-error" className="connect-field" />
        </label>
        <FieldError id="connect-url-error" message={at("url")} />
        <div className="mb-3.5 text-act-xs font-medium text-text-faint">配对码
          <PairCodeInput value={code} onChange={setCode} onSubmit={() => void submit()} invalid={error?.field === "code"} describedBy="connect-code-error" />
        </div>
        <FieldError id="connect-code-error" message={at("code")} />
        <p className="m-0 -mt-1.5 mb-[18px] text-act-xs leading-relaxed text-text-faint">在服务器上运行 <code className="inline-code">actspace-agent host pair --config &lt;path&gt;</code> 获取，10 分钟内有效。</p>
        <label className="mb-3.5 block text-act-xs font-medium text-text-faint">设备名称
          <input id="connect-name" value={name} onChange={event => setName(event.target.value)} maxLength={64} className="connect-field" />
        </label>
        {at("form") ? <p role="alert" className="m-0 mb-3.5 ml-0.5 text-act-sm text-danger">{at("form")}</p> : null}
        <Button type="submit" variant="primary" block busy={busy} className="mt-1 min-h-[46px] rounded-act-pill">连接</Button>
        <div className="flex-1" />
        <p className="m-0 mt-8 text-center text-act-xs text-text-faint">地址需要是 HTTPS（例如 Tailscale serve）；本机调试可用 http://127.0.0.1</p>
      </form>
    </div>
  );
}
