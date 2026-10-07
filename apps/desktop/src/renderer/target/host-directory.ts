import { useCallback, useSyncExternalStore } from "react";
import type { HostConnection } from "@actspace/shared/host-protocol";
import type { HostEventEnvelope } from "@actspace/shared/desktop-bridge";
import { eventsApi } from "../api/events";
import { hostsApi } from "../api/hosts";

/** `host.describe` 的结果：Host 上的工作区和模型。 */
export type HostDescription = { state: string; workspaces: { id: string; name: string; path: string }[]; models: { id: string; name: string }[]; defaultModel: string };

export type HostDirectorySnapshot = {
  /** 第一次 list 已返回（成功或失败）。在此之前 `hosts` 为空不代表没有 Host。 */
  readonly loaded: boolean;
  readonly hosts: readonly HostConnection[];
  readonly listError: string | null;
  readonly descriptions: Readonly<Record<string, HostDescription>>;
  /** describe 失败的原因，按 hostId。成功后清除。 */
  readonly describeErrors: Readonly<Record<string, string>>;
  /** 正在 describe 的 Host。 */
  readonly describing: Readonly<Record<string, true>>;
};

export type HostDirectorySource = {
  list(): Promise<HostConnection[]>;
  onChanged(listener: (hosts: HostConnection[]) => void): () => void;
  onEvent(listener: (envelope: HostEventEnvelope) => void): () => void;
  describe(hostId: string): Promise<HostDescription>;
};

export interface HostDirectory {
  getSnapshot(): HostDirectorySnapshot;
  /** 快照变化时通知（useSyncExternalStore 用）。 */
  subscribe(listener: () => void): () => void;
  /** 收到 `hostsChanged` 事件时通知。第一次 list 和 `refresh()` 的结果不算「变化」，describe 结果也不触发。 */
  onHostsChanged(listener: (hosts: readonly HostConnection[]) => void): () => void;
  /** 某个 Host 从列表中消失时通知。 */
  onHostRemoved(listener: (hostId: string) => void): () => void;
  /** 重新 list 一次，返回最新的 Host 列表。 */
  refresh(): Promise<readonly HostConnection[]>;
}

const EMPTY: HostDirectorySnapshot = { loaded: false, hosts: [], listError: null, descriptions: {}, describeErrors: {}, describing: {} };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 15 S3：Host 列表和事件全局只订阅一次。
 * - 第一个消费者挂上时 list 并订阅 `hostsChanged` / `hostEvent`，最后一个退订时释放并清空（测试会在用例之间替换 bridge）。
 * - 每个 Host 在一次连接期间只 describe 一次：Host 新出现或从未连接变为已连接时才重新 describe；失败原因记在 `describeErrors`。
 * - 断开、移除或释放之后才返回的 describe 结果丢弃；list 期间收到 `hostsChanged` 时，list 的结果丢弃。
 */
