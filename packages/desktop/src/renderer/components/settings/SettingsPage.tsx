import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DEFAULT_MODEL_ID,
  MODEL_LIST,
  type AgentSystemPromptFile,
  type AppSettings,
  type LocalUpdateState,
  type ModelId,
  type ProviderId,
  type SessionListItem,
  type SetProviderKeyResult,
  type SettingsUpdateInput,
  type TestConnectionResult,
} from "@actspace/shared";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import { KairosSettings } from "./KairosSettings";
import { TOOL_ITEMS } from "./tool-catalog";
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
import { mockArchivedSessions } from "../../fixtures/workbenchFixture";

const BTN_PRIMARY =
  "inline-flex h-8 items-center rounded-act-md bg-brand px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60";
const BTN_DANGER =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-on-danger transition hover:border-on-danger/40 hover:bg-danger-soft";
const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;

const MOCK_SETTINGS: AppSettings = {
  version: 1,
  defaultModelId: null,
  providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
  agent: {
    systemPromptPath: "/mock/prompts/main-agent.md",
    temperature: null,
    maxTokens: null,
    disabledTools: [],
    bashAlwaysAsk: false,
  },
  kairos: { modelId: null, thinking: "auto" },
};

const MOCK_PROMPT_FILE: AgentSystemPromptFile = {
  path: "/mock/prompts/main-agent.md",
  content: "",
};

const MODEL_OPTIONS: SelectOption[] = MODEL_LIST.map((spec) => ({ value: spec.id, label: spec.label }));

function hasSettingsBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getSettings);
}

function hasPromptFileBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.readAgentSystemPrompt);
}

function hasLocalUpdateBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getLocalUpdateState);
}

function hasArchivedSessionsBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.listSessions && window.actspace?.archiveSession);
}

function workspaceLabelFromRoot(root: string | undefined): string {
  if (!root) return "Default workspace";
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "Default workspace";
}

function formatUpdatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  onArchivedSessionsChange,
}: {
  onBack: () => void;
  /** 设置变更后回传最新快照，供上层（如 Composer 默认模型）联动。 */
  onSettingsChange?: (settings: AppSettings) => void;
  /** 归档会话恢复后通知上层刷新普通会话列表。 */
  onArchivedSessionsChange?: () => void;
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
    <div
      data-testid="settings-page-shell"
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-surface text-text-main"
    >
      <div className="window-chrome-bar" role="presentation">
        <div className="chrome-left" />
        <div className="chrome-center" />
        <div className="chrome-right" />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden pt-[var(--window-chrome-strip-height)]">
        <SettingsNav active={section} onSelect={setSection} onBack={onBack} />
        <main aria-label="设置内容" className="min-h-0 flex-1 overflow-y-auto bg-app-bg">
          {settings ? (
            <SettingsContent
              section={section}
              settings={settings}
              onUpdate={handleUpdate}
              onConnectProvider={setKeyModalProvider}
              onClearProvider={handleClearKey}
              onTestProvider={handleTestConnection}
              onArchivedSessionsChange={onArchivedSessionsChange}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-text-faint">加载设置中…</div>
          )}
        </main>
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
  onArchivedSessionsChange?: () => void;
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
    case "archivedChats":
      return <ArchivedChatsSection onArchivedSessionsChange={rest.onArchivedSessionsChange} />;
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

      <LocalUpdateGroup />

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

function LocalUpdateGroup() {
  const [state, setState] = useState<LocalUpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bridgeReady = hasLocalUpdateBridge();

  useEffect(() => {
    if (!bridgeReady || !window.actspace.getLocalUpdateState) return;
    window.actspace
      .getLocalUpdateState()
      .then(setState)
      .catch(() => {
        setStatus("读取本地更新状态失败。");
      });
  }, [bridgeReady]);

  const chooseSource = async () => {
    if (!window.actspace.selectLocalUpdateSource) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.actspace.selectLocalUpdateSource();
      setState(result.state);
      if (!result.canceled && !result.state.sourceValid) {
        setStatus(result.state.reason ?? "所选目录不可用于本地更新。");
      }
    } catch {
      setStatus("选择源码目录失败。");
    } finally {
      setBusy(false);
    }
  };

  const startUpdate = async () => {
    if (!window.actspace.startLocalUpdate) return;
    setBusy(true);
    setStatus("正在启动本地更新…");
    try {
      const result = await window.actspace.startLocalUpdate();
      setState(result.state);
      setStatus(result.ok ? "本地更新已启动，应用即将退出并在替换完成后重启。" : result.message ?? "本地更新启动失败。");
    } catch {
      setStatus("本地更新启动失败。");
    } finally {
      setBusy(false);
    }
  };

  const sourceText = state?.sourceRoot ?? "尚未选择源码目录";
  const reason = !bridgeReady
    ? "仅桌面端安装版可用。"
    : state?.reason;
  const canStart = Boolean(bridgeReady && state?.canUpdate && !busy);

  return (
    <SettingGroup title="本地更新">
      <SettingRow
        title="源码目录"
        description={
          <span className="break-all">
            {sourceText}
            {state?.sourceRoot && !state.sourceValid ? <span className="ml-2 text-on-danger">目录不可用</span> : null}
          </span>
        }
        control={
          <button type="button" className={BTN_SECONDARY} onClick={() => void chooseSource()} disabled={!bridgeReady || busy}>
            选择目录
          </button>
        }
        align="start"
      />
      <SettingRow
        title="构建并更新"
        description={
          <span className="flex max-w-[430px] flex-col gap-1">
            <span>从所选源码重新打包，退出当前应用，替换已安装的 actspace.app 后自动重启。</span>
            {state?.logPath ? <span className="break-all text-text-subtle">日志：{state.logPath}</span> : null}
            {reason ? <span className="text-on-danger">{reason}</span> : null}
            {status ? <span className={status.includes("失败") ? "text-on-danger" : "text-text-muted"}>{status}</span> : null}
          </span>
        }
        control={
          <button type="button" className={BTN_PRIMARY} onClick={() => void startUpdate()} disabled={!canStart}>
            {busy || state?.running ? "处理中…" : "构建并更新"}
          </button>
        }
        align="start"
      />
    </SettingGroup>
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
  const [promptFile, setPromptFile] = useState<AgentSystemPromptFile>(MOCK_PROMPT_FILE);
  const [draftPrompt, setDraftPrompt] = useState(MOCK_PROMPT_FILE.content);
  const [saved, setSaved] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPrompt() {
      setPromptError(null);
      try {
        const next = hasPromptFileBridge()
          ? await window.actspace.readAgentSystemPrompt()
          : { path: settings.agent.systemPromptPath, content: "" };
        if (cancelled) return;
        setPromptFile(next);
        setDraftPrompt(next.content);
        setSaved(false);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load agent system prompt", error);
        setPromptFile({ path: settings.agent.systemPromptPath, content: "" });
        setDraftPrompt("");
        setPromptError("读取系统提示词文件失败。");
      }
    }

    void loadPrompt();
    return () => {
      cancelled = true;
    };
  }, [settings.agent.systemPromptPath]);

  const dirty = draftPrompt !== promptFile.content;
  const charCount = draftPrompt.length;
  const savePrompt = async () => {
    if (!hasPromptFileBridge()) {
      setPromptFile({ ...promptFile, content: draftPrompt });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      return;
    }
    setPromptError(null);
    try {
      const next = await window.actspace.writeAgentSystemPrompt({ content: draftPrompt });
      setPromptFile(next);
      setDraftPrompt(next.content);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      console.error("Failed to save agent system prompt", error);
      setPromptError("保存系统提示词文件失败。");
    }
  };

  return (
    <SectionShell title="智能体">
      <SettingGroup title="主 Agent">
        <div className="flex flex-col gap-3 px-4 py-4">
          <label htmlFor="agent-system-prompt" className="text-[14px] font-semibold text-text-main">
            自定义系统提示词
          </label>
          <div className="break-all text-[12px] text-text-faint">{promptFile.path}</div>
          <textarea
            id="agent-system-prompt"
            value={draftPrompt}
            maxLength={AGENT_SYSTEM_PROMPT_MAX_CHARS}
            onChange={(event) => {
              setDraftPrompt(event.target.value);
              setSaved(false);
            }}
            className="h-[132px] w-full resize-y overflow-auto rounded-act-md border border-line bg-surface-subtle px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-subtle focus:border-brand"
            spellCheck={false}
            aria-label="主 Agent 自定义系统提示词"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-text-faint">
              {charCount.toLocaleString()} / {AGENT_SYSTEM_PROMPT_MAX_CHARS.toLocaleString()}
              {saved && !dirty ? <span className="ml-2 text-on-success">已保存</span> : null}
              {promptError ? <span className="ml-2 text-on-danger">{promptError}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setDraftPrompt(promptFile.content);
                  setSaved(false);
                  setPromptError(null);
                }}
                disabled={!dirty}
              >
                撤销更改
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={() => void savePrompt()} disabled={!dirty}>
                保存
              </button>
            </div>
          </div>
        </div>
      </SettingGroup>

      <KairosSettings settings={settings} onUpdate={onUpdate} />
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

