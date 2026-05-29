import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DEFAULT_MODEL_ID,
  MODEL_LIST,
  type AppSettings,
  type KairosThinkingMode,
  type ModelId,
  type ProviderId,
  type SetProviderKeyResult,
  type SettingsUpdateInput,
  type TestConnectionResult,
} from "@actspace/shared";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import {
  SectionShell,
  SettingGroup,
  SettingRow,
  SettingsSelect,
  Stepper,
  Toggle,
  type SelectOption,
} from "./SettingsPrimitives";
import { CODE_FONT_PRESETS, UI_FONT_PRESETS } from "../../appearance/fonts";
import { applyAppearance } from "../../appearance/apply";
import { loadAppearance, saveAppearance } from "../../appearance/storage";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_STEP,
  DEFAULT_APPEARANCE,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_FONT_SIZE_STEP,
  type AppearancePrefs,
  type CodeFontId,
  type ThemeMode,
  type UiFontId,
} from "../../appearance/types";

const BTN_PRIMARY =
  "inline-flex h-8 items-center rounded-act-md bg-brand px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60";
const BTN_DANGER =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-on-danger transition hover:border-on-danger/40 hover:bg-danger-soft";

const MOCK_SETTINGS: AppSettings = {
  version: 1,
  defaultModelId: null,
  providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
  agent: { temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false },
  kairos: { modelId: null, thinking: "auto" },
};

const MODEL_OPTIONS: SelectOption[] = MODEL_LIST.map((spec) => ({ value: spec.id, label: spec.label }));

const TOOL_ITEMS: { name: string; label: string; description: string; conditional?: boolean }[] = [
  { name: "read_file", label: "读取文件", description: "读取工作区中的文件内容。" },
  { name: "grep", label: "Grep 搜索", description: "按正则在文件内容中搜索匹配。" },
  { name: "glob", label: "Glob 匹配", description: "按通配符查找文件路径。" },
  { name: "list_directory", label: "列出目录", description: "浏览目录结构与文件清单。" },
  { name: "edit_file_diff", label: "编辑文件", description: "以 diff 形式修改已有文件。" },
  { name: "write_file", label: "写入文件", description: "创建新文件或覆盖已有文件。" },
  { name: "web_search", label: "联网搜索", description: "调用联网搜索获取实时信息。", conditional: true },
  { name: "analyze_media", label: "媒体分析", description: "解析图片等多模态内容。", conditional: true },
  { name: "bash", label: "Bash 终端", description: "在工作区执行 shell 命令。" },
];

function hasSettingsBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getSettings);
}

function mergeSettings(current: AppSettings, input: SettingsUpdateInput): AppSettings {
  return {
    ...current,
    defaultModelId: input.defaultModelId !== undefined ? input.defaultModelId : current.defaultModelId,
    agent: input.agent ? { ...current.agent, ...input.agent } : current.agent,
    kairos: input.kairos ? { ...current.kairos, ...input.kairos } : current.kairos,
  };
}

