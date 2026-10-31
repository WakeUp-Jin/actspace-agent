import { useEffect, useState } from "react";
import type {
  AppSettings,
  SearchProviderId,
  SearchUsageResult,
  SecretProviderId,
  SetProviderKeyResult,
  SettingsUpdateInput,
  SettingsV4NamespacePatch,
  SettingsV4Snapshot,
} from "@actspace/shared";
import {
  SettingEditor,
  SettingGroup,
  SettingRow,
  SettingsInput,
  SettingsMenuButton,
  SettingTag,
  StatusDot,
  Toggle,
  useSettingsSaveNotice,
  useSingleEditor,
} from "./SettingsPrimitives";
import { useToolToggle } from "./useToolToggle";
import { Button } from "../ui/Button";
import { settingsApi } from "../../api/settings";

const WEB_SEARCH_TOOL = "web_search";

export const SEARCH_PROVIDER_ROWS: Array<{
  provider: SearchProviderId;
  label: string;
  tag?: string;
  description: string;
}> = [
  { provider: "deepseek", label: "DeepSeek", description: "搜索 ¥0.005 / 次成功请求。与 DeepSeek 模型和网页抓取共用官方 API Key；连接后需单独启用搜索。" },
  { provider: "zhipu", label: "智谱 Web Search", description: "国内 · search_pro ¥0.03 / 次" },
  { provider: "tavily", label: "Tavily", tag: "国际 1", description: "每月 1000 credits 免费，超出按量计费。" },
  { provider: "tinyfish", label: "TinyFish", tag: "国际 2", description: "搜索接口目前免费（按套餐限速）。" },
  { provider: "exa", label: "Exa", tag: "国际 3", description: "语义搜索，按量计费。" },
];

export function SearchSettings({
  settings,
  settingsV4,
  onUpdate,
  onUpdateNamespace,
  onSaveProviderKey,
  onClearProvider,
}: {
  settings: AppSettings;
  settingsV4?: SettingsV4Snapshot | null;
  onUpdate: (input: SettingsUpdateInput) => void;
  onUpdateNamespace: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
  onSaveProviderKey: (provider: SecretProviderId, apiKey: string) => Promise<SetProviderKeyResult>;
  onClearProvider: (provider: SecretProviderId) => Promise<void>;
}) {
  const notifySaved = useSettingsSaveNotice();
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const saveTools = async (patch: Partial<import("@actspace/shared").SettingsV4Tools>) => {
    setWriteError(null);
    setWriting(true);
    try {
      const result = await onUpdateNamespace({ namespace: "tools", patch });
      if (!result) throw new Error("保存失败，请重试。");
      notifySaved();
    } catch { setWriteError("保存失败，请重试。"); }
    finally { setWriting(false); }
  };
  const hasDeepseekKey = settings.searchProviders.deepseek?.hasApiKey === true || settings.providers.deepseek.hasApiKey;
  const hasKey = (provider: SearchProviderId) => provider === "deepseek" ? hasDeepseekKey : settings.searchProviders[provider]?.hasApiKey === true;
  const tools = useToolToggle({ settings, settingsV4, onUpdate, onUpdateNamespace });
  const editor = useSingleEditor<SearchProviderId>();
  const connectedCount = SEARCH_PROVIDER_ROWS.filter(({ provider }) => hasKey(provider)).length;

  return (
    <>
      {writeError ? <p role="alert">{writeError}</p> : null}
      <SettingGroup>
        <SettingRow
          title="允许联网搜索"
          description="关闭后 Agent 不会获得联网搜索工具，已连接的通道保留。"
          control={
            <Toggle
              checked={tools.isEnabled(WEB_SEARCH_TOOL)}
              onChange={(next) => tools.setToolEnabled(WEB_SEARCH_TOOL, next)}
              ariaLabel="允许联网搜索"
            />
          }
        />
      </SettingGroup>

      <SettingGroup
        title="搜索通道"
        headingLevel={3}
        description="DeepSeek、智谱与国际通道并行搜索，结果去重、融合排序后取前几条，各来源分别计费。国际通道按 Tavily → TinyFish → Exa 使用首个可用来源。"
        meta={`${connectedCount} / ${SEARCH_PROVIDER_ROWS.length} 已连接`}
      >
        {SEARCH_PROVIDER_ROWS.map((row) => (
          <SearchProviderRow
            key={row.provider}
            {...row}
            hasApiKey={hasKey(row.provider)}
            enabled={hasKey(row.provider) && (settingsV4?.settings.tools.searchProviders[row.provider]?.enabled ?? (row.provider !== "deepseek"))}
            toggleDisabled={!settingsV4 || writing || !hasKey(row.provider)}
            onToggle={(enabled) => void saveTools({ searchProviders: { [row.provider]: { enabled } } })}
            editing={editor.isOpen(row.provider)}
            onEdit={() => editor.toggle(row.provider)}
            onCloseEditor={editor.close}
            onSaveKey={(apiKey) => onSaveProviderKey(row.provider, apiKey)}
            onClear={() => onClearProvider(row.provider)}
          />
        ))}
      </SettingGroup>
      <SettingGroup title="网页读取" headingLevel={3}>
        <SettingRow
          title="使用 DeepSeek 抓取网页"
          description={<>开启后优先使用 DeepSeek，目标网址将发送至 DeepSeek，当前 ¥0.005 / 次成功请求。普通获取失败时回退本地；关闭时使用本地抓取。{!hasDeepseekKey ? "请先连接上方 DeepSeek。" : "使用上方共享的 DeepSeek Key，与搜索开关独立。"}</>}
          control={<Toggle
            ariaLabel="使用 DeepSeek 抓取网页"
            checked={hasDeepseekKey && settingsV4?.settings.tools.deepseekFetchEnabled === true}
            disabled={!settingsV4 || writing || !hasDeepseekKey}
            onChange={(deepseekFetchEnabled) => void saveTools({ deepseekFetchEnabled })}
          />}
        />
      </SettingGroup>
    </>
  );
}