function ArchivedChatsSection({
  onArchivedSessionsChange,
}: {
  onArchivedSessionsChange?: () => void;
}) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const bridgeReady = hasArchivedSessionsBridge();

  const loadArchived = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!bridgeReady) {
      setSessions(mockArchivedSessions);
      setLoading(false);
      return;
    }

    try {
      const archived = await window.actspace.listSessions({ archived: true });
      setSessions(archived);
    } catch (err) {
      console.error("Failed to load archived sessions", err);
      setError("归档会话加载失败。");
    } finally {
      setLoading(false);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

  const restoreSession = async (sessionId: string) => {
    setRestoringId(sessionId);
    setError(null);
    if (!bridgeReady) {
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setRestoringId(null);
      return;
    }

    try {
      const result = await window.actspace.archiveSession({ sessionId, archived: false });
      if (!result.ok) {
        setError(result.error ?? "恢复归档会话失败。");
        return;
      }
      await loadArchived();
      onArchivedSessionsChange?.();
    } catch (err) {
      console.error("Failed to restore archived session", err);
      setError("恢复归档会话失败。");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <SectionShell title="归档会话" description="已归档的会话不会出现在左侧会话栏，可在这里恢复。">
      <SettingGroup>
        {loading ? (
          <div className="px-4 py-4 text-[13px] text-text-faint">正在加载归档会话…</div>
        ) : error ? (
          <div className="px-4 py-4 text-[13px] text-on-danger">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-text-faint">暂无归档会话</div>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-text-main">{session.title}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-faint">
                  <span>{formatUpdatedAt(session.updatedAt)}</span>
                  <span>{session.turnCount} turns</span>
                  <span>{workspaceLabelFromRoot(session.workspaceRoot)}</span>
                </div>
              </div>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={restoringId === session.id}
                onClick={() => void restoreSession(session.id)}
              >
                {restoringId === session.id ? "恢复中…" : "恢复"}
              </button>
            </div>
          ))
        )}
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
