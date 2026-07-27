import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  KeyRound,
  MoonStar,
  Plus,
  RefreshCw,
  Route,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  PROVIDER_REGISTRY,
  type LlmProviderId,
  type BalanceProviderId,
  type ProviderBalanceSnapshot,
  type ProviderSettingsView,
} from "@actspace/shared";
import { SectionShell } from "./SettingsPrimitives";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

type ProviderGroup = "direct" | "compatible";

interface ProviderMeta {
  id: LlmProviderId;
  label: string;
  description: string;
  compatibility: string;
  group: ProviderGroup;
  icon: LucideIcon;
  supportsBalance: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 官方 API",
    compatibility: "官方直连",
    group: "direct",
    icon: Waves,
    supportsBalance: true,
  },
  {
    id: "kimi",
    label: "Kimi",
    description: "Moonshot 官方 API",
    compatibility: "官方直连",
    group: "direct",
    icon: MoonStar,
    supportsBalance: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "聚合模型目录与 OpenAI 兼容接口",
    compatibility: "第三方兼容",
    group: "compatible",
    icon: Route,
    supportsBalance: true,
  },
  {
    id: "duckding",
    label: "DuckDing",
    description: "DuckCoding OpenAI 兼容中转",
    compatibility: "第三方兼容",
    group: "compatible",
    icon: KeyRound,
    supportsBalance: false,
  },
];

const GROUPS: Array<{ id: ProviderGroup; label: string }> = [
  { id: "direct", label: "官方 API（直连）" },
  { id: "compatible", label: "第三方 / 中转兼容" },
];

const PROVIDER_BALANCE_REFRESH_MS = 5 * 60 * 1000;