function SearchProviderRow({
  provider,
  label,
  tag,
  description,
  hasApiKey,
  enabled,
  toggleDisabled,
  onToggle,
  editing,
  onEdit,
  onCloseEditor,
  onSaveKey,
  onClear,
}: {
  provider: SearchProviderId;
  label: string;
  tag?: string;
  description: string;
  hasApiKey: boolean;
  enabled: boolean;
  toggleDisabled: boolean;
  onToggle: (enabled: boolean) => void;
  editing: boolean;
  onEdit: () => void;
  onCloseEditor: () => void;
  onSaveKey: (apiKey: string) => Promise<SetProviderKeyResult>;
  onClear: () => Promise<void>;
}) {
  const notifySaved = useSettingsSaveNotice();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorId = `search-key-${provider}`;

  const closeEditor = () => {
    setApiKey("");
    setError(null);
    onCloseEditor();
  };

  const save = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onSaveKey(apiKey.trim());
      if (!result.ok) {
        setError(result.error ?? "保存失败，请检查 Key 后重试。");
        return;
      }
      setApiKey("");
      onCloseEditor();
      notifySaved(hasApiKey ? "已更换" : "已连接");
    } catch {
      setError("保存失败，请检查 Key 后重试。");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    try {
      await onClear();
      notifySaved("已断开");
    } catch {
      setError("断开失败，请重试。");
    }
  };

  const usage = provider === "tavily" ? <TavilyUsage hasApiKey={hasApiKey} /> : null;

  return (
    <>
      {error && !editing ? <p role="alert">{error}</p> : null}
      <SettingRow
        title={<>{label}{tag ? <SettingTag>{tag}</SettingTag> : null}</>}
        description={<>{description}{usage}</>}
        control={
          hasApiKey ? (
            <>
              <Toggle ariaLabel={`启用 ${label} 搜索`} checked={enabled} disabled={toggleDisabled} onChange={onToggle} />
              <StatusDot tone="ok">已连接</StatusDot>
              <SettingsMenuButton
                id={`${editorId}-trigger`}
                label="管理"
                ariaLabel={`管理 ${label}`}
                items={[
                  { label: "更换 Key", onSelect: onEdit },
                  ...(provider === "deepseek" ? [] : [{ label: "断开连接", danger: true, onSelect: () => void clear() }]),
                ]}
              />
            </>
          ) : (
            <Button id={`${editorId}-trigger`} aria-label={`连接 ${label}`} aria-expanded={editing} aria-controls={editorId} onClick={onEdit}>
              连接
            </Button>
          )
        }
      />
      {editing ? (
        <SettingEditor
          id={editorId}
          returnFocusId={`${editorId}-trigger`}
          hint={provider === "deepseek" ? "与 DeepSeek 模型及网页抓取共用官方 Key；更换会影响三者。Key 只保存在本机，不会回显。" : "Key 只保存在本机，不会回显。"}
          error={error}
          saving={saving}
          saveDisabled={!apiKey.trim()}
          saveAriaLabel={`保存 ${label} Key`}
          onCancel={closeEditor}
          onSave={() => void save()}
        >
          <SettingsInput
            type="password"
            autoComplete="new-password"
            width="full"
            mono
            autoFocus
            aria-label={`${label} API Key`}
            placeholder={`粘贴 ${label} API Key`}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
        </SettingEditor>
      ) : null}
    </>
  );
}

/** Tavily 额度：账户级 plan credits 用量（GET /usage）。其余通道没有公开用量接口。 */
function TavilyUsage({ hasApiKey }: { hasApiKey: boolean }) {
  const [usage, setUsage] = useState<SearchUsageResult | null>(null);

  useEffect(() => {
    if (!hasApiKey) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    settingsApi.getSearchUsage()
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasApiKey]);

  if (!usage?.ok || !usage.tavily) return null;
  const { planUsage, planLimit } = usage.tavily;
  return (
    <span className="block text-text-faint">
      本周期已用 {planUsage}{planLimit !== null ? ` / ${planLimit}` : ""} credits
      {planLimit !== null ? `，剩余 ${Math.max(planLimit - planUsage, 0)}` : ""}
    </span>
  );
}
