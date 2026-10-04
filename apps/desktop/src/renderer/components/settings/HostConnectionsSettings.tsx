import { useEffect, useState } from "react";
import type { HostConnection, HostEndpoint } from "@actspace/shared/host-protocol";
import { Button } from "../ui/Button";
const stateNames = { connected: "已连接", connecting: "连接中", offline: "离线", revoked: "设备授权已撤销", incompatible: "连接不兼容" };
const inputClass = "w-full rounded-act-sm border border-line bg-surface px-3 py-2 text-text-main focus:outline-none focus:ring-2 focus:ring-focus-ring/30";
function connectionError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/System credential encryption|safeStorage\.(?:encryptString|decryptString)|errKCAuthFailed/i.test(text)) return "本机凭据存储不可用，无法安全保存或读取服务器授权。请检查系统钥匙串或密钥环的解锁状态与访问权限后重试；若配对码已被使用，请重新生成。";
  if (/Invalid URL|WSS URL|Invalid Host endpoint/.test(text)) return "请输入有效的服务器地址，例如 wss://agent.example.com/rpc。";
  if (/Pairing code.*invalid|expired/i.test(text)) return "配对码无效或已过期，请在服务器生成新的配对码后重试。";
  if (/already connected/.test(text)) return "这台服务器已经添加，请使用已有连接。";
  if (/rate|too many/i.test(text)) return "尝试次数过多，请稍后再试。";
  if (/certificate|CERT_|self.signed/i.test(text)) return "无法验证服务器证书，请检查证书配置。";
  if (/Host key verification|REMOTE HOST IDENTIFICATION/.test(text)) return "SSH 服务器指纹未验证或已改变，请先在终端核实。";
  if (/Permission denied|authentication failed/i.test(text)) return "SSH 登录失败，请检查系统 SSH 密钥和配置。";
  if (/revoked|credential unavailable/i.test(text)) return "设备授权已失效，请移除连接后重新配对。";
  if (/identity changed|protocol|incompatible/i.test(text)) return "服务器身份或协议不匹配，请核实服务器配置。";
  return "连接未成功，请检查服务器地址、网络和服务器运行状态后重试。";
}
export function HostConnectionsSettings() {
  const [hosts, setHosts] = useState<HostConnection[]>([]);
  const [name, setName] = useState(""); const [kind, setKind] = useState<"wss" | "ssh">("wss");
  const [address, setAddress] = useState(""); const [port, setPort] = useState("4317"); const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const bridge = window.actspaceHosts; if (!bridge) return;
    let live = true;
    void bridge.list().then(value => { if (live) setHosts(value); }, error => { if (live) setError(connectionError(error)); });
    const unsubscribe = bridge.onChanged(setHosts); return () => { live = false; unsubscribe(); };
  }, []);
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); setHosts(await window.actspaceHosts!.list()); } catch (error) { setError(connectionError(error)); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-2xl space-y-6 px-8 py-7 text-text-main">
    <div><h2 className="text-lg font-semibold">Agent 服务器</h2><p className="mt-2 text-sm text-text-muted">连接自己的服务器。会话留在创建它的服务器上，关闭桌面应用后远端任务继续运行。</p></div>
    <ul className="space-y-3">{hosts.map(host => <li key={host.id} className="rounded-act-sm border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{host.name}</div><div className="mt-1 break-all text-xs text-text-muted">{host.endpoint.kind === "wss" ? host.endpoint.url : `SSH · ${host.endpoint.alias}:${host.endpoint.port}`}</div></div><span className={host.state === "connected" ? "text-operational text-xs" : "text-text-muted text-xs"}>{stateNames[host.state]}</span></div>
      {host.error && <p className="mt-2 text-sm text-danger" role="status">{connectionError(host.error)}</p>}
      <div className="mt-3 flex gap-2"><Button disabled={busy || host.state === "connecting"} onClick={() => void perform(() => window.actspaceHosts!.reconnect(host.id))}>重新连接</Button><Button disabled={busy} onClick={() => void perform(() => window.actspaceHosts!.remove(host.id))}>移除连接</Button></div>
    </li>)}</ul>
    <form className="space-y-4 rounded-act-sm border border-line p-5" onSubmit={event => { event.preventDefault(); const endpoint: HostEndpoint = kind === "wss" ? { kind, url: address.trim() } : { kind, alias: address.trim(), port: Number(port) }; void perform(async () => { await window.actspaceHosts!.add({ name, endpoint, code }); setCode(""); setName(""); setAddress(""); }); }}>
      <h3 className="font-medium">添加服务器</h3>
      <label className="block space-y-1 text-sm"><span>名称</span><input className={inputClass} value={name} onChange={event => setName(event.target.value)} required maxLength={128} placeholder="我的云端 Agent" /></label>
      <label className="block space-y-1 text-sm"><span>连接方式</span><select className={inputClass} value={kind} onChange={event => { setKind(event.target.value as "wss" | "ssh"); setAddress(""); }}><option value="wss">WSS</option><option value="ssh">SSH 隧道</option></select></label>
      <label className="block space-y-1 text-sm"><span>{kind === "wss" ? "服务器地址" : "SSH 配置别名"}</span><input className={inputClass} value={address} onChange={event => setAddress(event.target.value)} required placeholder={kind === "wss" ? "wss://agent.example.com/rpc" : "my-server"} /></label>
      {kind === "ssh" && <><label className="block space-y-1 text-sm"><span>服务器上的 Host 端口</span><input className={inputClass} type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} required /></label><p className="text-xs text-text-muted">使用系统 SSH 密钥和已验证的服务器指纹。首次连接前，请先在终端完成 SSH 连接验证。</p></>}
      <label className="block space-y-1 text-sm"><span>一次性配对码</span><input className={inputClass} type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} required maxLength={128} /></label>
      <p className="text-xs text-text-muted">在服务器运行 host pair 命令获取配对码。配对后，此设备可自动重连。</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy || !window.actspaceHosts}>{busy ? "正在连接…" : "配对并连接"}</Button>
    </form>
  </div>;
}
