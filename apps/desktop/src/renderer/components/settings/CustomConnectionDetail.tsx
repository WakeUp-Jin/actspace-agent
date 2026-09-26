import { useEffect, useRef, useState } from "react";
import {
  customConnectionRequestUrl,
  normalizeCustomConnectionAddress,
  type CustomConnectionAuthMode,
  type CustomConnectionBillingMode,
  type InstalledModelView,
  type SettingsV4ConnectionSettings,
} from "@actspace/shared";
import type { RuntimeV2UpdateCustomConnectionInput } from "@actspace/shared/runtime-v2";
import {
  SettingEditor,
  SettingGroup,
  SettingRow,
  SettingsInput,
  SettingsSelect,
  Toggle,
  useSettingsSaveNotice,
  useSingleEditor,
} from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProviderLogo } from "./ProviderLogo";
import { CustomConnectionModels } from "./CustomConnectionModels";
import { CustomModelForm } from "./CustomModelForm";
import {
  AUTH_MODE_OPTIONS,
  AddressPreview,
  ConnectionStatusDot,
  MultiplierStepper,
  SecretInput,
  SetupHeader,
  formatCheckedAt,
  hostOf,
  isOfficialAnthropic,
  protocolLabel,
} from "./custom-connection-shared";

type EditorId = "name" | "url" | "key" | "proxy";

const BILLING_OPTIONS: { value: CustomConnectionBillingMode; label: string }[] = [
  { value: "reference", label: "按官方价折算" },
  { value: "token", label: "只统计 Token" },
  { value: "manual", label: "逐个填写单价" },
];

/**
 * 自定义连接详情：每一项单独编辑。地址、Key、认证方式、代理变化后自动重新测试，
 * 因为主进程会把这些变化视为「需要重测」并清掉旧结果。
 */
