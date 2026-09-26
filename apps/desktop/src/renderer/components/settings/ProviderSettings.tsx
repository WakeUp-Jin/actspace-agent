import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  ChevronLeft,
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
import { SectionShell, SettingGroup, SettingLinkRow, SettingRow, SettingSubhead, SettingTag, SettingsInput, StatusDot } from "./SettingsPrimitives";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModelSettings } from "./ModelSettings";
import { ProviderLogo } from "./ProviderLogo";
import { CustomModelFields, customModelInputFromDraft, emptyCustomModelFormDraft } from "./CustomModelForm";
import { CustomConnectionDetail } from "./CustomConnectionDetail";
import { CustomConnectionWizard } from "./CustomConnectionWizard";
import { AnthropicKeySetup } from "./AnthropicKeySetup";
import { ConnectionStatusDot, hostOf, isOfficialAnthropic, protocolLabel, protocolLogoKey } from "./custom-connection-shared";
import { Toggle } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

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
  const [setup, setSetup] = useState<{ provider: LlmProviderId; origin: "list" | "catalog" } | null>(null);
  // 兼容预设（Z.AI 等）仍走旧的单页表单；「自定义服务」和官方 Anthropic 走新流程。
  const [customSetup, setCustomSetup] = useState<{ catalog: ProviderCatalogDefinition } | null>(null);
  const [customFlow, setCustomFlow] = useState<"custom" | "anthropic" | null>(null);
  const [detailProvider, setDetailProvider] = useState<LlmProviderId | null>(null);
  const [customConnections, setCustomConnections] = useState<SettingsV4ConnectionSettings[]>([]);
  const [customDetail, setCustomDetail] = useState<{ connection: SettingsV4ConnectionSettings; autoTest: boolean } | null>(null);
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

  const openSavedConnection = async (connectionId: string, autoTest: boolean) => {
    setCustomFlow(null);
    setAdding(null);
    await load();
    await onChanged?.();
    const snapshot = await window.actspace.getSettingsV4?.();
    const connection = snapshot?.settings.models.connections[connectionId];
    if (connection) setCustomDetail({ connection, autoTest });
  };

  if (customDetail) {
    return (
      <CustomConnectionDetail
        key={customDetail.connection.connectionId}
        connection={customDetail.connection}
        autoTest={customDetail.autoTest}
        onConnectionChange={(connection) => setCustomDetail((current) => current ? { ...current, connection } : current)}
        onChanged={async () => { await load(); await onChanged?.(); }}
        onBack={() => setCustomDetail(null)}
        onRemove={async () => {
          if (!window.actspace.removeCustomConnection) throw new Error("当前版本不支持删除连接。");
          await window.actspace.removeCustomConnection({ connectionId: customDetail.connection.connectionId });
          setCustomDetail(null);
          await load();
          await onChanged?.();
        }}
      />
    );
  }

  if (customFlow) {
    const back = () => { setCustomFlow(null); setAdding({ kind: "catalog" }); };
    return customFlow === "anthropic"
      ? <AnthropicKeySetup onCancel={back} onSaved={openSavedConnection} />
      : <CustomConnectionWizard onCancel={back} onSaved={openSavedConnection} />;
  }

  if (customSetup) {
    return <CustomConnectionSetup catalog={customSetup.catalog} onBack={() => { setCustomSetup(null); setAdding({ kind: "catalog" }); }} onSaved={async () => { setCustomSetup(null); setAdding(null); await load(); await onChanged?.(); }} />;
  }

  const connectedProviders = PROVIDERS.filter((provider) => isProviderConfigured(providers[provider.id]));
  const providersToAdd = PROVIDERS.filter((provider) => !isProviderConfigured(providers[provider.id]));
  const catalogEntries: CatalogEntry[] = [
    ...providersToAdd.map((provider) => ({ ...provider, kind: "builtin" as const })),
    ...PROVIDER_CATALOG.filter((provider) => !provider.hidden).map((provider) => ({ ...provider, kind: "compatible" as const })),
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
          testing={busy === detailProvider}
          testMessage={message}
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
        onBack={() => setAdding(null)}
        onSelect={(provider) => {
          setAdding(null);
          if (provider.kind === "builtin") setSetup({ provider: provider.id, origin: "catalog" });
          else if (provider.id === "custom" || provider.id === "anthropic") setCustomFlow(provider.id);
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

  const defaultProviderId = getDefaultProviderId(settings?.taskModels?.defaultChatModel);
  const hasRows = loaded && (connectedProviders.length > 0 || customConnections.length > 0);
  return (
    <>
      <SectionShell
        title="模型连接"
        action={
          <Button
            ref={addButtonRef}
            variant="primary"
            aria-label="添加服务"
            disabled={!canAddProvider}
            onClick={() => setAdding({ kind: "catalog" })}
          >
            <Plus size={14} aria-hidden="true" />
            添加连接
          </Button>
        }
      >
        {!loaded ? <ProviderConnectionsSkeleton /> : null}

        {loaded && credentialStorage.status === "unavailable" ? (
          <div role="alert" className="flex items-start gap-2 rounded-act-group border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-on-danger">
            <CircleAlert className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
            <div>
              <p className="text-act-xs font-medium">本地凭据暂时无法读取</p>
              <p className="mt-0.5 text-act-xs leading-relaxed">{credentialStorage.message}</p>
            </div>
          </div>
        ) : null}

        {loaded && credentialStorage.status === "ready" && !hasRows ? (
          <div className="rounded-act-group border border-dashed border-line bg-surface px-5 py-8 text-center">
            <p className="text-act-sm font-medium text-text-main">还没有连接模型服务</p>
            <p className="mt-1 text-act-xs leading-relaxed text-text-muted">点击右上角「添加连接」，选择服务商并配置 API Key。</p>
          </div>
        ) : null}

        {hasRows ? (
          <div className="divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface">
            {connectedProviders.map((provider) => <ConnectionRow key={provider.id} provider={provider} state={providers[provider.id]} isDefault={defaultProviderId === provider.id} onOpen={() => setDetailProvider(provider.id)} />)}
            {customConnections.map((connection) => (
              <SettingLinkRow
                key={connection.connectionId}
                leading={<ProviderLogo provider={connection.providerId} logoKey={protocolLogoKey(connection.protocol)} />}
                title={<h4 className="text-act-sm font-medium">{connection.displayName ?? connection.connectionId}</h4>}
                description={isOfficialAnthropic(connection) ? "Anthropic 官方 API" : `${protocolLabel(connection.protocol)} · ${hostOf(connection.baseUrl)}`}
                trailing={<ConnectionStatusDot status={connection.lastConnection?.status} />}
                onClick={() => setCustomDetail({ connection, autoTest: false })}
              />
            ))}
          </div>
        ) : null}

        {message ? <p role="status" className="px-0.5 text-act-xs text-text-muted">{message}</p> : null}
      </SectionShell>

      {removing ? (
        <RemoveProviderDialog
          provider={PROVIDERS.find((provider) => provider.id === removing)!}
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
    <SettingLinkRow
      ariaLabel={`${provider.label}${isDefault ? "，默认" : ""}`}
      leading={<ProviderLogo provider={provider.id} />}
      title={<><h4 aria-label={provider.label} className="text-act-sm font-medium">{provider.label}</h4>{isDefault ? <SettingTag>默认</SettingTag> : null}</>}
      description={`${provider.description} · ${state?.enabledModelCount ?? 0} / ${state?.installedModelCount ?? 0} 个模型启用`}
      trailing={<StatusBadge status={state?.lastConnection?.status ?? "untested"} />}
      onClick={onOpen}
    />
  );
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
          <h3 className="text-act-lg font-semibold tracking-tight text-text-main">{isProviderConfigured(current) ? `编辑 ${meta.label}` : `连接 ${meta.label}`}</h3>
          <p className="mt-0.5 text-act-xs leading-relaxed text-text-faint">完成必要配置后，连接会出现在模型页上方。</p>
        </div>
      </div>
      <ProviderConnectionForm provider={provider} current={current} onClose={onBack} onSaved={onSaved} />
    </div>
  );
}

/** 兼容预设（Z.AI、火山方舟等）的单页表单：Key、地址和第一个模型。 */
function CustomConnectionSetup({ catalog, onBack, onSaved }: { catalog: ProviderCatalogDefinition; onBack: () => void; onSaved: () => void | Promise<void> }) {
  const [connectionId, setConnectionId] = useState("");
  const [displayName, setDisplayName] = useState(catalog.label);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(catalog.defaultBaseUrl ?? "");
  const protocol = catalog.protocol ?? "openai-completions";
  const [modelDraft, setModelDraft] = useState(() => emptyCustomModelFormDraft(catalog.defaultModel ?? ""));
  const [promptCacheMode, setPromptCacheMode] = useState<"short" | "off">(protocol === "anthropic-messages" ? "short" : "off");
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      if (!window.actspace.createCustomConnection) throw new Error("当前版本不支持创建连接。");
      const initialModel = customModelInputFromDraft(modelDraft);
      await window.actspace.createCustomConnection({ providerId: catalog.runtimeProviderId ?? "openrouter", connectionId: connectionId || undefined, displayName, apiKey: apiKey.trim(), baseUrl, defaultModel: initialModel.apiModel, initialModel, catalogId: catalog.id, protocol, promptCacheMode, proxy: { enabled: proxyEnabled, url: proxyEnabled ? proxyUrl.trim() : null } });
      await onSaved();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "保存失败。"); }
    finally { setSaving(false); }
  };
  const inputClass = "h-10 w-full rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20 disabled:opacity-60";
  return (
    <div className="w-full" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onBack(); }}>
      <div className="mb-7 flex items-center gap-3">
        <RouteBack onBack={onBack} label="返回添加连接" />
        <ProviderLogo provider={catalog.runtimeProviderId ?? "openrouter"} logoKey={catalog.logoKey} />
        <div className="min-w-0">
          <h3 className="text-act-lg font-semibold tracking-tight text-text-main">{`连接 ${catalog.label}`}</h3>
          <p className="mt-0.5 text-act-xs leading-relaxed text-text-faint">完成必要配置后，连接会出现在模型页上方。</p>
        </div>
      </div>
      <div className="grid gap-5">
        <ApiKeyField name="API Key" configured={false} value={apiKey} onChange={setApiKey} />
        <Field label="显示名称"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 公司中转站" className={inputClass} /></Field>
        <Field label="服务地址 · 必填"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" className={inputClass} /></Field>
        <div className="border-t border-line pt-5"><h4 className="text-act-sm font-semibold text-text-main">第一个模型</h4><p className="mt-1 mb-5 text-act-xxs text-text-faint">创建连接时至少添加一个模型；首个模型会自动启用并成为连接默认模型。</p><CustomModelFields draft={modelDraft} onChange={setModelDraft} autoFocusApiModel={false} showEnabled={false} /></div>
        <details className="group"><summary className="flex cursor-pointer list-none items-center justify-between py-2 text-act-sm font-semibold text-text-main">高级连接设置<ChevronDown size={15} className="group-open:rotate-180" aria-hidden="true" /></summary><div className="grid gap-4 pt-3"><Field label="连接标识"><input value={connectionId} onChange={(event) => setConnectionId(event.target.value)} placeholder="自动生成" className={inputClass} /></Field><div className="flex items-start justify-between gap-4 rounded-act-md border border-line p-3"><div><p className="text-act-xs font-medium text-text-main">仅为此连接启用代理</p><p className="mt-1 text-act-xxs text-text-faint">不会影响其他模型服务。</p></div><Toggle checked={proxyEnabled} onChange={setProxyEnabled} ariaLabel="启用连接代理" /></div>{proxyEnabled ? <Field label="HTTP(S) 代理地址"><input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" className={inputClass} /></Field> : null}{protocol === "anthropic-messages" ? <div className="flex items-start justify-between gap-4 rounded-act-md border border-line p-3"><div><p className="text-act-xs font-medium text-text-main">Anthropic Prompt Cache</p><p className="mt-1 text-act-xxs leading-relaxed text-text-faint">短缓存为稳定前缀添加 ephemeral 断点；可关闭以适配不支持缓存的中转站。</p></div><Toggle checked={promptCacheMode === "short"} onChange={(enabled) => setPromptCacheMode(enabled ? "short" : "off")} ariaLabel="启用 Anthropic Prompt Cache" /></div> : null}</div></details>
        {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="md" disabled={saving} onClick={onBack}>取消</Button>
        <Button variant="primary" size="md" disabled={saving || !apiKey.trim() || !baseUrl.trim() || !modelDraft.apiModel.trim() || (proxyEnabled && !proxyUrl.trim())} onClick={() => void save()}>{saving ? "保存中…" : "保存连接"}</Button>
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
  testing = false,
  testMessage,
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
  testing?: boolean;
  testMessage?: string | null;
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
    <div className="flex w-full flex-col gap-9">
      <DetailHeader
        onBack={onBack}
        logo={<ProviderLogo provider={provider.id} />}
        title={provider.label}
        tag={isDefault ? <SettingTag>默认</SettingTag> : null}
        subtitle={<>{provider.description} · {categoryLabel(provider.category)} · <StatusBadge status={state.lastConnection?.status ?? "untested"} /></>}
      />

      <DetailSection title="连接" description="密钥只保存在本机。">
        <DetailRow label="模型密钥" value={state.hasApiKey ? "已设置" : "未设置"} action="更换" onAction={onEdit} />
        <SettingRow
          title="连接测试"
          description={testMessage ? <span role="status">{testMessage}</span> : "发送一次最小请求，确认 Key 与地址可用。"}
          control={<Button busy={testing} disabled={testing} onClick={onTest}>{testing ? "测试中…" : "测试连接"}</Button>}
        />
        {provider.supportsBalance ? <ProviderBalanceRow provider={provider} balance={balance} loading={balanceLoading} error={balanceError} onRefresh={onRefreshBalance} /> : null}
      </DetailSection>

      <DetailSection
        title="模型"
        description="这些模型会出现在任务的模型选择器中。"
        plain
        action={
          <>
            <Button variant="ghost" busy={refreshing} disabled={!provider.supportsModelDiscovery || refreshing} onClick={() => void refreshModels()}>
              {refreshing ? null : <RefreshCw size={13} aria-hidden="true" />}
              {refreshing ? "更新中…" : "更新模型目录"}
            </Button>
            {provider.supportsModelDiscovery ? (
              <Button onClick={() => setCatalogOpen(true)}>
                <Plus size={13} aria-hidden="true" />
                从目录添加
              </Button>
            ) : null}
          </>
        }
      >
        {settings ? <ModelSettings key={modelRevision} settings={settings} providerFilter={provider.id} embedded embeddedPlain onChanged={onChanged} /> : null}
        {catalogStatus ? <p role={catalogStatus.error ? "alert" : "status"} className={`px-0.5 text-act-xs ${catalogStatus.error ? "text-on-danger" : "text-text-muted"}`}>{catalogStatus.text}</p> : null}
        {provider.id === "deepseek" ? <p className="px-0.5 text-act-xs leading-relaxed text-text-faint">V4.1 Flash 支持图片理解。费用按官方美元高峰价估算；目录刷新发现模型，价格由 ActSpace 官方档案维护。</p> : null}
        {catalogOpen && provider.supportsModelDiscovery ? <OpenRouterModelCatalogDialog provider={provider.id} onClose={() => setCatalogOpen(false)} onAdded={modelsChanged} onReloaded={modelsChanged} /> : null}
      </DetailSection>

      <DetailSection title="高级连接设置" description="为这个连接设置服务地址和代理。">
        <DetailRow label="接入地址" value={compactAddress(address)} mono action="编辑" onAction={onEdit} />
        <DetailRow label="代理" value={state.proxy?.enabled ? compactAddress(state.proxy.url ?? "已开启") : "未使用"} action="编辑" onAction={onEdit} />
      </DetailSection>

      <DetailSection title="危险操作">
        <DetailRow
          label="删除连接"
          description="清除 Key、接入地址和代理；已添加模型、历史会话与使用统计会保留。"
          control={<Button variant="danger" onClick={onRemove}>删除</Button>}
        />
      </DetailSection>
    </div>
  );
}

