// 已配对的 Host（front-web-pwa客户端规范 §5）。v1 只保存一台，结构按列表设计。
export type SavedHost = { readonly hostId: string; readonly deviceId: string; readonly url: string; readonly token: string; readonly name: string; readonly pairedAt: string };
export type SavedHosts = { readonly version: 1; readonly activeHostId: string; readonly hosts: readonly SavedHost[] };

const KEY = "actspace.web.hosts";

function isSavedHost(value: unknown): value is SavedHost {
  if (!value || typeof value !== "object") return false;
  const host = value as Record<string, unknown>;
  return ["hostId", "deviceId", "url", "token", "name", "pairedAt"].every(key => typeof host[key] === "string" && (key === "token" || (host[key] as string).length > 0));
}

export function readSavedHosts(storage: Storage = localStorage): SavedHosts | null {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
    if (!value || value.version !== 1 || typeof value.activeHostId !== "string" || !Array.isArray(value.hosts) || !value.hosts.every(isSavedHost)) return null;
    return value as unknown as SavedHosts;
  } catch { return null; }
}

/** 当前使用的 Host；token 为空表示已失效，需要重新配对。 */
export function activeSavedHost(storage: Storage = localStorage): SavedHost | null {
  const saved = readSavedHosts(storage);
  return saved?.hosts.find(host => host.hostId === saved.activeHostId) ?? null;
}

function write(value: SavedHosts | null, storage: Storage): void {
  try {
    if (value) storage.setItem(KEY, JSON.stringify(value)); else storage.removeItem(KEY);
  } catch { /* 存储不可用时只在本次页面内有效 */ }
}

export function saveHost(host: SavedHost, storage: Storage = localStorage): void {
  write({ version: 1, activeHostId: host.hostId, hosts: [host] }, storage);
}

/** 吊销或凭据失效：保留地址和设备名，方便重新配对。 */
export function clearHostToken(hostId: string, storage: Storage = localStorage): void {
  const saved = readSavedHosts(storage);
  if (!saved) return;
  write({ ...saved, hosts: saved.hosts.map(host => (host.hostId === hostId ? { ...host, token: "" } : host)) }, storage);
}

export function removeHost(hostId: string, storage: Storage = localStorage): void {
  const saved = readSavedHosts(storage);
  if (!saved) return;
  const hosts = saved.hosts.filter(host => host.hostId !== hostId);
  write(hosts.length ? { version: 1, activeHostId: hosts[0]!.hostId, hosts } : null, storage);
}

/** 「Safari · iPhone」这样的默认设备名。 */
export function defaultDeviceName(userAgent: string = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /CriOS|Chrome\//.test(userAgent) ? "Chrome" : /FxiOS|Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "浏览器";
  const system = /iPhone/.test(userAgent) ? "iPhone" : /iPad/.test(userAgent) ? "iPad" : /Android/.test(userAgent) ? "Android" : /Mac OS X/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : "设备";
  return `${browser} · ${system}`;
}