export function createHostDirectory(source: HostDirectorySource): HostDirectory {
  const listeners = new Set<() => void>();
  const hostListeners = new Set<(hosts: readonly HostConnection[]) => void>();
  const removedListeners = new Set<(hostId: string) => void>();
  let consumers = 0;
  let release: (() => void) | null = null;
  let snapshot = EMPTY;
  // 每次释放加一；每个 Host 每次开始 describe 加一。旧的结果对不上就丢弃。
  let epoch = 0;
  const describeTokens = new Map<string, number>();
  let nextToken = 0;

  const emit = () => { for (const listener of [...listeners]) listener(); };
  const set = (patch: Partial<HostDirectorySnapshot>) => { snapshot = { ...snapshot, ...patch }; emit(); };

  const describe = (hostId: string) => {
    const token = ++nextToken, startedIn = epoch;
    describeTokens.set(hostId, token);
    // 上一次失败的原因在新的结果回来之前清掉，此间显示「正在读取」。
    set({ describing: { ...snapshot.describing, [hostId]: true }, describeErrors: without(snapshot.describeErrors, hostId) });
    const current = () => startedIn === epoch && describeTokens.get(hostId) === token;
    source.describe(hostId).then(
      (description) => {
        if (!current()) return;
        describeTokens.delete(hostId);
        set({ descriptions: { ...snapshot.descriptions, [hostId]: description }, describeErrors: without(snapshot.describeErrors, hostId), describing: without(snapshot.describing, hostId) });
      },
      (error: unknown) => {
        if (!current()) return;
        describeTokens.delete(hostId);
        set({ describeErrors: { ...snapshot.describeErrors, [hostId]: errorText(error) }, describing: without(snapshot.describing, hostId) });
      },
    );
  };

  const applyHosts = (hosts: HostConnection[], fromEvent: boolean) => {
    const previous = new Map(snapshot.hosts.map((host) => [host.hostId, host]));
    const removed = snapshot.loaded ? [...previous.keys()].filter((hostId) => !hosts.some((host) => host.hostId === hostId)) : [];
    let { descriptions, describeErrors, describing } = snapshot;
    for (const hostId of removed) {
      describeTokens.delete(hostId);
      descriptions = without(descriptions, hostId); describeErrors = without(describeErrors, hostId); describing = without(describing, hostId);
    }
    // 断开的 Host 作废在途的 describe，重连时重新 describe。
    for (const host of hosts) if (host.state !== "connected" && describeTokens.has(host.hostId)) {
      describeTokens.delete(host.hostId);
      describing = without(describing, host.hostId);
    }
    snapshot = { ...snapshot, loaded: true, listError: null, hosts, descriptions, describeErrors, describing };
    emit();
    for (const host of hosts) {
      if (host.state !== "connected") continue;
      const before = previous.get(host.hostId);
      // 每次连接 describe 一次；上次失败的，下一次列表变化或 refresh 时重试（在途的 describe 已清掉失败记录，不会重复发）。
      const failed = snapshot.describeErrors[host.hostId] !== undefined;
      if (!before || before.state !== "connected" || failed) describe(host.hostId);
    }
    if (fromEvent) for (const listener of [...hostListeners]) listener(hosts);
    for (const hostId of removed) for (const listener of [...removedListeners]) listener(hostId);
  };

  // list 进行中收到了 `hostsChanged`：事件更新，list 的结果作废，不能把事件里新出现的 Host 当成被移除。
  let changes = 0;
  const list = async (): Promise<readonly HostConnection[]> => {
    const startedIn = epoch, changesBefore = changes;
    try {
      const hosts = await source.list();
      if (startedIn !== epoch || !release) return hosts;
      if (changes !== changesBefore) return snapshot.hosts;
      applyHosts(hosts, false);
      return hosts;
    } catch (error) {
      if (startedIn === epoch && release) set({ loaded: true, listError: errorText(error) });
      throw error;
    }
  };

  const start = () => {
    const unchanged = source.onChanged((hosts) => { changes += 1; applyHosts(hosts, true); });
    const unevent = source.onEvent(({ hostId, event }) => {
      const value = event.value as { kind?: string; state?: string } | undefined;
      const description = snapshot.descriptions[hostId];
      if (value?.kind === "state" && value.state && description) set({ descriptions: { ...snapshot.descriptions, [hostId]: { ...description, state: value.state } } });
    });
    release = () => { unchanged(); unevent(); };
    void list().catch((error: unknown) => { console.error("Failed to list Host connections", error); });
  };

  const retain = () => {
    consumers += 1;
    if (consumers === 1) start();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      consumers -= 1;
      if (consumers > 0 || !release) return;
      const done = release;
      release = null;
      epoch += 1;
      describeTokens.clear();
      snapshot = EMPTY;
      done();
    };
  };

  const register = <T>(target: Set<T>, listener: T) => {
    target.add(listener);
    const done = retain();
    return () => { target.delete(listener); done(); };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => register(listeners, listener),
    onHostsChanged: (listener) => register(hostListeners, listener),
    onHostRemoved: (listener) => register(removedListeners, listener),
    refresh: list,
  };
}

export const hostDirectory = createHostDirectory({
  list: () => hostsApi.list(),
  onChanged: (listener) => eventsApi.hostsChanged(listener),
  onEvent: (listener) => eventsApi.hostEvent(listener),
  describe: async (hostId) => await hostsApi.call({ hostId, method: "host.describe", params: {} }) as HostDescription,
});

const subscribe = (listener: () => void) => hostDirectory.subscribe(listener);

/** 选取 HostDirectory 快照的一部分。selector 要返回快照里已有的引用或原始值，不要每次新建对象。 */
export function useHostDirectory<T>(selector: (snapshot: HostDirectorySnapshot) => T): T {
  const getSnapshot = useCallback(() => selector(hostDirectory.getSnapshot()), [selector]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
