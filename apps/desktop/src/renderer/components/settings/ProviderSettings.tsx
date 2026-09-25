import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  PROVIDER_REGISTRY,
  PROVIDER_DEFINITIONS,
  PROVIDER_CATALOG,
  PROVIDER_CATALOG_ORDER,
  type ProviderCategory,
  type ModelsCatalogListResult,
  type LlmProviderId,
  type BalanceProviderId,
  type CredentialStorageView,
  type ProviderBalanceSnapshot,
  type ProviderSettingsView,
  type AppSettings,
  type SettingsV4ConnectionSettings,
  type ProviderCatalogDefinition,
} from "@actspace/shared";
import { SectionShell } from "./SettingsPrimitives";
import { useDialogFocusTrap } from "./useDialogFocusTrap";
import { ModelSettings } from "./ModelSettings";
import { ProviderLogo } from "./ProviderLogo";
import { CustomConnectionModels } from "./CustomConnectionModels";
import { CustomModelFields, CustomModelForm, customModelInputFromDraft, emptyCustomModelFormDraft } from "./CustomModelForm";
import { Toggle } from "./SettingsPrimitives";

const PROVIDERS = PROVIDER_DEFINITIONS;

type AddRoute = { kind: "catalog" } | null;
type CatalogEntry = (typeof PROVIDERS)[number] & { kind: "builtin" } | ProviderCatalogDefinition & { kind: "compatible" };

const PROVIDER_BALANCE_REFRESH_MS = 5 * 60 * 1000;

