import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PROTOCOL_LABELS, type ConnectionView, type ModelApi, type ProviderBalanceSnapshot } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button } from "../../ui/Button";
import { PageHeader, SettingGroup, SettingRow, SettingsInput, SettingsSelect, StatusDot, useSettingsSaveNotice } from "../SettingsPrimitives";
import { AddModelPanel } from "./AddModelPanel";
import { ConnectionLogo, connectionStatus } from "./ConnectionListSection";
import { AddModelRow, CommitInput, FieldRow } from "./model-fields";
import { formatMultiplier } from "./model-view";
import { ModelList } from "./ModelList";
import { LIST_FRAME } from "./ModelSelectPage";
import { ModelsError, useModelsPage } from "./ModelsPage";

const PROTOCOL_OPTIONS = (Object.keys(PROTOCOL_LABELS) as ModelApi[]).map((value) => ({ value, label: PROTOCOL_LABELS[value] }));
const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", USD: "$" };

/** 连接详情：连接本身（名称、协议、地址、Key、代理）、模型列表、倍率与删除。 */
export function ConnectionDetailPage({ connectionId, initialExpanded }: { connectionId: string; initialExpanded: string | null }) {
  const { controller, go } = useModelsPage();
  const connection = controller.view!.connections.find((item) => item.connectionId === connectionId)!;
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const notify = useSettingsSaveNotice();
  const builtin = connection.connectionId.endsWith(":default");
  const enabled = connection.models.filter((model) => model.enabled).length;
  const status = connectionStatus(connection);
  const update = (patch: Omit<Parameters<typeof modelConnectionsApi.update>[0], "connectionId">) =>
    controller.run(() => modelConnectionsApi.update({ connectionId, ...patch }));

  const refresh = async () => {
    setRefreshing(true);
    try {
      const probe = await modelConnectionsApi.probe({ kind: "saved", connectionId });
      if (!probe.ok) {
        controller.setError(probe.message || "获取模型列表失败。");
        await controller.reload();
        return;
      }
      if (probe.listSource !== "provider") {
        await controller.reload();
        notify("这个服务没有开放模型列表");
        return;
      }
      const fresh = probe.models.filter((model) => !model.added).length;
      await controller.run(
        () => modelConnectionsApi.addModels({ connectionId, models: probe.models.map((model) => ({ apiModel: model.apiModel, providerFacts: model.providerFacts, enabled: false })) }),
        fresh > 0 ? `新增 ${fresh} 个模型，默认未启用` : "模型列表已是最新",
      );
    } finally {
      setRefreshing(false);
    }
  };

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

      <SettingGroup title="连接" headingLevel={3}>
        <FieldRow label="名称">
          {builtin
            ? <span className="text-act-sm text-text-main">{connection.label}</span>
            : <CommitInput width="md" value={connection.label} aria-label="名称" onCommit={(label) => void update({ label })} />}
        </FieldRow>
        {connection.relay ? (
          <FieldRow label="协议">
            <SettingsSelect size="sm" ariaLabel="协议" value={connection.protocol} options={PROTOCOL_OPTIONS} onChange={(protocol) => void update({ protocol: protocol as ModelApi })} />
            <span className="text-act-xs text-text-faint">按中转站文档选</span>
          </FieldRow>
        ) : null}
        <FieldRow label="服务地址">
          <CommitInput width="full" mono value={connection.baseUrl} placeholder={connection.defaultBaseUrl ?? "https://your-relay.com"} aria-label="服务地址" onCommit={(baseUrl) => void update({ baseUrl: baseUrl.trim() || connection.defaultBaseUrl || "" })} />
        </FieldRow>
        <KeyRow label="API Key" saved={connection.hasApiKey} onSave={(apiKey) => update({ apiKey })} />
        {connection.hasManagementKey !== undefined ? (
          <KeyRow label="管理 Key" saved={connection.hasManagementKey} hint="查余额用" onSave={(managementKey) => update({ managementKey })} onClear={() => update({ managementKey: null })} />
        ) : null}
        <FieldRow label="代理">
          <CommitInput
            width="full"
            mono
            value={connection.proxy.enabled ? connection.proxy.url ?? "" : ""}
            placeholder="http://127.0.0.1:7890"
            aria-label="代理"
            onCommit={(url) => void update({ proxy: url.trim() ? { enabled: true, url: url.trim() } : { enabled: false, url: null } })}
          />
          <span className="whitespace-nowrap text-act-xs text-text-faint">留空走系统代理</span>
        </FieldRow>
      </SettingGroup>

      <SettingGroup
        plain
        title="模型"
        headingLevel={3}
        description={`${enabled} / ${connection.models.length} 个启用。点开可以看上下文、价格，改默认思考。`}
        action={(
          <Button variant="ghost" busy={refreshing} disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? null : <RefreshCw size={13} aria-hidden="true" />}
            重新获取
          </Button>
        )}
      >
        <div className={LIST_FRAME}>
          {connection.models.length === 0 && !adding ? <div className="px-4 py-3 text-act-xs text-text-muted">还没有模型。</div> : null}
          <ModelList
            connectionId={connectionId}
            models={connection.models}
            expanded={expanded}
            onExpand={setExpanded}
            onToggle={(model, next) => void controller.run(() => modelConnectionsApi.updateModel({ key: model.key, enabled: next }))}
            onSave={(model, overrides) => void controller.run(() => modelConnectionsApi.updateModel({ key: model.key, overrides }))}
            onRemove={(model) => void controller.run(() => modelConnectionsApi.removeModel({ key: model.key }), "模型已移除")}
          />
          {adding ? (
            <AddModelPanel
              target={{ kind: "connection", connectionId }}
              onAdd={async (model) => (await controller.run(() => modelConnectionsApi.addModels({ connectionId, models: [{ apiModel: model.apiModel, ...(model.overrides ? { overrides: model.overrides } : {}) }] }), "模型已添加")).ok}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <AddModelRow onClick={() => setAdding(true)} />
          )}
        </div>
      </SettingGroup>

      <SettingGroup title="计费与删除" headingLevel={3}>
        <SettingRow
          title="价格倍率"
          description={connection.relay ? "中转站打几折就填几。单个模型手动填的价格不再乘倍率。" : "官方连接一般是 1，有企业折扣再改。"}
          control={(
            <>
              <span className="text-act-xs text-text-muted">官方价 ×</span>
              <CommitInput
                width="sm"
                numeric
                value={formatMultiplier(connection.multiplier)}
                aria-label="价格倍率"
                onCommit={(text) => {
                  const value = Number(text);
                  if (!text.trim() || !Number.isFinite(value) || value <= 0) return false;
                  void update({ multiplier: value });
                }}
              />
            </>
          )}
        />
        <DeleteRow connection={connection} onDelete={async () => {
          const result = await controller.run(() => modelConnectionsApi.remove({ connectionId }), "连接已删除");
          if (result.ok) go({ name: "list" });
        }} />
      </SettingGroup>
    </>
  );
}

