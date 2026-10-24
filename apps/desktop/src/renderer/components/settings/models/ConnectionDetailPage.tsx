import { useEffect, useRef, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import {
  PROTOCOL_LABELS,
  type ConnectionModelInput,
  type ConnectionModelView,
  type ConnectionProbeResult,
  type ConnectionUpdateInput,
  type ConnectionView,
  type ModelApi,
  type ModelConnectionsView,
  type ProbedModel,
  type ProviderBalanceSnapshot,
} from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Select } from "../../ui/Select";
import { PageHeader, SettingGroup, SettingsInput, StatusDot } from "../SettingsPrimitives";
import { AddModelPanel } from "./AddModelPanel";
import { ConnectionLogo, connectionStatus } from "./ConnectionListSection";
import { FetchModelsDialog } from "./FetchModelsDialog";
import { ModelCard, type CardLevel } from "./ModelCard";
import { CommitInput, FieldRow, SavedMark, UnitBox } from "./model-fields";
import { PURPOSES, formatMultiplier } from "./model-view";
import { ModelsError, useModelsPage } from "./ModelsPage";

const PROTOCOL_OPTIONS = (Object.keys(PROTOCOL_LABELS) as ModelApi[]).map((value) => ({ value, label: PROTOCOL_LABELS[value] }));
const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", USD: "$" };
/** 移除后撤销条停留多久，到点才真正移除。 */
const UNDO_MS = 8000;

type PendingRemoval = { model: ConnectionModelView; index: number };

const hasList = (probe: ConnectionProbeResult) => probe.ok && probe.models.length > 0;
function failReason(probe: ConnectionProbeResult): string {
  if (!probe.ok) return probe.message || "连接失败。";
  return probe.listSource === "none" ? "这个服务没有开放模型列表。" : "返回的模型列表是空的。";
}

/**
 * 连接详情：连接本身（每个字段失焦即保存）、模型、计费与删除。
 * 模型从「获取可用模型」弹窗里勾，或者手动按 ID 添加；拿不到列表时直接展开手动添加。
 * 移除模型先在原位给撤销条，8 秒后（或离开页面、又移除了别的模型时）才真正移除。
 * 新建的连接带着这次的探测结果进来，直接弹出选择窗口。
 */