export function ProviderSettings({ settings, onChanged }: { settings?: AppSettings | null; onChanged?: () => void | Promise<void> }) {
  const [providers, setProviders] = useState<Partial<Record<LlmProviderId, ProviderSettingsView>>>({});
  const [credentialStorage, setCredentialStorage] = useState<CredentialStorageView>({ status: "ready" });
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState<AddRoute>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<"all" | ProviderCategory>("all");
  const [setup, setSetup] = useState<{ provider: LlmProviderId; origin: "list" | "catalog" } | null>(null);
  const [customSetup, setCustomSetup] = useState<{ catalog?: ProviderCatalogDefinition } | false>(false);
  const [editingCustom, setEditingCustom] = useState<SettingsV4ConnectionSettings | null>(null);
  const [detailProvider, setDetailProvider] = useState<LlmProviderId | null>(null);
  const [customConnections, setCustomConnections] = useState<SettingsV4ConnectionSettings[]>([]);
  const [customDetail, setCustomDetail] = useState<SettingsV4ConnectionSettings | null>(null);
  const [removing, setRemoving] = useState<LlmProviderId | null>(null);
  const [busy, setBusy] = useState<LlmProviderId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [balances, setBalances] = useState<Partial<Record<BalanceProviderId, ProviderBalanceSnapshot>>>({});
  const [balanceLoading, setBalanceLoading] = useState<Partial<Record<BalanceProviderId, boolean>>>({});
  const [balanceErrors, setBalanceErrors] = useState<Partial<Record<BalanceProviderId, string>>>({});
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadBalance = useCallback(async (provider: BalanceProviderId) => {
    if (!window.actspace?.getProviderBalance) return;
    setBalanceLoading((current) => ({ ...current, [provider]: true }));
    setBalanceErrors((current) => ({ ...current, [provider]: undefined }));
    try {
      const balance = await window.actspace.getProviderBalance({ provider });
      setBalances((current) => ({ ...current, [provider]: balance }));
    } catch (error) {
      setBalanceErrors((current) => ({
        ...current,
        [provider]: error instanceof Error ? error.message : "余额刷新失败。",
      }));
    } finally {
      setBalanceLoading((current) => ({ ...current, [provider]: false }));
    }
  }, []);

  const load = useCallback(async () => {
    if (!window.actspace?.listProviders) return;
    try {
      const result = await window.actspace.listProviders();
      setProviders(result.providers);
      setCredentialStorage(result.credentialStorage ?? { status: "ready" });
      if (window.actspace.getSettingsV4) {
        const v4 = await window.actspace.getSettingsV4();
        setCustomConnections(Object.values(v4.settings.models.connections).filter((connection) => connection.connectionId !== `${connection.providerId}:default`));
      }
      // Balances are remote detail data; they must not hold up the local connection list.
      for (const provider of PROVIDERS) {
        if (provider.supportsBalance && result.providers[provider.id]?.hasApiKey === true) {
          void loadBalance(provider.id as BalanceProviderId);
        }
      }
    } finally {
      setLoaded(true);
    }
  }, [loadBalance]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (detailProvider && !providers[detailProvider]) setDetailProvider(null);
  }, [detailProvider, providers]);

  const test = async (provider: LlmProviderId) => {
    if (!window.actspace.testProvider) return;
    setBusy(provider);
    setMessage(null);
    try {
      const result = await window.actspace.testProvider({ provider });
      setMessage(result.message);
      await load();
      await onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: LlmProviderId): Promise<string | null> => {
    if (!window.actspace.removeProvider) return "当前版本不支持移除服务商。";
    setBusy(provider);
    try {
      const result = await window.actspace.removeProvider({ provider });
      if (!result.ok) return "error" in result ? result.error.message : "服务商移除失败。";
      await load();
      await onChanged?.();
      setRemoving(null);
      window.requestAnimationFrame(() => addButtonRef.current?.focus());
      return null;
    } catch {
      return "服务商移除失败，请稍后重试。";
    } finally {
      setBusy(null);
    }
  };

  const connectedBalanceKey = PROVIDERS
    .filter((provider) => provider.supportsBalance && providers[provider.id]?.hasApiKey)
    .map((provider) => provider.id)
    .join(",");

  useEffect(() => {
    if (!loaded || !connectedBalanceKey) return;
    const connectedIds = connectedBalanceKey.split(",") as BalanceProviderId[];
    const timer = window.setInterval(() => {
      void Promise.all(connectedIds.map((provider) => loadBalance(provider)));
    }, PROVIDER_BALANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [connectedBalanceKey, loadBalance, loaded]);

  if (!window.actspace?.listProviders) {
    return <SectionShell title="模型连接" description="仅桌面端可配置模型连接。"><div /></SectionShell>;
  }

  if (customDetail) {
    return <CustomConnectionDetail connection={customDetail} onConnectionChange={setCustomDetail} onChanged={onChanged} onBack={() => setCustomDetail(null)} onEdit={(current) => { setEditingCustom(current); setCustomSetup({}); setCustomDetail(null); }} onRemove={async () => { await window.actspace.removeCustomConnection?.({ connectionId: customDetail.connectionId }); setCustomDetail(null); await load(); await onChanged?.(); }} />;
  }

  if (customSetup) {
    return <CustomConnectionSetup initial={editingCustom ?? undefined} catalog={customSetup.catalog} onBack={() => { setCustomSetup(false); if (editingCustom) setCustomDetail(editingCustom); else setAdding({ kind: "catalog" }); setEditingCustom(null); }} onSaved={async () => { setCustomSetup(false); setAdding(null); setEditingCustom(null); await load(); await onChanged?.(); }} />;
  }

  const connectedProviders = PROVIDERS.filter((provider) => isProviderConfigured(providers[provider.id]));
  const providersToAdd = PROVIDERS.filter((provider) => !isProviderConfigured(providers[provider.id]));
  const catalogEntries: CatalogEntry[] = [
    ...providersToAdd.map((provider) => ({ ...provider, kind: "builtin" as const })),
    ...PROVIDER_CATALOG.map((provider) => ({ ...provider, kind: "compatible" as const })),
  ].sort((a, b) => PROVIDER_CATALOG_ORDER.indexOf(a.id as typeof PROVIDER_CATALOG_ORDER[number]) - PROVIDER_CATALOG_ORDER.indexOf(b.id as typeof PROVIDER_CATALOG_ORDER[number]));
  const canAddProvider = loaded && credentialStorage.status === "ready";

  if (detailProvider) {
    const detailMeta = PROVIDERS.find((provider) => provider.id === detailProvider);
    const detailState = providers[detailProvider];
    if (detailMeta && detailState) {
      return (
        <ProviderDetailRoute
          provider={detailMeta}
          state={detailState}
          settings={settings}
          balance={detailMeta.supportsBalance ? balances[detailProvider as BalanceProviderId] : undefined}
          balanceLoading={detailMeta.supportsBalance && balanceLoading[detailProvider as BalanceProviderId] === true}
          balanceError={detailMeta.supportsBalance ? balanceErrors[detailProvider as BalanceProviderId] : undefined}
          onBack={() => setDetailProvider(null)}
          onRefreshBalance={() => { if (detailMeta.supportsBalance) void loadBalance(detailProvider as BalanceProviderId); }}
          onTest={() => void test(detailProvider)}
          onRefreshModels={async () => {
            if (window.actspace.reloadModelCatalog) {
              const result = await window.actspace.reloadModelCatalog({ provider: detailProvider });
              if (!result.error) await onChanged?.();
              return result;
            }
          }}
          onChanged={onChanged}
          isDefault={getDefaultProviderId(settings?.taskModels?.defaultChatModel) === detailProvider}
          onEdit={() => {
            setDetailProvider(null);
            setSetup({ provider: detailProvider, origin: "list" });
          }}
          onRemove={() => {
            setDetailProvider(null);
            setRemoving(detailProvider);
          }}
        />
      );
    }
  }

  if (adding?.kind === "catalog") {
    return (
      <ProviderCatalogRoute
        providers={catalogEntries}
        query={catalogQuery}
        onQueryChange={setCatalogQuery}
        category={catalogCategory}
        onCategoryChange={setCatalogCategory}
        onBack={() => setAdding(null)}
        onSelect={(provider) => {
          setAdding(null);
          if (provider.kind === "builtin") setSetup({ provider: provider.id, origin: "catalog" });
          else setCustomSetup({ catalog: provider });
        }}
      />
    );
  }

  if (setup) {
    const setupMeta = PROVIDERS.find((provider) => provider.id === setup.provider);
    if (setupMeta) {
      return (
        <ProviderSetupRoute
          provider={setup.provider}
          current={providers[setup.provider]}
          onBack={() => {
            if (setup.origin === "catalog") setAdding({ kind: "catalog" });
            setSetup(null);
          }}
          onSaved={async () => {
            setSetup(null);
            await load();
            await onChanged?.();
          }}
        />
      );
    }
  }

  return (
    <>
      <SectionShell
        title="模型连接"
        action={
          <button
            ref={addButtonRef}
            type="button"
            aria-label="添加服务"
            disabled={!canAddProvider}
            onClick={() => setAdding({ kind: "catalog" })}
            className="inline-flex h-9 items-center gap-1.5 rounded-act-md bg-action px-3 text-[13px] font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} aria-hidden="true" />
            添加连接
          </button>
        }
      >
        <div className="w-full">
          {!loaded ? <ProviderConnectionsSkeleton /> : null}

          {loaded && credentialStorage.status === "unavailable" ? (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-act-md border border-danger-soft bg-danger-soft px-3 py-2.5 text-on-danger">
              <CircleAlert className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
              <div>
                <p className="text-[12px] font-semibold">本地凭据暂时无法读取</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{credentialStorage.message}</p>
              </div>
            </div>
          ) : null}

          {loaded && credentialStorage.status === "ready" && connectedProviders.length === 0 && customConnections.length === 0 ? (
            <div className="rounded-act-xl border border-dashed border-line bg-surface px-5 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-main">还没有连接模型服务</p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-faint">点击右上角“添加连接”，选择服务商并配置 API Key。</p>
            </div>
          ) : null}

          {loaded && customConnections.length > 0 ? <div className="w-full divide-y divide-line border-y border-line">
            {customConnections.map((connection) => <button key={connection.connectionId} type="button" className="flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-hover-overlay" onClick={() => setCustomDetail(connection)}><ProviderLogo provider={connection.providerId} logoKey={resolveCatalogLogo(connection.catalogId)} /><span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-text-main">{connection.displayName ?? connection.connectionId}</span><span className="mt-0.5 block truncate text-[11px] text-text-faint">{connection.baseUrl} · 自定义连接</span></span><ChevronRight className="shrink-0 text-text-faint" size={17} aria-hidden="true" /></button>)}
          </div> : null}
          {loaded && connectedProviders.length > 0 ? <div className="w-full divide-y divide-line border-y border-line">
            {connectedProviders.map((provider) => <ConnectionRow key={provider.id} provider={provider} state={providers[provider.id]} isDefault={getDefaultProviderId(settings?.taskModels?.defaultChatModel) === provider.id} onOpen={() => setDetailProvider(provider.id)} />)}
          </div> : null}

          {message ? <p role="status" className="mt-3 rounded-act-md bg-surface-subtle px-3 py-2 text-[12px] text-text-muted">{message}</p> : null}
        </div>
      </SectionShell>

      {removing ? (
        <RemoveProviderDialog
          provider={PROVIDERS.find((provider) => provider.id === removing)!}
          busy={busy === removing}
          onClose={() => setRemoving(null)}
          onConfirm={() => remove(removing)}
        />
      ) : null}
    </>
  );
}

function ConnectionRow({
  provider,
  state,
  isDefault,
  onOpen,
}: {
  provider: (typeof PROVIDERS)[number];
  state?: ProviderSettingsView;
  isDefault: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" aria-label={`${provider.label}${isDefault ? "，默认" : ""}`} onClick={onOpen} className="flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
        <ProviderLogo provider={provider.id} />
        <span className="min-w-0">
          <h4 aria-label={provider.label} className="flex items-center gap-2 text-[14px] font-semibold text-text-main"><span>{provider.label}</span>{isDefault ? <span className="rounded-act-pill bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted">默认</span> : null}<StatusBadge status={state?.lastConnection?.status ?? "untested"} /></h4>
          <span className="mt-0.5 block truncate text-[11px] text-text-faint">{provider.description} · {state?.enabledModelCount ?? 0} / {state?.installedModelCount ?? 0} 个模型启用</span>
        </span>
        <ChevronRight className="ml-auto shrink-0 text-text-faint" size={17} aria-hidden="true" />
    </button>
  );
}

function CustomConnectionDetail({ connection, onConnectionChange, onChanged, onBack, onEdit, onRemove }: { connection: SettingsV4ConnectionSettings; onConnectionChange: (connection: SettingsV4ConnectionSettings) => void; onChanged?: () => void | Promise<void>; onBack: () => void; onEdit: (connection: SettingsV4ConnectionSettings) => void; onRemove: () => void | Promise<void> }) {
  const catalog = findCatalogEntry(connection.catalogId);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [modelRoute, setModelRoute] = useState<{ kind: "add" } | { kind: "edit"; model: import("@actspace/shared").InstalledModelView } | null>(null);
  const [modelRevision, setModelRevision] = useState(0);
  const requestUrl = customConnectionRequestUrl(connection);
  const test = async () => {
    if (!window.actspace.testCustomConnection || !connection.defaultModel) return;
    setTesting(true); setTestMessage(null);
    try {
      const result = await window.actspace.testCustomConnection({ connectionId: connection.connectionId });
      setTestMessage(result.message);
      const snapshot = await window.actspace.getSettingsV4?.();
      const next = snapshot?.settings.models.connections[connection.connectionId];
      if (next) onConnectionChange(next);
      await onChanged?.();
    } catch (error) { setTestMessage(error instanceof Error ? error.message : "模型测试失败。"); }
    finally { setTesting(false); }
  };
  if (modelRoute) return <CustomModelForm connection={connection} model={modelRoute.kind === "edit" ? modelRoute.model : undefined} onBack={() => setModelRoute(null)} onSaved={async () => { setModelRoute(null); setModelRevision((value) => value + 1); await onChanged?.(); }} />;
  return <div className="w-full"><div className="flex items-center gap-3 pb-6"><RouteBack onBack={onBack} label="返回连接" /><ProviderLogo provider={connection.providerId} logoKey={resolveCatalogLogo(connection.catalogId)} /><div className="min-w-0"><h3 className="text-[16px] font-semibold tracking-tight text-text-main">{connection.displayName ?? connection.connectionId}</h3><p className="mt-0.5 truncate text-[12px] text-text-faint">{catalog?.label ?? "自定义兼容连接"} · {connection.connectionId}</p></div></div><div className="divide-y divide-line border-y border-line"><DetailSection title="连接" description="密钥只保存在本机。"><DetailRow label="服务名称" description="可自定义名称，不影响协议和模型绑定。" value={connection.displayName ?? connection.connectionId} action="编辑" onAction={() => onEdit(connection)} /><DetailRow label="协议格式" description="决定认证头、请求体与接口路径。" value={protocolLabel(connection.protocol)} /><DetailRow label="基础地址" description={connection.protocol === "anthropic-messages" ? "Anthropic 请填写站点根地址，不要带 /v1。" : "请求会在此地址后追加协议路径。"} value={connection.baseUrl} action="编辑" onAction={() => onEdit(connection)} /><DetailRow label="实际请求地址" description="连接测试和模型调用使用的最终接口。" value={requestUrl} /><DetailRow label="代理" description="仅此连接使用。" value={connection.proxy?.enabled ? connection.proxy.url ?? "已开启" : "关闭"} action="编辑" onAction={() => onEdit(connection)} />{connection.protocol === "anthropic-messages" ? <DetailRow label="Prompt Cache" description="短缓存会为系统提示、最后一个工具定义和最近用户消息添加缓存断点。" value={connection.promptCacheMode === "off" ? "关闭" : "短缓存"} action="编辑" onAction={() => onEdit(connection)} /> : null}<DetailRow label="默认模型" description="连接测试和未显式选择模型时使用。" value={connection.defaultModel ?? "未设置"} /><div className="flex flex-wrap items-center gap-2 py-4"><button type="button" disabled={testing || !connection.defaultModel} onClick={() => void test()} className="h-9 rounded-act-md bg-surface-subtle px-3 text-[12px] font-semibold text-text-main hover:bg-hover-overlay disabled:cursor-not-allowed disabled:opacity-50">{testing ? "测试中…" : "测试默认模型"}</button><span className="text-[11px] text-text-faint">{connection.defaultModel ? "发送 1 Token 的最小真实请求，不写缓存。" : "请先添加并设置默认模型。"}</span></div>{testMessage ? <p role="status" className="pb-4 text-[12px] text-text-muted">{testMessage}</p> : null}</DetailSection><DetailSection title="模型" description="手动维护此连接可用的模型与计费单价。"><CustomConnectionModels key={modelRevision} connection={connection} onConnectionChange={onConnectionChange} onChanged={onChanged} onAdd={() => setModelRoute({ kind: "add" })} onEdit={(model) => setModelRoute({ kind: "edit", model })} revision={modelRevision} /></DetailSection></div><div className="mt-7 border-t border-line pt-6"><button type="button" className="h-9 rounded-act-md bg-danger-soft px-3 text-[12px] font-semibold text-on-danger hover:opacity-85" onClick={() => void onRemove()}>删除连接</button></div></div>;
}

function ProviderSetupRoute({
  provider,
  current,
  onBack,
  onSaved,
}: {
  provider: LlmProviderId;
  current?: ProviderSettingsView;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const meta = PROVIDERS.find((item) => item.id === provider)!;
  return (
    <div className="w-full" data-provider-route="setup">
      <div className="mb-7 flex items-center gap-3">
        <RouteBack onBack={onBack} label="返回模型连接" />
        <ProviderLogo provider={meta.id} />
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-tight text-text-main">{isProviderConfigured(current) ? `编辑 ${meta.label}` : `连接 ${meta.label}`}</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">完成必要配置后，连接会出现在模型页上方。</p>
        </div>
      </div>
      <ProviderConnectionForm provider={provider} current={current} onClose={onBack} onSaved={onSaved} />
    </div>
  );
}

function CustomConnectionSetup({ initial, catalog, onBack, onSaved }: { initial?: SettingsV4ConnectionSettings; catalog?: ProviderCatalogDefinition; onBack: () => void; onSaved: () => void | Promise<void> }) {
  const [connectionId, setConnectionId] = useState(initial?.connectionId ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? catalog?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? catalog?.defaultBaseUrl ?? "");
  const protocol = initial?.protocol ?? catalog?.protocol ?? "openai-completions";
  const [modelDraft, setModelDraft] = useState(() => emptyCustomModelFormDraft(catalog?.defaultModel ?? ""));
  const [promptCacheMode, setPromptCacheMode] = useState<"short" | "off">(initial?.promptCacheMode ?? (protocol === "anthropic-messages" ? "short" : "off"));
  const [proxyEnabled, setProxyEnabled] = useState(initial?.proxy?.enabled ?? false);
  const [proxyUrl, setProxyUrl] = useState(initial?.proxy?.url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      if (initial) {
        if (!window.actspace.updateCustomConnection) throw new Error("当前版本不支持编辑连接。");
        await window.actspace.updateCustomConnection({ providerId: initial.providerId, connectionId, displayName, apiKey: apiKey.trim() || undefined, baseUrl, catalogId: initial.catalogId, protocol, promptCacheMode, proxy: { enabled: proxyEnabled, url: proxyEnabled ? proxyUrl.trim() : null } });
      } else {
        if (!window.actspace.createCustomConnection) throw new Error("当前版本不支持创建连接。");
        const initialModel = customModelInputFromDraft(modelDraft);
        await window.actspace.createCustomConnection({ providerId: catalog?.runtimeProviderId ?? "openrouter", connectionId: connectionId || undefined, displayName, apiKey: apiKey.trim(), baseUrl, defaultModel: initialModel.apiModel, initialModel, catalogId: catalog?.id, protocol, promptCacheMode, proxy: { enabled: proxyEnabled, url: proxyEnabled ? proxyUrl.trim() : null } });
      }
      await onSaved();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "保存失败。"); }
    finally { setSaving(false); }
  };
  const inputClass = "h-10 w-full rounded-act-md border border-line bg-surface px-3 text-[13px] text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20 disabled:opacity-60";
  return (
    <div className="w-full" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onBack(); }}>
      <div className="mb-7 flex items-center gap-3">
        <RouteBack onBack={onBack} label="返回添加连接" />
        <ProviderLogo provider={catalog?.runtimeProviderId ?? initial?.providerId ?? "openrouter"} logoKey={catalog?.logoKey ?? resolveCatalogLogo(initial?.catalogId)} />
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-tight text-text-main">{initial ? `编辑 ${initial.displayName ?? "自定义兼容服务"}` : `连接 ${catalog?.label ?? "自定义兼容服务"}`}</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">完成必要配置后，连接会出现在模型页上方。</p>
        </div>
      </div>
      <div className="grid gap-5">
        <ApiKeyField name="API Key" configured={Boolean(initial)} value={apiKey} onChange={setApiKey} />
        <Field label="显示名称"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 公司中转站" className={inputClass} /></Field>
        <Field label="服务地址 · 必填"><span className="text-[11px] font-normal leading-relaxed text-text-faint">{protocol === "anthropic-messages" ? "填写站点根地址，例如 https://cheaprouter.cc；系统会调用 /v1/messages。" : "填写协议基础地址，例如 https://example.com/v1。"}</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={protocol === "anthropic-messages" ? "https://example.com" : "https://example.com/v1"} className={inputClass} />{protocol === "anthropic-messages" && /\/v1\/?$/.test(baseUrl) ? <div className="flex items-center gap-2"><span className="text-[11px] text-on-danger">Anthropic 服务地址不要包含末尾 /v1。</span><button type="button" onClick={() => setBaseUrl(baseUrl.replace(/\/v1\/?$/, ""))} className="text-[11px] font-semibold text-action hover:text-text-main">移除 /v1</button></div> : null}</Field>
        {!initial ? <><div className="border-t border-line pt-5"><h4 className="text-[13px] font-semibold text-text-main">第一个模型</h4><p className="mt-1 mb-5 text-[11px] text-text-faint">创建连接时至少添加一个模型；首个模型会自动启用并成为连接默认模型。</p><CustomModelFields draft={modelDraft} onChange={setModelDraft} autoFocusApiModel={false} showEnabled={false} /></div></> : null}
        <details className="group"><summary className="flex cursor-pointer list-none items-center justify-between py-2 text-[13px] font-semibold text-text-main">高级连接设置<ChevronDown size={15} className="group-open:rotate-180" aria-hidden="true" /></summary><div className="grid gap-4 pt-3"><Field label="连接标识"><input value={connectionId} disabled={Boolean(initial)} onChange={(event) => setConnectionId(event.target.value)} placeholder="自动生成" className={inputClass} /></Field><div className="flex items-start justify-between gap-4 rounded-act-md border border-line p-3"><div><p className="text-[12px] font-medium text-text-main">仅为此连接启用代理</p><p className="mt-1 text-[11px] text-text-faint">不会影响其他模型服务。</p></div><Toggle checked={proxyEnabled} onChange={setProxyEnabled} ariaLabel="启用连接代理" /></div>{proxyEnabled ? <Field label="HTTP(S) 代理地址"><input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" className={inputClass} /></Field> : null}{protocol === "anthropic-messages" ? <div className="flex items-start justify-between gap-4 rounded-act-md border border-line p-3"><div><p className="text-[12px] font-medium text-text-main">Anthropic Prompt Cache</p><p className="mt-1 text-[11px] leading-relaxed text-text-faint">短缓存为稳定前缀添加 ephemeral 断点；可关闭以适配不支持缓存的中转站。</p></div><Toggle checked={promptCacheMode === "short"} onChange={(enabled) => setPromptCacheMode(enabled ? "short" : "off")} ariaLabel="启用 Anthropic Prompt Cache" /></div> : null}</div></details>
        {error ? <p role="alert" className="text-[12px] text-on-danger">{error}</p> : null}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="h-9 rounded-act-md px-3 text-[13px] font-medium text-text-main hover:bg-hover-overlay" disabled={saving} onClick={onBack}>取消</button>
        <button type="button" className="h-9 rounded-act-md bg-action px-3 text-[13px] font-medium text-on-action hover:bg-action-hover disabled:opacity-60" disabled={saving || (!initial && !apiKey.trim()) || !baseUrl.trim() || (!initial && !modelDraft.apiModel.trim()) || (proxyEnabled && !proxyUrl.trim())} onClick={() => void save()}>{saving ? "保存中…" : "保存供应商"}</button>
      </div>
    </div>
  );
}

function ProviderDetailRoute({
  provider,
  state,
  settings,
  balance,
  balanceLoading,
  balanceError,
  onBack,
  onRefreshBalance,
  onTest,
  onRefreshModels,
  onChanged,
  isDefault,
  onEdit,
  onRemove,
}: {
  provider: (typeof PROVIDERS)[number];
  state: ProviderSettingsView;
  settings?: AppSettings | null;
  balance?: ProviderBalanceSnapshot;
  balanceLoading: boolean;
  balanceError?: string;
  onBack: () => void;
  onRefreshBalance: () => void;
  onTest: () => void;
  onRefreshModels: () => Promise<ModelsCatalogListResult | undefined>;
  onChanged?: () => void | Promise<void>;
  isDefault: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [modelRevision, setModelRevision] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const modelsChanged = async () => { setModelRevision((value) => value + 1); await onChanged?.(); };
  const refreshModels = async () => {
    setRefreshing(true); setCatalogStatus(null);
    try {
      const result = await onRefreshModels();
      if (!result) throw new Error("unavailable");
      setCatalogStatus({ error: Boolean(result.error), text: result.error ? `更新失败，保留本地目录：${result.error.message}` : `已更新 ${result.models.length} 个模型 · ${result.fetchedAt ? new Date(result.fetchedAt).toLocaleString("zh-CN") : "本地目录"}` });
      if (!result.error) setModelRevision((value) => value + 1);
    } catch { setCatalogStatus({ error: true, text: "更新失败，已保留本地目录。请检查连接后重试。" }); }
    finally { setRefreshing(false); }
  };
  const address = state.baseUrl ?? PROVIDER_REGISTRY[provider.id].defaultBaseUrl;
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 pb-6">
        <RouteBack onBack={onBack} label="返回模型连接" />
        <ProviderLogo provider={provider.id} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold tracking-tight text-text-main">{provider.label}</h3>
            {isDefault ? <span className="rounded-act-pill bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted">默认</span> : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-text-faint">{provider.description} · {categoryLabel(provider.category)}</p>
        </div>
      </div>

      <div className="divide-y divide-line border-y border-line">
        <DetailSection title="连接" description="密钥只保存在本机。">
          <DetailRow label="模型密钥" description="" value={state.hasApiKey ? "已设置" : "未设置"} action="更换" onAction={onEdit} />
          {provider.supportsBalance ? <ProviderBalanceRow provider={provider} balance={balance} loading={balanceLoading} error={balanceError} onRefresh={onRefreshBalance} /> : null}
        </DetailSection>

        <DetailSection title="高级连接设置" description="为这个连接设置服务地址和代理。">
          <DetailRow label="接入地址" description="请求将发送到此地址。" value={compactAddress(address)} action="编辑" onAction={onEdit} />
          <DetailRow label="代理" description="仅为此服务商启用代理。" value={state.proxy?.enabled ? compactAddress(state.proxy.url ?? "已开启") : "关闭"} action="编辑" onAction={onEdit} />
        </DetailSection>

        <DetailSection title="模型" description="这些模型会出现在任务的模型选择器中。">
          <div className="min-w-0">
            {settings ? <ModelSettings key={modelRevision} settings={settings} providerFilter={provider.id} embedded embeddedPlain onChanged={onChanged} /> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="h-9 rounded-act-md bg-surface-subtle px-3 text-[12px] font-semibold text-text-main hover:bg-hover-overlay" onClick={onTest}>测试连接</button>
              <button type="button" className="h-9 rounded-act-md px-3 text-[12px] font-semibold text-text-main hover:bg-hover-overlay disabled:opacity-50" disabled={!provider.supportsModelDiscovery || refreshing} onClick={() => void refreshModels()}>{refreshing ? "更新中…" : "更新模型目录"}</button>
              {provider.supportsModelDiscovery ? <button type="button" className="h-9 rounded-act-md px-3 text-[12px] font-semibold text-text-main hover:bg-hover-overlay" onClick={() => setCatalogOpen(true)}>从目录添加</button> : null}
            </div>
            {catalogStatus ? <p role={catalogStatus.error ? "alert" : "status"} className={`mt-2 text-[12px] ${catalogStatus.error ? "text-on-danger" : "text-text-muted"}`}>{catalogStatus.text}</p> : null}
            {provider.id === "deepseek" ? <p className="mt-2 text-[12px] leading-relaxed text-text-faint">V4.1 Flash 支持图片理解。费用按官方美元高峰价估算；目录刷新发现模型，价格由 ActSpace 官方档案维护。</p> : null}
            {catalogOpen && provider.supportsModelDiscovery ? <OpenRouterModelCatalogDialog provider={provider.id} onClose={() => setCatalogOpen(false)} onAdded={modelsChanged} onReloaded={modelsChanged} /> : null}
          </div>
        </DetailSection>
      </div>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)_minmax(220px,416px)] gap-6 border-t border-line pt-6 max-[600px]:grid-cols-1 max-[600px]:gap-2">
        <div>
          <h4 className="text-[13px] font-semibold text-text-main">删除连接</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">此操作不可撤销。</p>
        </div>
        <div>
          <button type="button" className="h-9 rounded-act-md bg-danger-soft px-3 text-[12px] font-semibold text-on-danger hover:opacity-85" onClick={onRemove}>删除</button>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)_minmax(220px,416px)] gap-6 py-6 max-[600px]:grid-cols-1 max-[600px]:gap-2">
      <div>
        <h4 className="text-[13px] font-semibold text-text-main">{title}</h4>
        {description ? <p className="mt-1 max-w-[42ch] text-[11px] leading-relaxed text-text-faint">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ProviderBalanceRow({ provider, balance, loading, error, onRefresh }: { provider: (typeof PROVIDERS)[number]; balance?: ProviderBalanceSnapshot; loading: boolean; error?: string; onRefresh: () => void }) {
  const display = balance?.displayBalance;
  const value = display ? `${getBalanceSymbol(display.currency)}${display.amount} ${display.currency}` : "--";
  const helper = loading ? "正在刷新…" : error ? "刷新失败，已保留上次结果" : provider.id === "openrouter" && balance?.isConfigured === false ? "需配置 Management Key" : "每 5 分钟刷新";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-line py-4">
      <div className="min-w-0">
        <h4 className="text-[13px] font-medium text-text-main">账户余额</h4>
        <p className={`mt-1 text-[11px] leading-relaxed ${error ? "text-on-danger" : "text-text-faint"}`} role={error ? "status" : undefined}>{helper}</p>
      </div>
      <div className="flex items-center justify-end gap-3">
        <span className="text-[15px] font-semibold tabular-nums text-text-main" aria-label={`${provider.label} 账户余额`}>{value}</span>
        <button type="button" aria-label={`刷新 ${provider.label} 账户余额`} className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md text-text-muted hover:bg-hover-overlay hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={onRefresh}><RefreshCw size={14} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function DetailRow({ label, description, value, action, onAction }: { label: string; description: string; value: string; action?: string; onAction?: () => void }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4"><div className="min-w-0"><h4 className="text-[13px] font-medium text-text-main">{label}</h4>{description ? <p className="mt-1 text-[11px] leading-relaxed text-text-faint">{description}</p> : null}</div><div className="flex min-w-0 items-center justify-end gap-3 text-[13px] text-text-main"><span className="max-w-[240px] truncate">{value}</span>{action && onAction ? <button type="button" aria-label={`${action}${label}`} className="shrink-0 font-semibold text-text-main hover:text-action" onClick={onAction}>{action}</button> : null}</div></div>;
}

function RouteBack({ onBack, label }: { onBack: () => void; label: string }) {
  return <button type="button" aria-label="返回连接" title={label} onClick={onBack} className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-act-md text-text-muted hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"><ArrowLeft size={17} aria-hidden="true" /></button>;
}

function RemoveProviderDialog({
  provider,
  busy,
  onClose,
  onConfirm,
}: {
  provider: (typeof PROVIDERS)[number];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  const confirm = async () => {
    setError(null);
    const nextError = await onConfirm();
    if (nextError) setError(nextError);
  };
  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[160] grid place-items-center bg-scrim px-5" role="alertdialog" aria-modal="true" aria-labelledby="remove-provider-dialog-title" aria-describedby="remove-provider-dialog-description" onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); else trapTabKey(event); }}>
      <div className="w-full max-w-[460px] rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <h2 id="remove-provider-dialog-title" className="text-[18px] font-semibold text-text-main">移除 {provider.label}？</h2>
        <p id="remove-provider-dialog-description" className="mt-2 text-[12px] leading-relaxed text-text-muted">将清除该服务商的所有 API Key、接入地址、代理和连接状态。已添加模型、历史会话与用量记录会保留，但相关模型将暂时不可用。</p>
        {error ? <p role="alert" className="mt-3 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" autoFocus className="h-10 rounded-act-md border border-line px-4 text-[13px] font-semibold text-text-main hover:bg-surface-subtle disabled:opacity-50" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="h-10 rounded-act-md bg-danger-soft px-4 text-[13px] font-semibold text-on-danger hover:opacity-85 disabled:opacity-50" onClick={() => void confirm()} disabled={busy}>{busy ? "移除中…" : "移除服务商"}</button>
        </div>
      </div>
    </div>
  );
}

function getBalanceSymbol(currency: string): string {
  if (currency === "CNY") return "¥";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "";
}

function getDefaultProviderId(modelKey?: string | null): LlmProviderId | null {
  const provider = modelKey?.split(":", 1)[0];
  return provider === "deepseek" || provider === "kimi" || provider === "openrouter" ? provider : null;
}

function StatusBadge({ status }: { status: string }) {
  const bad = status === "unavailable";
  const available = status === "available";
  return (
    <span className={`inline-flex items-center gap-1 rounded-act-pill px-2 py-1 text-[10px] font-semibold ${bad ? "bg-danger-soft text-on-danger" : "bg-success-soft text-on-success"}`}>
      {bad ? <CircleAlert size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}
      {bad ? "连接异常" : available ? "可用" : "已连接"}
    </span>
  );
}

function ProviderFact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-text-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text-main" title={title ?? value}>{value}</dd>
    </div>
  );
}

function ProviderConnectionsSkeleton() {
  return (
    <ul className="w-full list-none divide-y divide-line border-y border-line" aria-label="正在加载服务商" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <li key={item} aria-hidden="true" className="flex min-h-[68px] items-center gap-3 px-3.5 py-3 motion-safe:animate-pulse">
          <span className="h-9 w-9 shrink-0 rounded-act-md bg-surface-subtle" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3.5 w-24 max-w-full rounded-act-sm bg-surface-subtle" />
            <span className="block h-2.5 w-48 max-w-full rounded-act-sm bg-surface-subtle" />
          </span>
          <ChevronRight size={17} className="shrink-0 text-text-subtle" />
        </li>
      ))}
    </ul>
  );
}

