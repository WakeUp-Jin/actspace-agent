import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { customModelDraftFromCatalog, type InstalledModelView, type ModelMutationResult, type SettingsV4ConnectionSettings } from "@actspace/shared";
import { SettingEditor, SettingGroup, SettingTag, SettingsInput, SettingsMenuButton, Toggle, useSettingsSaveNotice } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { isKnownCatalogModel } from "./custom-connection-shared";

/**
 * 连接详情里的模型分组：刷新（从服务拉列表，新模型默认不启用）、行内添加、…菜单和启用开关。
 * 默认模型不能停用或删除。
 */
export function CustomConnectionModels({ connection, onConnectionChange, onChanged, onEdit }: {
  connection: SettingsV4ConnectionSettings;
  onConnectionChange: (connection: SettingsV4ConnectionSettings) => void;
  onChanged?: () => void | Promise<void>;
  onEdit: (model: InstalledModelView) => void;
}) {
  const notifySaved = useSettingsSaveNotice();
  const [models, setModels] = useState<InstalledModelView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InstalledModelView | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // 父组件传的是内联回调；放进 ref，避免它每次渲染都触发重新加载。
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const load = useCallback(async () => {
    const [installed, snapshot] = await Promise.all([window.actspace.listInstalledModels?.(), window.actspace.getSettingsV4?.()]);
    setModels((installed?.models ?? []).filter((model) => model.settings.connectionId === connection.connectionId));
    const nextConnection = snapshot?.settings.models.connections[connection.connectionId];
    if (nextConnection) onConnectionChangeRef.current(nextConnection);
  }, [connection.connectionId]);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (operation: () => Promise<ModelMutationResult | undefined>) => {
    setError(null);
    try {
      const result = await operation();
      if (!result) throw new Error("当前版本不支持这个操作。");
      if ("error" in result) throw new Error(result.error.message);
      await load();
      await onChanged?.();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "模型操作失败。");
    }
  };

  const addModel = (apiModel: string, options: { enabled: boolean; label?: string }) => window.actspace.addCustomModel?.({
    ...customModelDraftFromCatalog(apiModel),
    ...(options.label ? { label: options.label } : {}),
    enabled: options.enabled,
    connectionId: connection.connectionId,
    setAsConnectionDefault: !connection.defaultModel,
  });

  const submitAdd = async () => {
    const id = addValue.trim();
    if (!id) return;
    if (models.some((model) => model.definition.apiModel === id)) { setAddError("这个模型已在列表里"); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      const result = await addModel(id, { enabled: true });
      if (!result) throw new Error("当前版本不支持添加模型。");
      if ("error" in result) throw new Error(result.error.message);
      setAdding(false);
      setAddValue("");
      notifySaved(`已添加 ${result.model?.definition.label ?? id}`);
      await load();
      await onChanged?.();
    } catch (nextError) {
      setAddError(nextError instanceof Error ? nextError.message : "添加失败。");
    } finally {
      setAddSaving(false);
    }
  };

  const refresh = async () => {
    if (!window.actspace.probeCustomConnection) return;
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.actspace.probeCustomConnection({ kind: "saved", connectionId: connection.connectionId });
      if (!result.ok) { setError(result.message); return; }
      if (!result.models) { setNotice("服务未提供模型列表，请手动添加"); return; }
      const existing = new Set(models.map((model) => model.definition.apiModel));
      const discovered = result.models.filter((model) => !existing.has(model.id));
      const added: string[] = [];
      for (const model of discovered) {
        const outcome = await addModel(model.id, { enabled: false, label: model.label });
        if (outcome && "model" in outcome && outcome.model) added.push(outcome.model.definition.key);
      }
      setFresh((current) => new Set([...current, ...added]));
      setNotice(added.length ? `发现 ${added.length} 个新模型，默认不启用` : "没有新模型");
      await load();
      if (added.length) await onChanged?.();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "刷新失败。");
    } finally {
      setRefreshing(false);
    }
  };

  const setDefault = (model: InstalledModelView) => mutate(async () => {
    const result = await window.actspace.setCustomConnectionDefaultModel?.({ connectionId: connection.connectionId, modelKey: model.definition.key });
    // 默认模型必须可用，顺手启用。
    if (result && !("error" in result) && !model.settings.enabled) return window.actspace.updateModel?.({ modelKey: model.definition.key, enabled: true });
    return result;
  });

  return (
    <SettingGroup
      title="模型"
      action={<>
        <Button variant="ghost" busy={refreshing} disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={13} aria-hidden="true" />刷新</Button>
        <Button onClick={() => { setAdding((open) => !open); setAddError(null); }}><Plus size={13} aria-hidden="true" />添加</Button>
      </>}
    >
      {adding ? (
        <SettingEditor error={addError} saving={addSaving} saveLabel="添加" saveDisabled={!addValue.trim()} onCancel={() => { setAdding(false); setAddValue(""); }} onSave={() => void submitAdd()}>
          <SettingsInput width="full" mono autoFocus aria-label="模型 ID" placeholder="输入模型 ID" value={addValue} onChange={(event) => { setAddValue(event.target.value); setAddError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void submitAdd(); }} />
        </SettingEditor>
      ) : null}
      {notice || error ? <p role={error ? "alert" : "status"} className={`px-4 py-2.5 text-act-xs ${error ? "text-on-danger" : "text-text-muted"}`}>{error ?? notice}</p> : null}
      {models.length ? models.map((model) => (
        <ModelRow
          key={model.definition.key}
          model={model}
          isDefault={connection.defaultModel === model.definition.apiModel}
          isFresh={fresh.has(model.definition.key)}
          onOpen={() => onEdit(model)}
          onSetDefault={() => void setDefault(model)}
          onRemove={() => setRemoving(model)}
          onToggle={(enabled) => {
            setFresh((current) => { const next = new Set(current); next.delete(model.definition.key); return next; });
            void mutate(() => window.actspace.updateModel?.({ modelKey: model.definition.key, enabled }) ?? Promise.resolve(undefined));
          }}
        />
      )) : <p className="px-4 py-5 text-center text-act-xs text-text-muted">这个连接还没有模型</p>}
      {removing ? (
        <ConfirmDialog
          title={`删除 ${removing.definition.label}？`}
          description="历史会话和使用统计会保留。"
          confirmLabel="删除模型"
          pendingLabel="删除中…"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const result = await window.actspace.removeModel?.({ modelKey: removing.definition.key });
            if (!result) throw new Error("当前版本不支持删除模型。");
            if ("error" in result) throw new Error(result.error.message);
            setRemoving(null);
            await load();
            await onChanged?.();
          }}
        />
      ) : null}
    </SettingGroup>
  );
}