export function ConnectionDetailPage({ connectionId, initialExpanded, initialProbe }: { connectionId: string; initialExpanded: string | null; initialProbe: ConnectionProbeResult | null }) {
  const { controller, go } = useModelsPage();
  const connection = controller.view!.connections.find((item) => item.connectionId === connectionId)!;
  const [levels, setLevels] = useState<Record<string, CardLevel>>(() => (initialExpanded ? { [initialExpanded]: 1 } : {}));
  const [pick, setPick] = useState<ConnectionProbeResult | null>(() => (initialProbe && hasList(initialProbe) ? initialProbe : null));
  const [fail, setFail] = useState<string | null>(() => (initialProbe && !hasList(initialProbe) ? failReason(initialProbe) : null));
  const [drafting, setDrafting] = useState(() => Boolean(initialProbe && !hasList(initialProbe)));
  const [fetching, setFetching] = useState(false);
  const fetchTriggerRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const [flashKeys, setFlashKeys] = useState<ReadonlySet<string>>(() => new Set());
  const saved = useSavedFlash();
  const status = connectionStatus(connection);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const runRef = useRef(controller.run);
  runRef.current = controller.run;
  const undoTimer = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);
  const commitRemoval = (item: PendingRemoval) => void runRef.current(() => modelConnectionsApi.removeModel({ key: item.model.key }), null);
  useEffect(() => () => {
    window.clearTimeout(undoTimer.current);
    window.clearTimeout(flashTimer.current);
    if (pendingRef.current) commitRemoval(pendingRef.current);
  }, []);

  const flash = (keys: string[]) => {
    window.clearTimeout(flashTimer.current);
    setFlashKeys(new Set(keys));
    flashTimer.current = window.setTimeout(() => setFlashKeys(new Set()), 1500);
  };
  const update = async (field: string, patch: Omit<ConnectionUpdateInput, "connectionId">) => {
    const result = await controller.run(() => modelConnectionsApi.update({ connectionId, ...patch }), null);
    if (result.ok) saved.flash(field);
    return result.ok;
  };

  const models = connection.models.filter((model) => model.key !== pending?.model.key);
  const remove = (model: ConnectionModelView) => {
    window.clearTimeout(undoTimer.current);
    if (pendingRef.current) commitRemoval(pendingRef.current);
    const next = { model, index: models.findIndex((item) => item.key === model.key) };
    setPending(next);
    setLevels(({ [model.key]: _removed, ...others }) => others);
    undoTimer.current = window.setTimeout(() => {
      commitRemoval(next);
      setPending(null);
    }, UNDO_MS);
  };
  const undo = () => {
    window.clearTimeout(undoTimer.current);
    if (pending) flash([pending.model.key]);
    setPending(null);
  };
  const dismissUndo = () => {
    window.clearTimeout(undoTimer.current);
    if (pending) commitRemoval(pending);
    setPending(null);
  };

  const fetchModels = async () => {
    setFetching(true);
    setFail(null);
    try {
      const probe = await modelConnectionsApi.probe({ kind: "saved", connectionId });
      await controller.reload();
      if (hasList(probe)) setPick(probe);
      else {
        setFail(failReason(probe));
        setDrafting(true);
      }
    } catch (cause) {
      setFail(cause instanceof Error ? cause.message : "连接失败。");
      setDrafting(true);
    } finally {
      setFetching(false);
    }
  };
  const addModels = async (inputs: ConnectionModelInput[], savedText: string) => {
    const result = await controller.run(() => modelConnectionsApi.addModels({ connectionId, models: inputs }), savedText);
    if (!result.ok) return false;
    flash(addedKeys(result.view, connectionId, inputs));
    return true;
  };
  const addPicked = (picked: ProbedModel[]) =>
    addModels(picked.map((model) => ({ apiModel: model.apiModel, providerFacts: model.providerFacts })), `已添加 ${picked.length} 个模型`);

  const cards = models.map((model) => (
    <ModelCard
      key={model.key}
      model={model}
      level={levels[model.key] ?? 0}
      flash={flashKeys.has(model.key)}
      onLevel={(level) => setLevels((current) => ({ ...current, [model.key]: level }))}
      onSave={(overrides) => void controller.run(() => modelConnectionsApi.updateModel({ key: model.key, overrides }))}
      onRemove={() => remove(model)}
    />
  ));
  if (pending) cards.splice(Math.min(pending.index, cards.length), 0, <UndoBar key="undo" model={pending.model} onUndo={undo} onDismiss={dismissUndo} />);
  const empty = models.length === 0 && !pending && !drafting && !fail;

  return (
    <>
      <PageHeader
        title={connection.label}
        leading={<ConnectionLogo connection={connection} />}
        onBack={() => go({ name: "list" })}
        backLabel="模型"
        description={(
          <>
            <span>{connection.relay ? "自定义中转" : "官方"}</span>
            <span aria-hidden="true">·</span>
            <StatusDot tone={status.tone}>{status.label}</StatusDot>
            {connection.balance && connection.hasApiKey ? <BalanceNote connection={connection} /> : null}
          </>
        )}
      />
      <ModelsError />

      <ConnectionGroup connection={connection} saved={saved} update={update} />

      <SettingGroup
        plain
        title="模型"
        headingLevel={3}
        description={models.length > 0 ? `${models.length} 个，都会出现在对话框和「用途」里` : "加进来的模型会出现在对话框和「用途」里"}
        action={(
          <Button ref={fetchTriggerRef} busy={fetching} disabled={fetching} onClick={() => void fetchModels()}>
            {fetching ? null : <Download size={13} aria-hidden="true" />}
            {fetching ? "正在获取…" : "获取可用模型"}
          </Button>
        )}
      >
        <div className="flex flex-col gap-2">
          {fail ? (
            <div role="alert" className="flex items-start gap-2 rounded-act-md bg-warning-soft py-2.5 pl-3 pr-1.5 text-act-xs leading-relaxed text-on-warning">
              <span className="min-w-0 flex-1">没拿到模型列表：{fail}<br />可以按模型 ID 手动添加，下面已经帮你打开了。</span>
              <IconButton label="关闭提示" tooltip={false} variant="inherit" size="xs" onClick={() => setFail(null)}><X size={13} aria-hidden="true" /></IconButton>
            </div>
          ) : null}
          {cards}
          {empty ? (
            <div className="rounded-act-lg border border-dashed border-line-strong px-4 py-6 text-center text-act-xs leading-relaxed text-text-faint">
              还没有模型。<br />点「获取可用模型」勾选要用的，或者手动添加。
            </div>
          ) : null}
          {drafting ? (
            <AddModelPanel
              connectionId={connectionId}
              onAdd={(input) => addModels([input], "模型已添加")}
              onCancel={() => setDrafting(false)}
            />
          ) : (
            <div>
              <Button onClick={() => setDrafting(true)}>
                <Plus size={13} aria-hidden="true" />
                手动添加
              </Button>
            </div>
          )}
        </div>
      </SettingGroup>

      <SettingGroup title={connection.relay ? "计费与删除" : "删除"} headingLevel={3}>
        {connection.relay ? (
          <FieldRow label="价格倍率">
            <UnitBox unit="官方价 ×" side="left" className="w-[150px] flex-none">
              <CommitInput
                width="full"
                value={formatMultiplier(connection.multiplier)}
                aria-label="价格倍率"
                className="pl-[60px] tabular-nums"
                onCommit={(text) => {
                  const value = Number(text);
                  if (!text.trim() || !Number.isFinite(value) || value <= 0) return false;
                  void update("multiplier", { multiplier: value });
                }}
              />
            </UnitBox>
            <span className="min-w-0 text-act-xs text-text-faint">中转站打几折就填几，手填的价格不乘倍率。</span>
            {saved.field === "multiplier" ? <SavedMark key={saved.tick} /> : null}
          </FieldRow>
        ) : null}
        <DeleteRow onDelete={async () => {
          const result = await controller.run(() => modelConnectionsApi.remove({ connectionId }), "连接已删除");
          if (result.ok) go({ name: "list" });
        }} />
      </SettingGroup>

      {pick ? (
        <FetchModelsDialog
          returnFocus={fetchTriggerRef}
          label={connection.label}
          fresh={models.length === 0}
          probe={pick}
          onClose={() => setPick(null)}
          onAdd={addPicked}
        />
      ) : null}
    </>
  );
}