export function SettingsPage({
  onBack,
  onSettingsChange,
}: {
  onBack: () => void;
  /** 设置变更后回传最新快照，供上层（如 Composer 默认模型）联动。 */
  onSettingsChange?: (settings: AppSettings) => void;
}) {
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [keyModalProvider, setKeyModalProvider] = useState<ProviderId | null>(null);

  useEffect(() => {
    if (!hasSettingsBridge()) {
      setSettings(MOCK_SETTINGS);
      return;
    }
    window.actspace
      .getSettings()
      .then(setSettings)
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
        setSettings(MOCK_SETTINGS);
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!hasSettingsBridge()) return;
    try {
      setSettings(await window.actspace.getSettings());
    } catch (error) {
      console.error("Failed to refresh settings", error);
    }
  }, []);

  const handleUpdate = useCallback(
    (input: SettingsUpdateInput) => {
      setSettings((current) => (current ? mergeSettings(current, input) : current));
      if (!hasSettingsBridge()) return;
      window.actspace
        .updateSettings(input)
        .then((next) => {
          setSettings(next);
          onSettingsChange?.(next);
        })
        .catch((error: unknown) => {
          console.error("Failed to update settings", error);
        });
    },
    [onSettingsChange],
  );

  const handleSaveKey = useCallback(
    async (provider: ProviderId, apiKey: string): Promise<SetProviderKeyResult> => {
      if (!hasSettingsBridge()) {
        setSettings((current) =>
          current
            ? { ...current, providers: { ...current.providers, [provider]: { hasApiKey: true } } }
            : current,
        );
        return { ok: true };
      }
      const result = await window.actspace.setProviderKey({ provider, apiKey });
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const handleClearKey = useCallback(
    async (provider: ProviderId) => {
      if (!hasSettingsBridge()) {
        setSettings((current) =>
          current
            ? { ...current, providers: { ...current.providers, [provider]: { hasApiKey: false } } }
            : current,
        );
        return;
      }
      await window.actspace.clearProviderKey({ provider });
      await refresh();
    },
    [refresh],
  );

  const handleTestConnection = useCallback(async (provider: ProviderId): Promise<TestConnectionResult> => {
    if (!hasSettingsBridge()) {
      return { ok: false, message: "浏览器预览模式下无法测试连接。" };
    }
    return window.actspace.testProviderConnection({ provider });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-text-main">
      <div className="window-chrome-bar" role="presentation">
        <div className="chrome-left" />
        <div className="chrome-center" />
        <div className="chrome-right" />
      </div>

      <div className="flex min-h-0 flex-1 pt-[var(--window-chrome-strip-height)]">
        <SettingsNav active={section} onSelect={setSection} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-app-bg">
          {settings ? (
            <SettingsContent
              section={section}
              settings={settings}
              onUpdate={handleUpdate}
              onConnectProvider={setKeyModalProvider}
              onClearProvider={handleClearKey}
              onTestProvider={handleTestConnection}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-text-faint">加载设置中…</div>
          )}
        </div>
      </div>

      {keyModalProvider ? (
        <ProviderKeyModal
          provider={keyModalProvider}
          onClose={() => setKeyModalProvider(null)}
          onSave={(apiKey) => handleSaveKey(keyModalProvider, apiKey)}
        />
      ) : null}
    </div>
  );
}

type SectionProps = {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
  onConnectProvider: (provider: ProviderId) => void;
  onClearProvider: (provider: ProviderId) => Promise<void>;
  onTestProvider: (provider: ProviderId) => Promise<TestConnectionResult>;
};

function SettingsContent({ section, ...rest }: SectionProps & { section: SettingsSectionId }) {
  switch (section) {
    case "general":
      return <GeneralSection {...rest} />;
    case "model":
      return <ModelSection {...rest} />;
    case "agent":
      return <AgentSection {...rest} />;
    case "tools":
      return <ToolsSection {...rest} />;
    case "appearance":
      return <AppearanceSection />;
    default:
      return null;
  }
}

function GeneralSection({ settings, onUpdate }: SectionProps) {
  const [defaultPermission, setDefaultPermission] = useState(true);
  return (
    <SectionShell title="通用" description="权限与基础偏好设置。">
      <SettingGroup title="权限设置">
        <SettingRow
          title="默认权限"
          description="默认情况下，助手可读取和编辑工作区文件，必要时请求额外访问权限。（占位项，暂未接入逻辑）"
          control={<Toggle checked={defaultPermission} onChange={setDefaultPermission} ariaLabel="默认权限" />}
        />
        <SettingRow
          title="自动审查"
          description="开启后，每条 Bash 命令在执行前都会向你确认（绕过命令白名单，硬性拒绝仍然生效）。"
          control={
            <Toggle
              checked={settings.agent.bashAlwaysAsk}
              onChange={(next) => onUpdate({ agent: { bashAlwaysAsk: next } })}
              ariaLabel="自动审查"
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="通用设置">
        <SettingRow
          title="语言"
          description="应用界面语言。"
          control={
            <SettingsSelect
              value="zh-CN"
              options={[{ value: "zh-CN", label: "简体中文" }]}
              onChange={() => {}}
              disabled
              ariaLabel="界面语言"
            />
          }
        />
      </SettingGroup>
    </SectionShell>
  );
}

function ProviderRow({
  provider,
  label,
  description,
  hasApiKey,
  onConnect,
  onClear,
  onTest,
}: {
  provider: ProviderId;
  label: string;
  description: string;
  hasApiKey: boolean;
  onConnect: (provider: ProviderId) => void;
  onClear: (provider: ProviderId) => Promise<void>;
  onTest: (provider: ProviderId) => Promise<TestConnectionResult>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(provider);
      setTestResult({ ok: result.ok, text: result.message });
    } catch {
      setTestResult({ ok: false, text: "测试连接失败，请稍后重试。" });
    } finally {
      setTesting(false);
    }
  };

  // 徽标语义：未保存 Key → 未连接；保存了但最近一次测试失败 → 连接异常；否则 → 已连接。
  // 避免「测试不通却仍显示已连接」误导用户。
  const badge = !hasApiKey
    ? { text: "未连接", className: "bg-surface-subtle text-text-faint" }
    : testResult && !testResult.ok
      ? { text: "连接异常", className: "bg-danger-soft text-on-danger" }
      : { text: "已连接", className: "bg-success-soft text-on-success" };

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-text-main">{label}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
            >
              {badge.text}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasApiKey ? (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={runTest} disabled={testing}>
                {testing ? "测试中…" : "测试连接"}
              </button>
              <button type="button" className={BTN_DANGER} onClick={() => void onClear(provider)}>
                断开连接
              </button>
            </>
          ) : (
            <button type="button" className={BTN_PRIMARY} onClick={() => onConnect(provider)}>
              连接
            </button>
          )}
        </div>
      </div>
      {testResult ? (
        <p className={`text-[12px] ${testResult.ok ? "text-on-success" : "text-on-danger"}`}>{testResult.text}</p>
      ) : null}
    </div>
  );
}

