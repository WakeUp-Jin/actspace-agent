import { useCallback, useSyncExternalStore } from "react";
import { groupModelsByProvider, type ProviderModelOptionLike } from "../model-option-groups";
import { useHostDirectory, type HostDescription, type HostDirectorySnapshot } from "./host-directory";
import { locateSession } from "./locate-session";
import { remoteSessionPrefs, type RemoteSessionPrefsStore } from "./remote-session-prefs";
import type { RunTarget } from "./run-target";

/** 15 S6：本机和远端共用的模型目录结构（03 §2.5）。09 的 ModelPicker 只读这个结构。 */
export type CatalogModel = { readonly id: string; readonly label: string; readonly detail?: string };
export type ModelCatalogGroup = { readonly key: string; readonly label: string; readonly models: readonly CatalogModel[] };
export type ModelCatalog = { readonly source: "local-providers" | "host"; readonly groups: readonly ModelCatalogGroup[]; readonly defaultModelId?: string };

export function localModelCatalog<T extends ProviderModelOptionLike & { readonly id: string }>(models: T[], defaultModelId?: string): ModelCatalog {
  return {
    source: "local-providers",
    groups: groupModelsByProvider(models).map((group) => ({
      key: `${group.provider}:${group.label}`,
      label: group.label,
      models: group.models.map((model) => ({ id: model.id, label: model.label, detail: model.apiModel })),
    })),
    ...(defaultModelId ? { defaultModelId } : {}),
  };
}