function addedKeys(view: ModelConnectionsView, connectionId: string, inputs: readonly ConnectionModelInput[]): string[] {
  const ids = new Set(inputs.map((input) => input.apiModel));
  return view.connections.find((item) => item.connectionId === connectionId)?.models.filter((model) => ids.has(model.apiModel)).map((model) => model.key) ?? [];
}

type SavedFlash = { field: string | null; tick: number; flash: (field: string) => void };

/** 哪个字段刚保存：框内显示「已保存」，1.9 秒后收起。 */
function useSavedFlash(): SavedFlash {
  const [state, setState] = useState<{ field: string | null; tick: number }>({ field: null, tick: 0 });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    ...state,
    flash: (field) => {
      window.clearTimeout(timer.current);
      setState((current) => ({ field, tick: current.tick + 1 }));
      timer.current = window.setTimeout(() => setState((current) => ({ ...current, field: null })), 1900);
    },
  };
}

/** 连接分组：每个字段都是输入框，失焦保存，框内短暂显示「已保存」。内置连接的名称来自模板，只读。 */
function ConnectionGroup({ connection, saved, update }: { connection: ConnectionView; saved: SavedFlash; update: (field: string, patch: Omit<ConnectionUpdateInput, "connectionId">) => Promise<boolean> }) {
  const builtin = connection.connectionId.endsWith(":default");
  const mark = (field: string, offset?: string) => (saved.field === field ? <SavedMark key={saved.tick} offset={offset} /> : null);
  return (
    <SettingGroup title="连接" headingLevel={3}>
      <FieldRow label="名称">
        {builtin
          ? <SettingsInput width="full" value={connection.label} disabled aria-label="名称" />
          : <CommitInput width="full" value={connection.label} aria-label="名称" onCommit={(text) => { if (!text.trim()) return false; void update("label", { label: text.trim() }); }} />}
        {mark("label")}
      </FieldRow>
      {connection.relay ? (
        <FieldRow label="协议">
          <Select value={connection.protocol} options={PROTOCOL_OPTIONS} ariaLabel="协议" className="w-full" onValueChange={(protocol) => void update("protocol", { protocol: protocol as ModelApi })} />
          {mark("protocol", "right-8")}
        </FieldRow>
      ) : null}
      <FieldRow label="服务地址">
        <CommitInput
          width="full"
          mono
          value={connection.baseUrl}
          placeholder={connection.defaultBaseUrl ?? "https://your-relay.com"}
          aria-label="服务地址"
          onCommit={(text) => {
            const baseUrl = text.trim() || connection.defaultBaseUrl || "";
            if (!baseUrl) return false;
            void update("baseUrl", { baseUrl });
          }}
        />
        {mark("baseUrl")}
      </FieldRow>
      <FieldRow label="API Key">
        <KeyInput label="API Key" saved={connection.hasApiKey} justSaved={saved.field === "apiKey"} savedTick={saved.tick} onSave={(apiKey) => update("apiKey", { apiKey })} />
      </FieldRow>
      {connection.hasManagementKey !== undefined ? (
        <FieldRow label="管理 Key">
          <KeyInput
            label="管理 Key"
            saved={connection.hasManagementKey}
            emptyPlaceholder="查余额用，粘贴 OpenRouter 的管理 Key"
            justSaved={saved.field === "managementKey"}
            savedTick={saved.tick}
            onSave={(managementKey) => update("managementKey", { managementKey })}
            onClear={() => void update("managementKey", { managementKey: null })}
          />
        </FieldRow>
      ) : null}
      <FieldRow label="代理">
        <CommitInput
          width="full"
          mono
          value={connection.proxy.enabled ? connection.proxy.url ?? "" : ""}
          placeholder="留空走系统代理"
          aria-label="代理"
          onCommit={(text) => void update("proxy", { proxy: text.trim() ? { enabled: true, url: text.trim() } : { enabled: false, url: null } })}
        />
        {mark("proxy")}
      </FieldRow>
    </SettingGroup>
  );
}

