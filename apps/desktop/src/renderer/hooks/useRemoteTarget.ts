import { useEffect, useState } from "react";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { eventsApi } from "../api/events";
import { hostsApi } from "../api/hosts";
export type HostDescription = { state: string; workspaces: { id: string; name: string; path: string }[]; models: { id: string; name: string }[]; defaultModel: string };
export function remoteSessionRef(sessionId: string | null): { hostId: string; sessionId: string } | null {
  if (!sessionId?.startsWith("host:")) return null;
  try { const pair = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(sessionId.slice(5).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)))); return { hostId: pair[0], sessionId: pair[1] }; } catch { return null; }
}
export function remoteHostId(id: string | null): string | null { return remoteSessionRef(id)?.hostId ?? null; }
export function useRemoteTarget(sessionId: string | null, sessionWorkspace?: string | null) {
  const [hosts, setHosts] = useState<HostConnection[]>([]);
  const [selectedHostId, selectHost] = useState<string | null>(null);
  const hostId = sessionId ? remoteHostId(sessionId) : selectedHostId;
  const [descriptions, setDescriptions] = useState<Record<string, HostDescription>>({});
  const [workspaceId, selectWorkspace] = useState("");
  const [models, setModels] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem("actspace:remote-models") ?? "{}"); } catch { return {}; } });
  const modelKey = sessionId ?? `new:${hostId ?? "local"}`;
  const selectModel = (value: string) => setModels(current => { const next = { ...current, [modelKey]: value }; localStorage.setItem("actspace:remote-models", JSON.stringify(next)); return next; });
  useEffect(() => {
    let live = true;
    const update = (items: HostConnection[]) => {
      if (!live) return; setHosts(items);
      for (const host of items.filter(host => host.state === "connected")) void hostsApi.call({ hostId: host.hostId, method: "host.describe", params: {} }).then(value => {
        if (live) setDescriptions(current => ({ ...current, [host.hostId]: value as HostDescription }));
      }).catch(() => undefined);
    };
    void hostsApi.list().then(update); const cleanup = eventsApi.hostsChanged(update);
    const events = eventsApi.hostEvent(({ hostId, event }) => {
      const value = event.value as { kind?: string; state?: string } | undefined;
      if (value?.kind === "state" && value.state) setDescriptions(current => current[hostId] ? { ...current, [hostId]: { ...current[hostId]!, state: value.state! } } : current);
    });
    return () => { live = false; cleanup(); events(); };
  }, []);
  useEffect(() => { void hostsApi.activate(sessionId).catch(() => undefined); }, [sessionId, hosts]);
  const description = hostId ? descriptions[hostId] : undefined;
  const host = hosts.find(item => item.hostId === hostId);
  const selectedModel = models[modelKey] ?? models[`new:${hostId ?? "local"}`] ?? description?.defaultModel ?? "";
  const model = description?.models.some(item => item.id === selectedModel) ? selectedModel : description?.defaultModel ?? "";
  useEffect(() => { selectWorkspace(description?.workspaces[0]?.id ?? ""); }, [hostId, description?.workspaces[0]?.id]);
  const effectiveWorkspaceId = sessionId && sessionWorkspace ? description?.workspaces.find(workspace => workspace.path === sessionWorkspace)?.id ?? "" : workspaceId;
  return { hosts, hostId, host, description, selectHost, workspaceId: effectiveWorkspaceId, selectWorkspace, model, selectModel, canSend: !hostId || (host?.state === "connected" && description?.state === "ready" && !!model && !!effectiveWorkspaceId) };
}