function ModelSection({ settings, onUpdate, onConnectProvider, onClearProvider, onTestProvider }: SectionProps) {
  return (
    <SectionShell title="模型" description="管理模型供应商连接与默认模型。">
      <SettingGroup title="供应商">
        <ProviderRow
          provider="deepseek"
          label="DeepSeek"
          description="DeepSeek V4 系列模型供应商。"
          hasApiKey={settings.providers.deepseek.hasApiKey}
          onConnect={onConnectProvider}
          onClear={onClearProvider}
          onTest={onTestProvider}
        />
        <ProviderRow
          provider="kimi"
          label="Kimi"
          description="Kimi K2.6 与联网搜索能力供应商。"
          hasApiKey={settings.providers.kimi.hasApiKey}
          onConnect={onConnectProvider}
          onClear={onClearProvider}
          onTest={onTestProvider}
        />
      </SettingGroup>

      <SettingGroup title="默认模型">
        <SettingRow
          title="默认模型"
          description="新建对话时 Composer 默认选中的模型。"
          control={
            <SettingsSelect
              value={settings.defaultModelId ?? DEFAULT_MODEL_ID}
              options={MODEL_OPTIONS}
              onChange={(value) => onUpdate({ defaultModelId: value as ModelId })}
              ariaLabel="默认模型"
            />
          }
        />
      </SettingGroup>
    </SectionShell>
  );
}

function AgentSection({ settings, onUpdate }: SectionProps) {
  return (
    <SectionShell title="智能体" description="Kairos 自主智能体的模型与思考链。">
      <SettingGroup title="Kairos 自主智能体">
        <SettingRow
          title="模型"
          description="Kairos 自主模式使用的模型。修改将在 Kairos 下次空闲时生效。"
          control={
            <SettingsSelect
              value={settings.kairos.modelId ?? "__default__"}
              options={[{ value: "__default__", label: "跟随默认" }, ...MODEL_OPTIONS]}
              onChange={(value) =>
                onUpdate({ kairos: { modelId: value === "__default__" ? null : (value as ModelId) } })
              }
              ariaLabel="Kairos 模型"
            />
          }
        />
        <SettingRow
          title="思考链"
          description="是否启用模型的思考过程。"
          control={
            <SettingsSelect
              value={settings.kairos.thinking}
              options={[
                { value: "auto", label: "自动" },
                { value: "on", label: "开启" },
                { value: "off", label: "关闭" },
              ]}
              onChange={(value) => onUpdate({ kairos: { thinking: value as KairosThinkingMode } })}
              ariaLabel="Kairos 思考链"
            />
          }
        />
      </SettingGroup>
    </SectionShell>
  );
}