function ProviderCatalogRoute({
  providers,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  onBack,
  onSelect,
}: {
  providers: CatalogEntry[];
  query: string;
  onQueryChange: (query: string) => void;
  category: "all" | ProviderCategory;
  onCategoryChange: (category: "all" | ProviderCategory) => void;
  onBack: () => void;
  onSelect: (provider: CatalogEntry) => void;
}) {
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = providers.filter((provider) => (category === "all" || provider.category === category) && [provider.label, provider.description, provider.id]
    .some((value) => value.toLocaleLowerCase().includes(normalized)));
  return (
    <div className="w-full">
      <div className="mb-6 flex items-center gap-3">
        <RouteBack onBack={onBack} label="返回模型连接" />
        <div>
          <h3 className="text-[16px] font-semibold tracking-tight text-text-main">添加连接</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">选择一个服务商，然后配置 API Key 和连接参数。</p>
        </div>
      </div>
      <div className="w-full">
        <div className="flex items-center gap-3 max-[600px]:flex-col max-[600px]:items-stretch">
        <label className="relative block w-[220px] max-[600px]:w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <input
            autoFocus
            aria-label="搜索模型服务"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索服务商"
            className="h-10 w-full rounded-act-md border border-line bg-surface-subtle pl-9 pr-3 text-[13px] text-text-main outline-none placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20"
          />
        </label>
        <select aria-label="服务商类型" value={category} onChange={(event) => onCategoryChange(event.target.value as "all" | ProviderCategory)} className="ml-auto h-10 rounded-act-md border border-line bg-surface px-3 text-[13px] text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20 max-[600px]:ml-0"><option value="all">全部</option><option value="direct">官方直连</option><option value="coding">Coding Plan</option><option value="compatible">第三方兼容</option><option value="custom">自定义</option></select>
        </div>
        {filtered.length === 0 ? (
          <div className="mt-4 border-y border-dashed border-line px-4 py-8 text-center text-[12px] text-text-faint"><p>没有匹配的服务商。</p><button type="button" className="mt-2 rounded-act-md px-3 py-2 text-text-main hover:bg-hover-overlay" onClick={() => { onQueryChange(""); onCategoryChange("all"); }}>清除筛选</button></div>
        ) : (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {filtered.map((provider) => {
              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-label={`选择 ${provider.label}`}
                  onClick={() => onSelect(provider)}
                  className="flex w-full items-center gap-3 px-2 py-3.5 text-left hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <ProviderLogo provider={provider.kind === "builtin" ? provider.id : provider.runtimeProviderId ?? "openrouter"} logoKey={provider.logoKey} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-text-main">{provider.label}</span>
                    <span className="mt-0.5 block text-[11px] text-text-faint">{provider.description} · {categoryLabel(provider.category)}</span>
                  </span>
                  <ChevronRight className="shrink-0 text-text-faint" size={17} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderConnectionForm({
  provider,
  current,
  onClose,
  onSaved,
}: {
  provider: LlmProviderId;
  current?: ProviderSettingsView;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const meta = PROVIDERS.find((item) => item.id === provider)!;
  const [apiKey, setApiKey] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [showManagementKey, setShowManagementKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [proxyEnabled, setProxyEnabled] = useState(Boolean(current?.proxy?.enabled));
  const [proxyUrl, setProxyUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDefaultKey = Boolean(current?.hasApiKey);
  const configured = isProviderConfigured(current);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const nextProxy = proxyEnabled
        ? { enabled: true, url: proxyUrl.trim() || null }
        : { enabled: false, url: null };
      const updateProxy = proxyEnabled && current?.proxy?.enabled && !proxyUrl.trim()
        ? undefined
        : nextProxy;
      const result = hasDefaultKey || (configured && !apiKey.trim())
        ? await window.actspace.updateProvider?.({
            provider,
            ...(apiKey.trim() && { apiKey: apiKey.trim() }),
            ...(provider === "openrouter" && managementKey.trim() && { managementKey: managementKey.trim() }),
            baseUrl: baseUrl || null,
            ...(updateProxy && { proxy: updateProxy }),
          })
        : await window.actspace.connectProvider?.({
            provider,
            apiKey,
            ...(provider === "openrouter" && { managementKey: managementKey.trim() || null }),
            baseUrl: baseUrl || null,
            proxy: nextProxy,
          });
      if (!result || !result.ok) { setError(result && "error" in result ? result.error.message : "保存失败。"); return; }
      await onSaved();
    } catch { setError("保存失败，请稍后重试。"); }
    finally { setSaving(false); }
  };

  return (
    <div className="w-full" onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.stopPropagation(); onClose(); } }}>
      <div className="w-full">
        <div className="grid gap-4">
          <ApiKeyField name={`${meta.label} API Key`} configured={configured} value={apiKey} onChange={setApiKey} />
          <details open={configured} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-[13px] font-semibold text-text-main"><span><span className="group-open:hidden">展开</span><span className="hidden group-open:inline">收起</span>高级连接设置</span><ChevronDown size={15} className="text-text-faint group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="grid gap-4 border-t border-line pb-3 pt-3">
          {provider === "openrouter" ? (
            <Field label="Management Key（可选，用于账户余额）">
              <div className="flex"><input aria-label="OpenRouter Management Key" type={showManagementKey ? "text" : "password"} value={managementKey} onChange={(event) => setManagementKey(event.target.value)} placeholder={current?.hasManagementKey ? "已配置；留空保持不变" : "sk-or-v1-..."} className="h-10 min-w-0 flex-1 rounded-l-act-md border border-r-0 border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20" /><button type="button" aria-label={showManagementKey ? "隐藏 Management Key" : "显示 Management Key"} className="grid h-10 w-10 place-items-center rounded-r-act-md border border-line bg-surface-subtle text-text-faint hover:text-text-main" onClick={() => setShowManagementKey((visible) => !visible)}>{showManagementKey ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
              <span className="text-[11px] leading-relaxed text-text-faint">只用于 OpenRouter /credits 查询；移除服务商时会一并清除。</span>
            </Field>
          ) : null}
          <Field label="Base URL（可选）"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="使用服务商默认地址" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field>
          <label className="flex min-h-11 items-center justify-between rounded-act-md border border-line px-3"><span className="text-[13px] font-medium text-text-main">仅为此服务商启用代理</span><input type="checkbox" checked={proxyEnabled} onChange={(event) => setProxyEnabled(event.target.checked)} /></label>
          {proxyEnabled ? <Field label="HTTP(S) 代理地址"><input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder={current?.proxy?.enabled ? "已配置；留空保持不变" : "http://127.0.0.1:7890"} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field> : null}
            </div>
          </details>
          {error ? <p role="alert" className="text-[12px] text-on-danger">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} className="h-9 rounded-act-md px-3 text-[13px] text-text-main hover:bg-hover-overlay disabled:opacity-60" onClick={onClose}>取消</button><button type="button" aria-label="保存" className="h-9 rounded-act-md bg-action px-4 text-[13px] font-semibold text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || (!configured && !apiKey.trim()) || (proxyEnabled && !proxyUrl.trim() && !current?.proxy?.enabled)} onClick={() => void save()}>{saving ? "保存中…" : "保存供应商"}</button></div>
      </div>
    </div>
  );
}

function isProviderConfigured(provider?: ProviderSettingsView): boolean {
  return Boolean(provider?.hasApiKey || provider?.additionalCredentials?.some((credential) => credential.hasApiKey));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[12px] font-semibold text-text-muted">{label}</span>{children}</label>;
}

function compactAddress(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function protocolLabel(protocol: SettingsV4ConnectionSettings["protocol"]): string {
  if (protocol === "anthropic-messages") return "Anthropic Messages";
  if (protocol === "openai-responses") return "OpenAI Responses";
  return "OpenAI Chat Completions";
}

function customConnectionRequestUrl(connection: SettingsV4ConnectionSettings): string {
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");
  if (connection.protocol === "anthropic-messages") return `${baseUrl}/v1/messages`;
  if (connection.protocol === "openai-responses") return `${baseUrl}/responses`;
  return `${baseUrl}/chat/completions`;
}

function ApiKeyField({ name, configured, value, onChange }: { name: string; configured: boolean; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={configured ? "API Key（可选）" : "API Key · 必填"}>
      <span className="flex rounded-act-md border border-line bg-surface focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/20">
        <input aria-label={name} autoFocus type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? "留空以保留当前 Key" : "输入或粘贴 API Key"} className="h-9 min-w-0 flex-1 rounded-l-act-md bg-transparent px-3 text-[13px] text-text-main outline-none" />
        <button type="button" aria-label={visible ? "隐藏 API Key" : "显示 API Key"} className="grid h-9 w-10 place-items-center rounded-r-act-md border-l border-line text-text-muted hover:bg-hover-overlay" onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </span>
    </Field>
  );
}

function categoryLabel(category: ProviderCategory): string {
  return { direct: "官方直连", compatible: "第三方兼容", coding: "Coding Plan", custom: "自定义" }[category];
}

function findCatalogEntry(catalogId?: string): ProviderCatalogDefinition | undefined {
  return catalogId ? PROVIDER_CATALOG.find((entry) => entry.id === catalogId) : undefined;
}

function resolveCatalogLogo(catalogId?: string) {
  return findCatalogEntry(catalogId)?.logoKey ?? "generic";
}