function ModelRow({ model, isDefault, isFresh, onOpen, onSetDefault, onRemove, onToggle }: {
  model: InstalledModelView;
  isDefault: boolean;
  isFresh: boolean;
  onOpen: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { definition, settings } = model;
  // 目录里查不到、也没有手填上下文的模型，能力都是猜的。
  const unknown = !isKnownCatalogModel(definition.apiModel) && !definition.contextWindow;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.key !== "Enter") return;
    event.preventDefault();
    onOpen();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`编辑 ${definition.label}`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className="flex min-h-[52px] cursor-pointer items-center gap-4 px-4 py-2.5 transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-act-sm font-medium text-text-main">
          {definition.label}
          {isDefault ? <SettingTag>默认</SettingTag> : null}
          {unknown ? <SettingTag tone="warn">能力未知</SettingTag> : null}
          {isFresh ? <SettingTag tone="ok">新</SettingTag> : null}
        </div>
        {definition.label !== definition.apiModel ? <div className="mt-0.5 truncate font-mono text-act-xs text-text-faint">{definition.apiModel}</div> : null}
      </div>
      {/* 菜单和开关自己处理点击，不触发整行进入编辑。 */}
      <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <SettingsMenuButton
          ariaLabel={`${definition.label} 更多操作`}
          label={<MoreHorizontal size={16} aria-hidden="true" />}
          items={[
            { label: "设为默认", disabled: isDefault, onSelect: onSetDefault },
            { label: "编辑", onSelect: onOpen },
            { label: isDefault ? "删除（默认模型不能删除）" : "删除", danger: true, disabled: isDefault, onSelect: onRemove },
          ]}
        />
        <Toggle checked={settings.enabled} disabled={isDefault && settings.enabled} ariaLabel={`启用 ${definition.label}`} onChange={onToggle} />
      </div>
    </div>
  );
}