export function CustomConnectionDetail({ connection, autoTest = false, logoKey, onConnectionChange, onChanged, onBack, onRemove }: {
  connection: SettingsV4ConnectionSettings;
  /** 刚创建、还没测通时进入详情页，自动测一次。 */
  autoTest?: boolean;
  logoKey?: Parameters<typeof ProviderLogo>[0]["logoKey"];
  onConnectionChange: (connection: SettingsV4ConnectionSettings) => void;
  onChanged?: () => void | Promise<void>;
  onBack: () => void;
  onRemove: () => void | Promise<void>;
}) {
  const editor = useSingleEditor<EditorId>();
  const notifySaved = useSettingsSaveNotice();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [modelRoute, setModelRoute] = useState<InstalledModelView | null>(null);
  const [modelRevision, setModelRevision] = useState(0);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const autoTested = useRef(false);

  const official = isOfficialAnthropic(connection);
  const protocol = connection.protocol ?? "openai-completions";
  const anthropic = protocol === "anthropic-messages";
  const name = connection.displayName ?? connection.connectionId;
  const billingMode = connection.billingMode ?? "manual";
  const status = connection.lastConnection?.status;
  const proxy = connection.proxy ?? { enabled: false, url: null };

  const refresh = async () => {
    const snapshot = await window.actspace.getSettingsV4?.();
    const next = snapshot?.settings.models.connections[connection.connectionId];
    if (next) onConnectionChange(next);
    return next ?? connection;
  };

  const test = async (current: SettingsV4ConnectionSettings = connection) => {
    if (!window.actspace.testCustomConnection || !current.defaultModel) return;
    setTesting(true);
    try {
      await window.actspace.testCustomConnection({ connectionId: current.connectionId });
    } catch {
      // 结果已经写进 lastConnection；调用本身失败时保留原状态。
    } finally {
      await refresh();
      setTesting(false);
      await onChanged?.();
    }
  };

  useEffect(() => {
    if (!autoTest || autoTested.current) return;
    autoTested.current = true;
    void test();
    // 只在进入页面时触发一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTest]);

  /** 以当前连接为底，合并一处改动后保存；返回新连接。 */
  const update = async (patch: Partial<RuntimeV2UpdateCustomConnectionInput>): Promise<SettingsV4ConnectionSettings> => {
    if (!window.actspace.updateCustomConnection) throw new Error("当前版本不支持编辑连接。");
    const snapshot = await window.actspace.updateCustomConnection({
      providerId: connection.providerId,
      connectionId: connection.connectionId,
      protocol,
      displayName: connection.displayName ?? "",
      baseUrl: connection.baseUrl ?? "",
      catalogId: connection.catalogId,
      promptCacheMode: connection.promptCacheMode,
      proxy,
      ...patch,
    });
    const next = snapshot.settings.models.connections[connection.connectionId] ?? connection;
    onConnectionChange(next);
    await onChanged?.();
    return next;
  };

  /** 行内开关、下拉这类即时保存；失败时在连接分组下方显示。 */
  const quickUpdate = async (patch: Partial<RuntimeV2UpdateCustomConnectionInput>, retest = false) => {
    setRowError(null);
    try {
      const next = await update(patch);
      notifySaved();
      if (retest) await test(next);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "保存失败。");
    }
  };

  const openEditor = (id: EditorId, value = "") => {
    setDraft(value);
    setEditorError(null);
    editor.toggle(id);
  };

  const saveEditor = async () => {
    const id = editor.openId;
    if (!id) return;
    const value = draft.trim();
    if (!value) { setEditorError(id === "key" ? "请填写新的 API Key。" : id === "name" ? "名称不能为空。" : "请填写地址。"); return; }
    setSaving(true);
    setEditorError(null);
    try {
      const patch: Partial<RuntimeV2UpdateCustomConnectionInput> = id === "name" ? { displayName: value }
        : id === "url" ? { baseUrl: value }
        : id === "key" ? { apiKey: value }
        : { proxy: { enabled: true, url: value } };
      const next = await update(patch);
      editor.close();
      notifySaved();
      if (id !== "name") void test(next);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  if (modelRoute) {
    return <CustomModelForm connection={connection} model={modelRoute} onBack={() => setModelRoute(null)} onSaved={async () => { setModelRoute(null); setModelRevision((value) => value + 1); await onChanged?.(); }} />;
  }

  const address = normalizeCustomConnectionAddress(draft, protocol);
  const addressConflict = !("reason" in address) && address.inferredProtocol !== null && address.inferredProtocol !== protocol;
  const lastChecked = formatCheckedAt(connection.lastConnection?.checkedAt);
  const testDescription = testing ? "正在测试…"
    : status === "available" ? `${lastChecked || "已"}通过`
    : status === "unavailable" ? <span className="text-on-danger">{connection.lastConnection?.message ?? "连接异常"}</span>
    : connection.defaultModel ? "未测试" : "请先添加模型";
  const editorProps = { error: editorError, saving, onCancel: editor.close, onSave: () => void saveEditor() };

  return (
    <div className="flex w-full flex-col gap-8">
      <SetupHeader
        backLabel="模型"
        onBack={onBack}
        logo={<ProviderLogo provider={connection.providerId} logoKey={official ? "anthropic" : logoKey ?? "generic"} />}
        title={name}
        subtitle={<>{official ? "Anthropic 官方" : `${protocolLabel(protocol)} · ${hostOf(connection.baseUrl)}`}<span aria-hidden="true">·</span><ConnectionStatusDot status={status} testing={testing} /></>}
      />

      <SettingGroup title="连接">
        {official ? null : (
          <>
            <SettingRow title="名称" control={<><span className="max-w-[240px] truncate text-act-sm text-text-muted">{name}</span><Button aria-label="编辑名称" onClick={() => openEditor("name", name)}>编辑</Button></>} />
            {editor.isOpen("name") ? (
              <SettingEditor {...editorProps}>
                <SettingsInput width="full" autoFocus aria-label="名称" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveEditor(); }} />
              </SettingEditor>
            ) : null}
            <SettingRow title="服务地址" monoDescription description={connection.baseUrl ? customConnectionRequestUrl(connection.baseUrl, protocol) : undefined} control={<Button aria-label="编辑服务地址" onClick={() => openEditor("url", connection.baseUrl ?? "")}>编辑</Button>} />
            {editor.isOpen("url") ? (
              <SettingEditor {...editorProps} saveDisabled={"reason" in address || addressConflict} hint="保存后自动测试">
                <SettingsInput width="full" mono autoFocus aria-label="服务地址" value={draft} onChange={(event) => setDraft(event.target.value)} />
                {addressConflict ? <p role="alert" className="mt-1.5 text-act-xs text-on-danger">地址和连接协议不一致，换协议需要新建连接。</p> : <AddressPreview result={address} showEmpty />}
              </SettingEditor>
            ) : null}
          </>
        )}
        <SettingRow title="API Key" control={<><span className="text-act-sm text-text-muted">已设置</span><Button aria-label="更换 API Key" onClick={() => openEditor("key")}>更换</Button></>} />
        {editor.isOpen("key") ? (
          <SettingEditor {...editorProps} hint="保存后自动测试">
            <SecretInput autoFocus ariaLabel="新的 API Key" placeholder="新的 API Key" value={draft} onChange={setDraft} />
          </SettingEditor>
        ) : null}
        {anthropic && !official ? (
          <SettingRow
            title="认证方式"
            description={(connection.authMode ?? "x-api-key") === "auto" && connection.resolvedAuth ? `自动识别为 ${connection.resolvedAuth === "bearer" ? "Bearer" : "x-api-key"}` : undefined}
            control={<SettingsSelect size="sm" ariaLabel="认证方式" value={connection.authMode ?? "x-api-key"} options={AUTH_MODE_OPTIONS.map((option) => ({ ...option }))} onChange={(value) => void quickUpdate({ authMode: value as CustomConnectionAuthMode }, true)} />}
          />
        ) : null}
        <SettingRow
          title="代理"
          monoDescription
          description={proxy.enabled ? proxy.url ?? undefined : undefined}
          control={<>
            {proxy.enabled ? <Button aria-label="编辑代理地址" onClick={() => openEditor("proxy", proxy.url ?? "")}>编辑</Button> : null}
            <Toggle checked={proxy.enabled} ariaLabel="使用代理" onChange={(enabled) => { if (enabled) openEditor("proxy", proxy.url ?? ""); else { editor.close(); void quickUpdate({ proxy: { enabled: false, url: null } }, true); } }} />
          </>}
        />
        {editor.isOpen("proxy") ? (
          <SettingEditor {...editorProps} hint="仅此连接使用">
            <SettingsInput width="full" mono autoFocus aria-label="代理地址" placeholder="http://127.0.0.1:7890" value={draft} onChange={(event) => setDraft(event.target.value)} />
          </SettingEditor>
        ) : null}
        {anthropic ? (
          <SettingRow
            title="提示缓存"
            description={official ? undefined : "中转站不支持时关闭"}
            control={<Toggle checked={connection.promptCacheMode !== "off"} ariaLabel="提示缓存" onChange={(enabled) => void quickUpdate({ promptCacheMode: enabled ? "short" : "off" })} />}
          />
        ) : null}
        <SettingRow
          title="连接测试"
          description={<span role="status">{testDescription}</span>}
          control={<Button busy={testing} disabled={testing || !connection.defaultModel} onClick={() => void test()}>{testing ? "测试中…" : "测试"}</Button>}
        />
      </SettingGroup>
      {rowError ? <p role="alert" className="-mt-5 px-0.5 text-act-xs text-on-danger">{rowError}</p> : null}

      <CustomConnectionModels
        key={modelRevision}
        connection={connection}
        onConnectionChange={onConnectionChange}
        onChanged={onChanged}
        onEdit={setModelRoute}
      />

      <SettingGroup title="计费">
        {official ? <SettingRow title="按官方价格" /> : (
          <>
            <SettingRow title="计费方式" control={<SettingsSelect ariaLabel="计费方式" value={billingMode} options={BILLING_OPTIONS} onChange={(value) => void quickUpdate({ billingMode: value as CustomConnectionBillingMode })} />} />
            {billingMode === "reference" ? (
              <SettingRow title="倍率" description="中转站 3 折就填 0.3" control={<MultiplierStepper value={connection.defaultPricingMultiplier ?? 1} onChange={(pricingMultiplier) => void quickUpdate({ pricingMultiplier })} />} />
            ) : null}
          </>
        )}
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="删除连接" control={<Button variant="danger" onClick={() => setConfirmingRemove(true)}>删除</Button>} />
      </SettingGroup>

      {confirmingRemove ? (
        <ConfirmDialog
          title={`删除 ${name}？`}
          description="API Key 和这个连接下的模型会一起删除，历史会话和使用统计会保留。"
          confirmLabel="删除连接"
          pendingLabel="删除中…"
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={async () => { await onRemove(); }}
        />
      ) : null}
    </div>
  );
}