function ToolsSection({ settings, onUpdate }: SectionProps) {
  const disabled = settings.agent.disabledTools;

  const toggleTool = (name: string, enabled: boolean) => {
    const set = new Set(disabled);
    if (enabled) {
      set.delete(name);
    } else {
      set.add(name);
    }
    onUpdate({ agent: { disabledTools: [...set] } });
  };

  return (
    <SectionShell
      title="工具"
      description="控制助手在对话中可调用的工具。关闭后该工具在后续对话中不再出现。"
    >
      <SettingGroup>
        {TOOL_ITEMS.map((tool) => (
          <SettingRow
            key={tool.name}
            title={tool.label}
            description={
              tool.conditional ? `${tool.description}（是否可用取决于当前供应商配置）` : tool.description
            }
            control={
              <Toggle
                checked={!disabled.includes(tool.name)}
                onChange={(next) => toggleTool(tool.name, next)}
                ariaLabel={tool.label}
              />
            }
          />
        ))}
      </SettingGroup>
    </SectionShell>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
];

function ThemeSegmented({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className="inline-flex items-center gap-0.5 rounded-act-md border border-line bg-surface-subtle p-0.5"
    >
      {THEME_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => onChange(optionValue)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-act-sm px-2.5 text-[12px] font-semibold transition-colors ${
              selected
                ? "bg-surface text-text-main shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : "text-text-faint hover:text-text-main"
            }`}
          >
            <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const UI_FONT_OPTIONS: SelectOption[] = UI_FONT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));
const CODE_FONT_OPTIONS: SelectOption[] = CODE_FONT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

function AppearanceSection() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => loadAppearance());

  const update = (patch: Partial<AppearancePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      applyAppearance(next);
      return next;
    });
  };

  return (
    <SectionShell title="外观" description="主题、字体与字号。偏好仅保存在本机。">
      <SettingGroup title="主题">
        <SettingRow
          title="主题"
          description="“跟随系统”会随 macOS 外观自动在浅色 / 深色间切换。"
          control={
            <ThemeSegmented value={prefs.theme} onChange={(value) => update({ theme: value })} />
          }
        />
      </SettingGroup>

      <SettingGroup title="字体">
        <SettingRow
          title="界面字体"
          description="应用界面与 AI 回复正文使用的字体。"
          control={
            <SettingsSelect
              value={prefs.uiFontId}
              options={UI_FONT_OPTIONS}
              onChange={(value) => update({ uiFontId: value as UiFontId })}
              ariaLabel="界面字体"
            />
          }
        />
        <SettingRow
          title="代码字体"
          description="代码块、diff 与终端输出使用的等宽字体。"
          control={
            <SettingsSelect
              value={prefs.codeFontId}
              options={CODE_FONT_OPTIONS}
              onChange={(value) => update({ codeFontId: value as CodeFontId })}
              ariaLabel="代码字体"
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="字号">
        <SettingRow
          title="界面字号"
          description="应用界面与正文的基准字号。"
          control={
            <Stepper
              value={prefs.uiFontSize}
              onChange={(value) => update({ uiFontSize: value })}
              min={UI_FONT_SIZE_MIN}
              max={UI_FONT_SIZE_MAX}
              step={UI_FONT_SIZE_STEP}
              format={(value) => `${value}px`}
              defaultValue={DEFAULT_APPEARANCE.uiFontSize}
              ariaLabel="界面字号"
            />
          }
        />
        <SettingRow
          title="代码字号"
          description="代码块、diff 与终端文本字号。"
          control={
            <Stepper
              value={prefs.codeFontSize}
              onChange={(value) => update({ codeFontSize: value })}
              min={CODE_FONT_SIZE_MIN}
              max={CODE_FONT_SIZE_MAX}
              step={CODE_FONT_SIZE_STEP}
              format={(value) => `${value}px`}
              defaultValue={DEFAULT_APPEARANCE.codeFontSize}
              ariaLabel="代码字号"
            />
          }
        />
      </SettingGroup>
    </SectionShell>
  );
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  kimi: "Kimi",
};

function ProviderKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: ProviderId;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<SetProviderKeyResult>;
}) {
  const label = PROVIDER_LABELS[provider];
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) {
      setError("请输入 API Key。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(value);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error ?? "保存失败，请稍后重试。");
      }
    } catch {
      setError("保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[14px] border border-line bg-surface-raised p-5 shadow-act-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`连接 ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-[16px] font-bold text-text-main">连接 {label}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
          输入你的 {label} API Key，将经系统密钥串加密后保存在本机，不会以明文形式落盘或上传。
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          placeholder="sk-..."
          aria-label={`${label} API Key`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className="mt-4 h-10 w-full rounded-act-md border border-line bg-surface px-3 text-[13px] text-text-main outline-none transition-colors focus-visible:border-brand"
        />
        {error ? <p className="mt-2 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