/** Key 只显示掩码；「更换」后就地输入。 */
function KeyRow({ label, saved, hint, onSave, onClear }: { label: string; saved: boolean; hint?: string; onSave: (key: string) => Promise<{ ok: boolean }>; onClear?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    const result = await onSave(value.trim());
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      setValue("");
    }
  };
  return (
    <FieldRow label={label}>
      {editing ? (
        <>
          <SettingsInput width="full" mono type="password" autoFocus autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") setEditing(false); }} placeholder="粘贴新的 Key" aria-label={`新的 ${label}`} />
          <Button variant="primary" busy={busy} disabled={!value.trim() || busy} onClick={() => void save()}>保存</Button>
          <Button variant="ghost" onClick={() => { setEditing(false); setValue(""); }}>取消</Button>
        </>
      ) : (
        <>
          <span className="font-mono text-act-xs text-text-muted">{saved ? "••••••••••••" : "未设置"}</span>
          <span className="text-act-xs text-text-faint">{saved ? "已保存在本机" : hint}</span>
          <span className="ml-auto flex items-center gap-2">
            {saved && onClear ? <Button variant="ghost" onClick={onClear}>清除</Button> : null}
            <Button onClick={() => setEditing(true)}>{saved ? "更换" : "填写"}</Button>
          </span>
        </>
      )}
    </FieldRow>
  );
}

/** 两步删除：第一次点变成「确认删除」，3 秒内不点就复原。 */
function DeleteRow({ connection, onDelete }: { connection: ConnectionView; onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const used = connection.models.some((model) => model.usedBy.length > 0);
  return (
    <SettingRow
      title="删除连接"
      description={used ? "有用途正在用它的模型，删除后这些用途改为跟随。历史会话不受影响。" : "删除后这个连接的模型都会移除。历史会话不受影响。"}
      control={(
        <Button
          variant={armed ? "danger-solid" : "danger"}
          onClick={() => {
            if (armed) {
              window.clearTimeout(timer.current);
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
      )}
    />
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