/** Key 不回显：已保存时占位写「已保存在本机」，粘贴新的 Key 后框内出现「取消 / 保存」。 */
function KeyInput({ label, saved, emptyPlaceholder = "粘贴 Key", justSaved, savedTick, onSave, onClear }: {
  label: string;
  saved: boolean;
  emptyPlaceholder?: string;
  justSaved: boolean;
  savedTick: number;
  onSave: (key: string) => Promise<boolean>;
  onClear?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = value.trim().length > 0;
  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    const ok = await onSave(value.trim());
    setBusy(false);
    if (ok) setValue("");
  };
  return (
    <span className="relative min-w-0 flex-1">
      <SettingsInput
        width="full"
        mono
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") { event.stopPropagation(); setValue(""); }
        }}
        placeholder={saved ? "•••••••••••• 已保存在本机，粘贴新的 Key 可替换" : emptyPlaceholder}
        aria-label={label}
        className={dirty ? "pr-[116px]" : saved && onClear ? "pr-14" : undefined}
      />
      {dirty ? (
        <span className="absolute inset-y-0 right-1 flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setValue("")}>取消</Button>
          <Button variant="primary" size="xs" busy={busy} disabled={busy} onClick={() => void save()}>保存</Button>
        </span>
      ) : justSaved ? (
        <SavedMark key={savedTick} />
      ) : saved && onClear ? (
        <span className="absolute inset-y-0 right-1 flex items-center">
          <Button variant="ghost" size="xs" onClick={onClear}>清除</Button>
        </span>
      ) : null}
    </span>
  );
}

/** 移除后占在原位的撤销条。 */
function UndoBar({ model, onUndo, onDismiss }: { model: ConnectionModelView; onUndo: () => void; onDismiss: () => void }) {
  const chat = model.usedBy.includes("chat");
  const others = PURPOSES.filter((purpose) => purpose.id !== "chat" && model.usedBy.includes(purpose.id)).map((purpose) => `「${purpose.label}」`);
  const effect = chat ? "，「会话默认」需要重新选一个模型" : others.length > 0 ? `，${others.join("")}改为跟随会话默认` : "";
  return (
    <div role="status" className="flex min-h-12 items-center gap-2 rounded-act-lg border border-dashed border-line-strong pl-3.5 pr-2 text-act-xs text-text-muted">
      <span className="min-w-0 flex-1">已移除 <b className="font-medium text-text-main">{model.effective.label}</b>{effect}。</span>
      <Button onClick={onUndo}>撤销</Button>
      <IconButton label="关闭" tooltip={false} onClick={onDismiss}><X size={14} aria-hidden="true" /></IconButton>
    </div>
  );
}

/** 两步删除：第一次点变成「确认删除」，3 秒内不点就复原。 */
function DeleteRow({ onDelete }: { onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <FieldRow label="删除连接">
      <span className="min-w-0 flex-1 text-act-xs text-text-faint">{armed ? "再点一次确认。历史会话和用量记录会保留。" : "这个连接和它的模型都会移除，历史会话不受影响。"}</span>
      <Button
        variant={armed ? "danger-solid" : "danger"}
        onClick={() => {
          window.clearTimeout(timer.current);
          if (armed) {
            setArmed(false);
            void onDelete();
            return;
          }
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 3000);
        }}
      >
        {armed ? "确认删除" : "删除"}
      </Button>
    </FieldRow>
  );
}

function BalanceNote({ connection }: { connection: ConnectionView }) {
  const [balance, setBalance] = useState<ProviderBalanceSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    void modelConnectionsApi.getBalance({ connectionId: connection.connectionId })
      .then((result) => { if (!cancelled) setBalance(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [connection.connectionId, connection.hasApiKey, connection.hasManagementKey]);
  const display = balance?.displayBalance;
  if (!display) return null;
  return (
    <>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">余额 {CURRENCY_SYMBOL[display.currency] ?? ""}{display.amount}</span>
    </>
  );
}