export function ProviderSettings({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [providers, setProviders] = useState<Partial<Record<LlmProviderId, ProviderSettingsView>>>({});
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ provider: LlmProviderId; restoreToAddButton: boolean } | null>(null);
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
      await Promise.all(
        PROVIDERS
          .filter((provider): provider is ProviderMeta & { id: BalanceProviderId } => provider.supportsBalance && result.providers[provider.id]?.hasApiKey === true)
          .map((provider) => loadBalance(provider.id)),
      );
    } finally {
      setLoaded(true);
    }
  }, [loadBalance]);

  useEffect(() => { void load(); }, [load]);

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

  const disconnect = async (provider: LlmProviderId) => {
    if (!window.actspace.disconnectProvider) return;
    setBusy(provider);
    try {
      await window.actspace.disconnectProvider({ provider });
      await load();
      await onChanged?.();
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
    return <SectionShell title="服务商" description="仅桌面端可配置服务商连接。"><div /></SectionShell>;
  }

  const connectedProviders = PROVIDERS.filter((provider) => isProviderConfigured(providers[provider.id]));
  const providersToAdd = PROVIDERS.filter((provider) => !isProviderConfigured(providers[provider.id]));
  const canAddProvider = loaded && providersToAdd.length > 0;

  return (
    <>
      <SectionShell
        title="服务商"
        description="通过 API Key 接入模型服务；代理仅作用于开启它的服务商。"
        action={
          <button
            ref={addButtonRef}
            type="button"
            disabled={!canAddProvider}
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-act-pill bg-text-main px-4 text-[13px] font-semibold text-surface transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} aria-hidden="true" />
            添加服务
          </button>
        }
      >
        <div className="w-full max-w-[720px]">
          {!loaded ? <ProviderCardsSkeleton /> : null}

          {loaded && connectedProviders.length === 0 ? (
            <div className="rounded-act-xl border border-dashed border-line bg-surface px-5 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-main">还没有连接模型服务</p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-faint">点击右上角“添加服务”，选择服务商并配置 API Key。</p>
            </div>
          ) : null}

          {GROUPS.map((group) => {
            const items = connectedProviders.filter((provider) => provider.group === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id} className="mb-6 last:mb-0">
                <h3 className="mb-2.5 px-0.5 text-[12px] font-semibold text-text-faint">{group.label}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      state={providers[provider.id]}
                      balance={provider.supportsBalance ? balances[provider.id as BalanceProviderId] : undefined}
                      balanceLoading={provider.supportsBalance && balanceLoading[provider.id as BalanceProviderId] === true}
                      balanceError={provider.supportsBalance ? balanceErrors[provider.id as BalanceProviderId] : undefined}
                      busy={busy === provider.id}
                      onRefreshBalance={() => { if (provider.supportsBalance) void loadBalance(provider.id as BalanceProviderId); }}
                      onTest={() => void test(provider.id)}
                      onEdit={() => setEditing({ provider: provider.id, restoreToAddButton: false })}
                      onDisconnect={() => void disconnect(provider.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {message ? <p role="status" className="mt-3 rounded-act-md bg-surface-subtle px-3 py-2 text-[12px] text-text-muted">{message}</p> : null}
        </div>
      </SectionShell>

      {adding ? (
        <AddProviderDialog
          providers={providersToAdd}
          onClose={() => setAdding(false)}
          onSelect={(provider) => {
            setAdding(false);
            setEditing({ provider, restoreToAddButton: true });
          }}
        />
      ) : null}

      {editing ? (
        <ProviderDialog
          provider={editing.provider}
          current={providers[editing.provider]}
          restoreFocusTo={editing.restoreToAddButton ? addButtonRef.current : undefined}
          onClose={() => setEditing(null)}
          onProviderChanged={async (next) => {
            setProviders((current) => ({ ...current, [editing.provider]: next }));
            await onChanged?.();
          }}
          onSaved={async () => {
            setEditing(null);
            await load();
            await onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}

function ProviderCard({
  provider,
  state,
  balance,
  balanceLoading,
  balanceError,
  busy,
  onRefreshBalance,
  onTest,
  onEdit,
  onDisconnect,
}: {
  provider: ProviderMeta;
  state?: ProviderSettingsView;
  balance?: ProviderBalanceSnapshot;
  balanceLoading: boolean;
  balanceError?: string;
  busy: boolean;
  onRefreshBalance: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDisconnect: () => void;
}) {
  const Icon = provider.icon;
  const address = state?.baseUrl ?? PROVIDER_REGISTRY[provider.id].defaultBaseUrl;
  return (
    <article className="rounded-act-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-act-md bg-surface-subtle text-text-main">
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[14px] font-semibold text-text-main">{provider.label}</h2>
            <p className="mt-0.5 truncate text-[11px] text-text-faint">{provider.description}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <StatusBadge status={state?.lastConnection?.status ?? "untested"} />
              <span className="inline-flex items-center rounded-act-pill bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
                {provider.compatibility}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <button
            type="button"
            className="inline-flex h-7 min-w-9 items-center justify-center rounded-act-md px-1.5 text-[11px] font-medium text-text-muted hover:bg-surface-subtle hover:text-text-main disabled:opacity-50"
            onClick={onTest}
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={14} aria-label="测试中" /> : "测试"}
          </button>
          <button type="button" className="h-7 rounded-act-md px-1.5 text-[11px] font-medium text-text-muted hover:bg-surface-subtle hover:text-text-main" onClick={onEdit}>编辑</button>
          {state?.hasApiKey ? <button type="button" className="h-7 rounded-act-md px-1.5 text-[11px] font-medium text-text-faint hover:bg-danger-soft hover:text-on-danger" onClick={onDisconnect} disabled={busy}>{provider.id === "duckding" && (state.additionalCredentials?.length ?? 0) > 0 ? "断开默认" : "断开"}</button> : null}
        </div>
      </div>

      {provider.supportsBalance ? (
        <ProviderBalanceStrip provider={provider} balance={balance} loading={balanceLoading} error={balanceError} onRefresh={onRefreshBalance} />
      ) : null}

      <dl className="mt-3 divide-y divide-line/70 overflow-hidden rounded-act-lg bg-surface-subtle px-2.5 text-[11px]">
        <ProviderFact label="可用模型" value={`${state?.enabledModelCount ?? 0} / ${state?.installedModelCount ?? 0} 启用`} />
        <ProviderFact label="接入方式" value="API Key" />
        <ProviderFact label="接入地址" value={compactAddress(address)} title={address} />
        <ProviderFact label="代理" value={state?.proxy?.enabled ? compactAddress(state.proxy.url ?? "已开启") : "关闭"} title={state?.proxy?.url ?? undefined} />
        {provider.id === "duckding" ? <ProviderFact label="默认 Key 倍率" value={`${state?.defaultPricingMultiplier ?? 1}x`} /> : null}
      </dl>
    </article>
  );
}

function ProviderBalanceStrip({
  provider,
  balance,
  loading,
  error,
  onRefresh,
}: {
  provider: ProviderMeta;
  balance?: ProviderBalanceSnapshot;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const label = "账户余额";
  const display = balance?.displayBalance;
  const value = display
    ? `${getBalanceSymbol(display.currency)}${display.amount} ${display.currency}`
    : "--";
  const helper = loading
    ? "正在刷新…"
    : error
      ? "刷新失败，已保留上次结果"
      : provider.id === "openrouter" && balance?.isConfigured === false
        ? "需配置 Management Key"
        : "每 5 分钟刷新";

  return (
    <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-act-lg border border-line/70 bg-surface-subtle px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] font-medium text-text-faint">{label}</div>
        <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-text-main" aria-label={`${provider.label} ${label}`}>
          {value}
        </div>
        <div className={`mt-0.5 text-[10px] ${error ? "text-on-danger" : "text-text-faint"}`} role={error ? "status" : undefined} title={error}>
          {helper}
        </div>
      </div>
      <button
        type="button"
        aria-label={`刷新 ${provider.label} ${label}`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md text-text-muted transition hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--act-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={loading}
        onClick={onRefresh}
      >
        <RefreshCw size={14} strokeWidth={2} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
      </button>
    </div>
  );
}

function getBalanceSymbol(currency: string): string {
  if (currency === "CNY") return "¥";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "";
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

function ProviderCardsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label="正在加载服务商">
      {[0, 1].map((item) => (
        <div key={item} className="h-[250px] animate-pulse rounded-act-xl border border-line bg-surface-subtle motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function AddProviderDialog({
  providers,
  onClose,
  onSelect,
}: {
  providers: ProviderMeta[];
  onClose: () => void;
  onSelect: (provider: LlmProviderId) => void;
}) {
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[150] grid place-items-center bg-scrim px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-provider-dialog-title"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}
    >
      <div className="w-full max-w-[560px] rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-provider-dialog-title" className="text-[18px] font-semibold text-text-main">添加服务</h2>
            <p className="mt-1 text-[12px] text-text-faint">选择一个尚未连接的模型服务商。</p>
          </div>
          <button type="button" aria-label="关闭添加服务" className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-surface-subtle" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-2.5">
          {providers.map((provider, index) => {
            const Icon = provider.icon;
            return (
              <button
                key={provider.id}
                type="button"
                autoFocus={index === 0}
                aria-label={`选择 ${provider.label}`}
                onClick={() => onSelect(provider.id)}
                className="flex items-center gap-3 rounded-act-lg border border-line bg-surface px-3.5 py-3 text-left transition hover:border-line-strong hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--act-color-focus-ring)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-act-lg bg-surface-subtle text-text-main"><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text-main">{provider.label}</span>
                  <span className="mt-0.5 block text-[11px] text-text-faint">{provider.description} · {provider.compatibility}</span>
                </span>
                <Plus size={17} className="shrink-0 text-text-faint" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProviderDialog({
  provider,
  current,
  restoreFocusTo,
  onClose,
  onProviderChanged,
  onSaved,
}: {
  provider: LlmProviderId;
  current?: ProviderSettingsView;
  restoreFocusTo?: HTMLElement | null;
  onClose: () => void;
  onProviderChanged: (provider: ProviderSettingsView) => void | Promise<void>;
  onSaved: () => void | Promise<void>;
}) {
  const meta = PROVIDERS.find((item) => item.id === provider)!;
  const [apiKey, setApiKey] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [proxyEnabled, setProxyEnabled] = useState(Boolean(current?.proxy?.enabled));
  const [proxyUrl, setProxyUrl] = useState("");
  const [defaultPricingMultiplier, setDefaultPricingMultiplier] = useState(String(current?.defaultPricingMultiplier ?? 1));
  const [providerState, setProviderState] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDefaultKey = Boolean(current?.hasApiKey);
  const configured = isProviderConfigured(current);
  const { dialogRef, trapTabKey } = useDialogFocusTrap(restoreFocusTo);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const result = hasDefaultKey || (configured && !apiKey.trim())
        ? await window.actspace.updateProvider?.({
            provider,
            ...(provider === "openrouter" && managementKey.trim() && { managementKey: managementKey.trim() }),
            baseUrl: baseUrl || null,
            proxy: { enabled: proxyEnabled, url: proxyEnabled ? proxyUrl : null },
            ...(provider === "duckding" && { defaultPricingMultiplier: Number(defaultPricingMultiplier) }),
          })
        : await window.actspace.connectProvider?.({
            provider,
            apiKey,
            ...(provider === "openrouter" && { managementKey: managementKey.trim() || null }),
            baseUrl: baseUrl || null,
            proxy: { enabled: proxyEnabled, url: proxyEnabled ? proxyUrl : null },
            ...(provider === "duckding" && { defaultPricingMultiplier: Number(defaultPricingMultiplier) }),
          });
      if (!result || !result.ok) { setError(result && "error" in result ? result.error.message : "保存失败。"); return; }
      await onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[150] grid place-items-center bg-scrim px-5" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}>
      <div className="max-h-[86vh] w-full max-w-[560px] overflow-y-auto rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <div className="flex items-start justify-between gap-4"><div><h2 id="provider-dialog-title" className="text-[18px] font-semibold text-text-main">{configured ? "编辑" : "添加"} {meta.label}</h2><p className="mt-1 text-[12px] text-text-faint">密钥不会回显，只在 main 进程解密使用。</p></div><button type="button" aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-surface-subtle" onClick={onClose}><X size={18} /></button></div>
        <div className="mt-5 grid gap-4">
          {!hasDefaultKey ? <Field label={configured ? "默认 API Key（可选）" : "API Key"}><input aria-label={`${meta.label} API Key`} autoFocus type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "留空则继续只使用额外 Key" : undefined} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field> : null}
          {provider === "openrouter" ? (
            <Field label="Management Key（可选，用于账户余额）">
              <input
                aria-label="OpenRouter Management Key"
                type="password"
                value={managementKey}
                onChange={(event) => setManagementKey(event.target.value)}
                placeholder={current?.hasManagementKey ? "已配置；留空保持不变" : "sk-or-v1-..."}
                className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]"
              />
              <span className="text-[11px] leading-relaxed text-text-faint">只用于 OpenRouter /credits 查询；断开服务时会一并清除。</span>
            </Field>
          ) : null}
          <Field label="Base URL（可选）"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="使用服务商默认地址" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field>
          {provider === "duckding" ? (
            <Field label="默认 Key 价格倍率">
              <div className="relative">
                <input aria-label="默认 Key 价格倍率" type="number" min="0" max="100" step="0.0001" value={defaultPricingMultiplier} onChange={(event) => setDefaultPricingMultiplier(event.target.value)} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 pr-8 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-text-faint">x</span>
              </div>
              <span className="text-[11px] leading-relaxed text-text-faint">未设置时为 1x；模型基础价格会在调用时乘以所选 Key 的倍率。</span>
            </Field>
          ) : null}
          <label className="flex min-h-11 items-center justify-between rounded-act-md border border-line px-3"><span className="text-[13px] font-medium text-text-main">仅为此服务商启用代理</span><input type="checkbox" checked={proxyEnabled} onChange={(event) => setProxyEnabled(event.target.checked)} /></label>
          {proxyEnabled ? <Field label="HTTP(S) 代理地址"><input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></Field> : null}
          {provider === "duckding" && configured ? (
            <ProviderCredentialManager provider={provider} current={providerState} onChanged={async (next) => { setProviderState(next); await onProviderChanged(next); }} />
          ) : null}
          {error ? <p role="alert" className="text-[12px] text-on-danger">{error}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 rounded-act-md border border-line px-4 text-[13px] font-semibold text-text-main hover:bg-surface-subtle" onClick={onClose}>取消</button><button type="button" className="h-10 rounded-act-md bg-text-main px-4 text-[13px] font-semibold text-surface transition-opacity hover:opacity-85 disabled:opacity-40" disabled={saving || (!configured && !apiKey.trim()) || (proxyEnabled && !proxyUrl.trim()) || (provider === "duckding" && !isValidMultiplierValue(defaultPricingMultiplier))} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button></div>
      </div>
    </div>
  );
}

function ProviderCredentialManager({
  provider,
  current,
  onChanged,
}: {
  provider: Extract<LlmProviderId, "duckding">;
  current?: ProviderSettingsView;
  onChanged: (provider: ProviderSettingsView) => void;
}) {
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const credentials = current?.additionalCredentials ?? [];

  const add = async () => {
    if (!window.actspace.addProviderCredential) return;
    setBusy("add"); setError(null);
    try {
      const result = await window.actspace.addProviderCredential({
        provider,
        label,
        apiKey,
        pricingMultiplier: Number(multiplier),
      });
      if ("error" in result) { setError(result.error.message); return; }
      onChanged(result.provider);
      setLabel(""); setApiKey(""); setMultiplier("1");
    } finally { setBusy(null); }
  };

  return (
    <section className="rounded-act-lg border border-line bg-surface-subtle p-3">
      <div>
        <h3 className="text-[13px] font-semibold text-text-main">额外 API Key</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-text-faint">先在这里添加并命名；模型设置中只能选择这些 Key，不会提供密钥输入框。</p>
      </div>
      {credentials.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {credentials.map((credential) => (
            <ProviderCredentialRow key={credential.id} provider={provider} credential={credential} onChanged={onChanged} />
          ))}
        </div>
      ) : <p className="mt-3 rounded-act-md border border-dashed border-line px-3 py-2 text-[11px] text-text-faint">当前只有默认 Key，模型设置保持现有单 Key 交互。</p>}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px] gap-2">
        <input aria-label="额外 Key 名称" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 CodeX-Sale" className="h-9 rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
        <div className="relative"><input aria-label="额外 Key 价格倍率" type="number" min="0" max="100" step="0.0001" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} className="h-9 w-full rounded-act-md border border-line bg-surface px-3 pr-7 text-[12px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /><span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-text-faint">x</span></div>
        <input aria-label="额外 API Key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API Key" className="h-9 rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
        <button type="button" disabled={busy === "add" || !label.trim() || !apiKey.trim() || !isValidMultiplierValue(multiplier)} onClick={() => void add()} className="h-9 rounded-act-md bg-text-main px-3 text-[12px] font-semibold text-surface disabled:opacity-40">{busy === "add" ? "添加中…" : "添加 Key"}</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[11px] text-on-danger">{error}</p> : null}
    </section>
  );
}

function ProviderCredentialRow({
  provider,
  credential,
  onChanged,
}: {
  provider: Extract<LlmProviderId, "duckding">;
  credential: NonNullable<ProviderSettingsView["additionalCredentials"]>[number];
  onChanged: (provider: ProviderSettingsView) => void;
}) {
  const [label, setLabel] = useState(credential.label);
  const [multiplier, setMultiplier] = useState(String(credential.pricingMultiplier));
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "save" | "test" | "remove") => {
    setBusy(action); setError(null);
    try {
      const result = action === "save"
        ? await window.actspace.updateProviderCredential?.({ provider, credentialId: credential.id, label, pricingMultiplier: Number(multiplier) })
        : action === "test"
          ? await window.actspace.testProviderCredential?.({ provider, credentialId: credential.id })
          : await window.actspace.removeProviderCredential?.({ provider, credentialId: credential.id });
      if (!result || "error" in result) {
        if (action === "test" && window.actspace.listProviders) {
          const refreshed = await window.actspace.listProviders();
          onChanged(refreshed.providers[provider]);
        }
        const references = result && "error" in result && result.error.references?.length ? `（${result.error.references.join("、")}）` : "";
        setError(`${result && "error" in result ? result.error.message : "操作失败。"}${references}`);
        return;
      }
      onChanged(result.provider);
    } finally { setBusy(null); }
  };

  return (
    <div className="rounded-act-md border border-line bg-surface p-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
        <input aria-label={`${credential.label} 名称`} value={label} onChange={(event) => setLabel(event.target.value)} className="h-8 rounded-act-md border border-line bg-surface-subtle px-2.5 text-[11px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
        <div className="relative"><input aria-label={`${credential.label} 价格倍率`} type="number" min="0" max="100" step="0.0001" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} className="h-8 w-full rounded-act-md border border-line bg-surface-subtle px-2.5 pr-6 text-[11px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /><span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-text-faint">x</span></div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[10px] ${credential.lastConnection.status === "unavailable" ? "text-on-danger" : "text-text-faint"}`}>{credential.lastConnection.status === "available" ? "连接可用" : credential.lastConnection.status === "unavailable" ? "连接异常" : "尚未测试"}</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={busy !== null} onClick={() => void run("test")} className="h-7 rounded-act-md px-2 text-[10px] font-medium text-text-muted hover:bg-surface-subtle disabled:opacity-40">{busy === "test" ? "测试中…" : "测试"}</button>
          <button type="button" disabled={busy !== null || !label.trim() || !isValidMultiplierValue(multiplier)} onClick={() => void run("save")} className="h-7 rounded-act-md px-2 text-[10px] font-medium text-text-muted hover:bg-surface-subtle disabled:opacity-40">{busy === "save" ? "保存中…" : "保存"}</button>
          <button type="button" disabled={busy !== null} onClick={() => void run("remove")} className="h-7 rounded-act-md px-2 text-[10px] font-medium text-text-faint hover:bg-danger-soft hover:text-on-danger disabled:opacity-40">{busy === "remove" ? "删除中…" : "删除"}</button>
        </div>
      </div>
      {error ? <p role="alert" className="mt-1.5 text-[10px] text-on-danger">{error}</p> : null}
    </div>
  );
}

function isValidMultiplierValue(value: string): boolean {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) && number >= 0 && number <= 100;
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