function DetailHeader({ onBack, logo, title, tag, subtitle }: { onBack: () => void; logo: React.ReactNode; title: string; tag?: React.ReactNode; subtitle: React.ReactNode }) {
  return (
    <div>
      <RouteBack onBack={onBack} label="模型" />
      <div className="mt-2 flex items-center gap-3">
        <span className="shrink-0 [&>*]:h-10 [&>*]:w-10">{logo}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-act-lg font-semibold tracking-tight text-text-main">{title}</h3>
            {tag}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-act-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/** 连接详情里的一个分组：h4 标题 + 内嵌分组；plain 时内容自己负责容器（例如模型目录）。 */
function DetailSection({ title, description, action, plain = false, children }: { title: string; description?: string; action?: React.ReactNode; plain?: boolean; children: React.ReactNode }) {
  if (!plain) return <SettingGroup title={title} description={description} action={action}>{children}</SettingGroup>;
  return <SectionShell title={title} description={description} action={action} headingLevel={4}>{children}</SectionShell>;
}

function ProviderBalanceRow({ provider, balance, loading, error, onRefresh }: { provider: (typeof PROVIDERS)[number]; balance?: ProviderBalanceSnapshot; loading: boolean; error?: string; onRefresh: () => void }) {
  const display = balance?.displayBalance;
  const value = display ? `${getBalanceSymbol(display.currency)}${display.amount} ${display.currency}` : "--";
  const helper = loading ? "正在刷新…" : error ? "刷新失败，已保留上次结果" : provider.id === "openrouter" && balance?.isConfigured === false ? "需配置 Management Key" : "每 5 分钟刷新";
  return (
    <SettingRow
      title={<h4 className="text-act-sm font-medium">账户余额</h4>}
      description={<span className={error ? "text-on-danger" : undefined} role={error ? "status" : undefined}>{helper}</span>}
      control={
        <>
          <span className="text-act-sm font-medium tabular-nums text-text-main" aria-label={`${provider.label} 账户余额`}>{value}</span>
          <IconButton label={`刷新 ${provider.label} 账户余额`} tooltip="刷新余额" disabled={loading} onClick={onRefresh}>
            <RefreshCw size={13} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
          </IconButton>
        </>
      }
    />
  );
}

function DetailRow({ label, description, value, mono = false, action, onAction, control }: { label: string; description?: string; value?: string; mono?: boolean; action?: string; onAction?: () => void; control?: React.ReactNode }) {
  return (
    <SettingRow
      title={<h4 className="text-act-sm font-medium">{label}</h4>}
      description={description}
      control={control ?? (
        <>
          {value !== undefined ? <span title={value} className={`max-w-[240px] truncate text-text-muted ${mono ? "font-mono text-act-xs" : "text-act-sm"}`}>{value}</span> : null}
          {action && onAction ? <Button aria-label={`${action}${label}`} onClick={onAction}>{action}</Button> : null}
        </>
      )}
    />
  );
}

function RouteBack({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button type="button" aria-label="返回连接" onClick={onBack} className="-ml-1.5 inline-flex h-[26px] items-center gap-0.5 rounded-act-sm pl-1 pr-2 text-act-xs text-text-muted transition-colors hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">
      <ChevronLeft size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function RemoveProviderDialog({
  provider,
  onClose,
  onConfirm,
}: {
  provider: (typeof PROVIDERS)[number];
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  return (
    <ConfirmDialog
      title={`移除 ${provider.label}？`}
      description="将清除该服务商的所有 API Key、接入地址、代理和连接状态。已添加模型、历史会话与用量记录会保留，但相关模型将暂时不可用。"
      confirmLabel="移除服务商"
      pendingLabel="移除中…"
      onCancel={onClose}
      onConfirm={onConfirm}
    />
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
  if (status === "unavailable") return <StatusDot tone="error">连接异常</StatusDot>;
  return <StatusDot tone="ok">{status === "available" ? "可用" : "已连接"}</StatusDot>;
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

const CATALOG_GROUPS: readonly { category: ProviderCategory; label: string }[] = [
  { category: "direct", label: "官方直连" },
  { category: "coding", label: "Coding Plan" },
  { category: "compatible", label: "第三方兼容" },
];

function ProviderCatalogRoute({
  providers,
  query,
  onQueryChange,
  onBack,
  onSelect,
}: {
  providers: CatalogEntry[];
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onSelect: (provider: CatalogEntry) => void;
}) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (provider: CatalogEntry) => [provider.label, provider.description, provider.id].some((value) => value.toLocaleLowerCase().includes(normalized));
  const groups = CATALOG_GROUPS
    .map((group) => ({ ...group, rows: providers.filter((provider) => provider.category === group.category && matches(provider)) }))
    .filter((group) => group.rows.length > 0);
  // 「自定义服务」始终留在底部，搜不到服务商时就是出口。
  const custom = providers.find((provider) => provider.category === "custom");
  const row = (provider: CatalogEntry) => (
    <SettingLinkRow
      key={provider.id}
      ariaLabel={`选择 ${provider.label}`}
      leading={<ProviderLogo provider={provider.kind === "builtin" ? provider.id : provider.runtimeProviderId ?? "openrouter"} logoKey={provider.logoKey} />}
      title={provider.label}
      description={provider.description}
      onClick={() => onSelect(provider)}
    />
  );
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <RouteBack onBack={onBack} label="返回模型连接" />
        <h3 className="mt-2 text-act-lg font-semibold tracking-tight text-text-main">添加连接</h3>
      </div>
      <div className="flex flex-col gap-3">
        <label className="relative block w-[260px] max-[600px]:w-full">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <SettingsInput autoFocus width="full" className="pl-8" aria-label="搜索模型服务" placeholder="搜索服务商" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </label>
        {groups.length ? (
          <SettingGroup>
            {groups.map((group) => (
              <div key={group.category} className="divide-y divide-line/60">
                <SettingSubhead>{group.label}</SettingSubhead>
                {group.rows.map(row)}
              </div>
            ))}
          </SettingGroup>
        ) : (
          <p className="px-0.5 text-act-xs text-text-muted">列表里没有匹配的服务商。</p>
        )}
      </div>
      {custom ? <SettingGroup title="没有找到？">{row(custom)}</SettingGroup> : null}
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
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-act-sm font-semibold text-text-main"><span><span className="group-open:hidden">展开</span><span className="hidden group-open:inline">收起</span>高级连接设置</span><ChevronDown size={15} className="text-text-faint group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="grid gap-4 border-t border-line pb-3 pt-3">
          {provider === "openrouter" ? (
            <Field label="Management Key（可选，用于账户余额）">
              <div className="flex"><input aria-label="OpenRouter Management Key" type={showManagementKey ? "text" : "password"} value={managementKey} onChange={(event) => setManagementKey(event.target.value)} placeholder={current?.hasManagementKey ? "已配置；留空保持不变" : "sk-or-v1-..."} className="h-10 min-w-0 flex-1 rounded-l-act-md border border-r-0 border-line bg-surface-subtle px-3 text-act-sm text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20" /><button type="button" aria-label={showManagementKey ? "隐藏 Management Key" : "显示 Management Key"} className="grid h-10 w-10 place-items-center rounded-r-act-md border border-line bg-surface-subtle text-text-faint hover:text-text-main" onClick={() => setShowManagementKey((visible) => !visible)}>{showManagementKey ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
              <span className="text-act-xxs leading-relaxed text-text-faint">只用于 OpenRouter /credits 查询；移除服务商时会一并清除。</span>
            </Field>
          ) : null}
          <Field label="Base URL（可选）"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="使用服务商默认地址" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-act-sm text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field>
          <label className="flex min-h-11 items-center justify-between rounded-act-md border border-line px-3"><span className="text-act-sm font-medium text-text-main">仅为此服务商启用代理</span><input type="checkbox" checked={proxyEnabled} onChange={(event) => setProxyEnabled(event.target.checked)} /></label>
          {proxyEnabled ? <Field label="HTTP(S) 代理地址"><input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder={current?.proxy?.enabled ? "已配置；留空保持不变" : "http://127.0.0.1:7890"} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-act-sm text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field> : null}
            </div>
          </details>
          {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" size="md" disabled={saving} onClick={onClose}>取消</Button><Button variant="primary" size="md" aria-label="保存" disabled={saving || (!configured && !apiKey.trim()) || (proxyEnabled && !proxyUrl.trim() && !current?.proxy?.enabled)} onClick={() => void save()}>{saving ? "保存中…" : "保存连接"}</Button></div>
      </div>
    </div>
  );
}

function isProviderConfigured(provider?: ProviderSettingsView): boolean {
  return Boolean(provider?.hasApiKey || provider?.additionalCredentials?.some((credential) => credential.hasApiKey));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-act-xs font-semibold text-text-muted">{label}</span>{children}</label>;
}

function ApiKeyField({ name, configured, value, onChange }: { name: string; configured: boolean; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={configured ? "API Key（可选）" : "API Key · 必填"}>
      <span className="flex rounded-act-md border border-line bg-surface focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/20">
        <input aria-label={name} autoFocus type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? "留空以保留当前 Key" : "输入或粘贴 API Key"} className="h-9 min-w-0 flex-1 rounded-l-act-md bg-transparent px-3 text-act-sm text-text-main outline-none" />
        <button type="button" aria-label={visible ? "隐藏 API Key" : "显示 API Key"} className="grid h-9 w-10 place-items-center rounded-r-act-md border-l border-line text-text-muted hover:bg-hover-overlay" onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </span>
    </Field>
  );
}

function compactAddress(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