/** 远端只有一个分组，标题为 Host 名。describe 还没回来时没有分组。 */
export function hostModelCatalog(hostName: string, description: HostDescription | undefined): ModelCatalog {
  if (!description) return { source: "host", groups: [] };
  return {
    source: "host",
    groups: [{ key: "host", label: hostName, models: description.models.map((model) => ({ id: model.id, label: model.name })) }],
    ...(description.defaultModel ? { defaultModelId: description.defaultModel } : {}),
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const NEW_SESSION_MODEL_PREFIX = "actspace:new-session-model:";
/** 改造前远端模型的存储：`{ [sessionKey | "new:<hostId>"]: modelId }`。只在迁移中读取一次。 */
export const LEGACY_REMOTE_MODELS_KEY = "actspace:remote-models";

export interface NewSessionModelStore {
  get(hostId: string): string | undefined;
  set(hostId: string, modelId: string): void;
  subscribe(listener: () => void): () => void;
}

/** 新建页按 Host 记住上次选的模型（15 决策记录）：每个 Host 一个 key。读写失败当作没有记录。 */
export function createNewSessionModelStore(storage: () => StorageLike | undefined): NewSessionModelStore {
  const listeners = new Set<() => void>();
  return {
    get: (hostId) => {
      try { return storage()?.getItem(NEW_SESSION_MODEL_PREFIX + hostId) || undefined; } catch { return undefined; }
    },
    set: (hostId, modelId) => {
      try {
        if (storage()?.getItem(NEW_SESSION_MODEL_PREFIX + hostId) === modelId) return;
        storage()?.setItem(NEW_SESSION_MODEL_PREFIX + hostId, modelId);
      } catch { return; }
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const browserStorage = () => typeof window === "undefined" ? undefined : window.localStorage;
export const newSessionModels = createNewSessionModelStore(browserStorage);

/**
 * 一次性迁移 `actspace:remote-models`：远端会话的条目写进 remote-session-prefs，`new:<hostId>` 写进新建页记录，
 * 已有新记录的不覆盖；本机条目（`new:local`、本地会话）丢弃。迁移后删除旧 key。
 */
export function migrateLegacyRemoteModels(storage: StorageLike | undefined, prefs: RemoteSessionPrefsStore, newModels: NewSessionModelStore): void {
  let raw: string | null | undefined;
  try { raw = storage?.getItem(LEGACY_REMOTE_MODELS_KEY); } catch { return; }
  if (raw == null) return;
  let entries: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) entries = value as Record<string, unknown>;
  } catch { /* 内容损坏时直接删除。 */ }
  for (const [key, modelId] of Object.entries(entries)) {
    if (typeof modelId !== "string" || !modelId) continue;
    if (key.startsWith("new:")) {
      const hostId = key.slice(4);
      if (hostId && hostId !== "local" && !newModels.get(hostId)) newModels.set(hostId, modelId);
    } else if (locateSession(key).kind === "remote" && !prefs.get(key)?.modelId) {
      prefs.set(key, { modelId });
    }
  }
  try { storage?.removeItem(LEGACY_REMOTE_MODELS_KEY); } catch { /* 删不掉下次再迁移，结果相同。 */ }
}

/**
 * 远端当前选中的模型：会话页看会话记录，没有记录时（与改造前一致）退到该 Host 新建页上次选的；新建页看该 Host 上次选的。
 * 记录的模型 Host 上已没有时用 Host 默认模型。
 * describe 还没回来时返回记录值（可能为空串），readiness 会显示「正在读取」。
 */
export function resolveRemoteModel(recorded: string | undefined, description: HostDescription | undefined): string {
  if (!description) return recorded ?? "";
  if (recorded && description.models.some((model) => model.id === recorded)) return recorded;
  return description.defaultModel ?? "";
}

const selectDescriptions = (snapshot: HostDirectorySnapshot) => snapshot.descriptions;
const noop = () => () => {};

/** 远端模型的选择与记忆。`hostId` 为 null（本机）时返回空串，`selectModel` 不做事。 */
export function useRemoteModel(sessionId: string | null, hostId: string | null): { readonly modelId: string; readonly selectModel: (modelId: string) => void } {
  const description = useHostDirectory(selectDescriptions)[hostId ?? ""];
  const sessionRemote = sessionId !== null && locateSession(sessionId).kind === "remote";
  const recorded = useSyncExternalStore(
    !hostId ? noop : sessionRemote ? remoteSessionPrefs.subscribe : newSessionModels.subscribe,
    () => !hostId ? undefined : sessionRemote ? remoteSessionPrefs.get(sessionId!)?.modelId : newSessionModels.get(hostId),
  );
  const hostDefault = useSyncExternalStore(sessionRemote && hostId ? newSessionModels.subscribe : noop, () => sessionRemote && hostId ? newSessionModels.get(hostId) : undefined);
  const selectModel = useCallback((modelId: string) => {
    if (!hostId) return;
    if (sessionRemote) remoteSessionPrefs.set(sessionId!, { modelId });
    else newSessionModels.set(hostId, modelId);
  }, [hostId, sessionId, sessionRemote]);
  return { modelId: hostId ? resolveRemoteModel(recorded ?? hostDefault, description) : "", selectModel };
}

export type LocalModelSource<T extends ProviderModelOptionLike & { readonly id: string }> = {
  readonly models: T[];
  readonly defaultModelId?: string;
  readonly selectedModelId: string;
  readonly onSelect: (modelId: string) => void;
};

export type ModelCatalogState = { readonly catalog: ModelCatalog; readonly selectedModelId: string; readonly selectModel: (modelId: string) => void };

/**
 * 当前运行目标的模型目录和选中值。本机的选择仍由会话配置管理（调用方传入）；远端走 `useRemoteModel` 的记忆规则。
 */
export function useModelCatalog<T extends ProviderModelOptionLike & { readonly id: string }>(target: RunTarget, sessionId: string | null, local: LocalModelSource<T>): ModelCatalogState {
  const hostId = target.kind === "remote" ? target.hostId : null;
  const remote = useRemoteModel(sessionId, hostId);
  const description = useHostDirectory(selectDescriptions)[hostId ?? ""];
  if (target.kind === "remote") return { catalog: hostModelCatalog(target.hostName, description), selectedModelId: remote.modelId, selectModel: remote.selectModel };
  return { catalog: localModelCatalog(local.models, local.defaultModelId), selectedModelId: local.selectedModelId, selectModel: local.onSelect };
}
