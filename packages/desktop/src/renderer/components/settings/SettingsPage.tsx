import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Monitor, Moon, Sun, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type AgentSystemPromptFile,
  type AppSettings,
  type LocalUpdateProgressPhase,
  type LocalUpdateState,
  type SearchProviderId,
  type SearchUsageResult,
  type SecretProviderId,
  type SessionListItem,
  type SetProviderKeyResult,
  type SettingsUpdateInput,
} from "@actspace/shared";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import { KairosSettings } from "./KairosSettings";
import { FileWatchSection } from "./FileWatchSettings";
import { PluginsSection } from "./PluginsSettings";
import { SkillsSection } from "./SkillsSettings";
import { TOOL_ITEMS } from "./tool-catalog";
import { ProviderSettings } from "./ProviderSettings";
import { ModelSettings } from "./ModelSettings";
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
const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
const LOCAL_UPDATE_POLL_MS = 700;

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

function isActiveLocalUpdatePhase(phase: LocalUpdateProgressPhase): boolean {
  return phase === "starting" || phase === "building" || phase === "ready_to_replace" || phase === "waiting_for_exit" || phase === "replacing";
}

function isLocalUpdateActive(state: LocalUpdateState | null): boolean {
  if (!state) return false;
  return state.running || isActiveLocalUpdatePhase(state.progress.phase);
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

/** 浏览器预览模式（无 IPC 桥）下模拟密钥保存/断开的本地状态更新。 */
function previewSetKeyState(
  current: AppSettings,
  provider: SecretProviderId,
  hasApiKey: boolean,
): AppSettings {
  if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
    return { ...current, providers: { ...current.providers, [provider]: { hasApiKey } } };
  }
  return { ...current, searchProviders: { ...current.searchProviders, [provider]: { hasApiKey } } };
}

function mergeSettings(current: AppSettings, input: SettingsUpdateInput): AppSettings {
  return {
    ...current,
    defaultModelId: input.defaultModelId !== undefined ? input.defaultModelId : current.defaultModelId,
    agent: input.agent ? { ...current.agent, ...input.agent } : current.agent,
    kairos: input.kairos ? { ...current.kairos, ...input.kairos } : current.kairos,
    plugins: input.plugins
      ? {
          ...current.plugins,
          ...input.plugins,
          fsWatch: input.plugins.fsWatch
            ? { ...current.plugins.fsWatch, ...input.plugins.fsWatch }
            : current.plugins.fsWatch,
        }
      : current.plugins,
    skills: input.skills ? { ...current.skills, ...input.skills } : current.skills,
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
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [keyModalProvider, setKeyModalProvider] = useState<SecretProviderId | null>(null);

  useEffect(() => {
    if (!hasSettingsBridge()) {
      setSettingsError("设置仅在桌面端可用。");
      return;
    }
    window.actspace
      .getSettings()
      .then((next) => {
        setSettings(next);
        setSettingsError(null);
      })
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
        setSettingsError("读取设置失败。");
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!hasSettingsBridge()) return;
    try {
      const next = await window.actspace.getSettings();
      setSettings(next);
      onSettingsChange?.(next);
    } catch (error) {
      console.error("Failed to refresh settings", error);
    }
  }, [onSettingsChange]);

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
    async (provider: SecretProviderId, apiKey: string): Promise<SetProviderKeyResult> => {
      if (!hasSettingsBridge()) {
        setSettings((current) => (current ? previewSetKeyState(current, provider, true) : current));
        return { ok: true };
      }
      const result = await window.actspace.setProviderKey({ provider, apiKey });
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const handleClearKey = useCallback(
    async (provider: SecretProviderId) => {
      if (!hasSettingsBridge()) {
        setSettings((current) => (current ? previewSetKeyState(current, provider, false) : current));
        return;
      }
      await window.actspace.clearProviderKey({ provider });
      await refresh();
    },
    [refresh],
  );

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
              onArchivedSessionsChange={onArchivedSessionsChange}
              onRefresh={refresh}
            />
          ) : settingsError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-text-faint">
              {settingsError}
            </div>
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
  onConnectProvider: (provider: SecretProviderId) => void;
  onClearProvider: (provider: SecretProviderId) => Promise<void>;
  onArchivedSessionsChange?: () => void;
  onRefresh: () => Promise<void>;
};

function SettingsContent({ section, ...rest }: SectionProps & { section: SettingsSectionId }) {
  switch (section) {
    case "general":
      return <GeneralSection {...rest} />;
    case "providers":
      return <ProvidersSection {...rest} />;
    case "model":
      return <ModelSettings settings={rest.settings} onChanged={rest.onRefresh} />;
    case "agent":
      return <AgentSection {...rest} />;
    case "kairos":
      return <KairosSection {...rest} />;
    case "tools":
      return <ToolsSection {...rest} />;
    case "plugins":
      return <PluginsSection settings={rest.settings} onUpdate={rest.onUpdate} />;
    case "fileWatch":
      return <FileWatchSection />;
    case "skills":
      return <SkillsSection settings={rest.settings} onUpdate={rest.onUpdate} />;
    case "appearance":
      return <AppearanceSection />;
    case "archivedChats":
      return <ArchivedChatsSection onArchivedSessionsChange={rest.onArchivedSessionsChange} />;
    case "update":
      return <LocalUpdateSection />;
    default:
      return null;
  }
}

function ProvidersSection({ settings, onConnectProvider, onClearProvider, onRefresh }: SectionProps) {
  return (
    <>
      <ProviderSettings onChanged={onRefresh} />
      <SectionShell title="联网搜索服务" description="搜索工具的凭据独立于 LLM 服务商，不参与模型列表和代理设置。">
        <div className="w-full max-w-[720px]">
          <SettingGroup>
            {SEARCH_PROVIDER_ROWS.map(({ provider, label, description }) => (
              <SearchProviderRow key={provider} provider={provider} label={label} description={description} hasApiKey={settings.searchProviders[provider].hasApiKey} onConnect={onConnectProvider} onClear={onClearProvider} />
            ))}
            <TavilyUsageRow hasApiKey={settings.searchProviders.tavily.hasApiKey} />
          </SettingGroup>
        </div>
      </SectionShell>
    </>
  );
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

function LocalUpdateSection() {
  const [state, setState] = useState<LocalUpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
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

  useEffect(() => {
    if (!bridgeReady || !window.actspace.getLocalUpdateState) return;
    if (!progressOpen && !isLocalUpdateActive(state)) return;

    let canceled = false;
    const refreshState = async () => {
      try {
        const next = await window.actspace.getLocalUpdateState?.();
        if (!canceled && next) {
          setState(next);
          if (next.progress.phase === "failed") {
            setStatus(next.progress.message);
          }
        }
      } catch {
        if (!canceled) setStatus("读取本地更新进度失败。");
      }
    };

    void refreshState();
    const timer = window.setInterval(() => void refreshState(), LOCAL_UPDATE_POLL_MS);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [bridgeReady, progressOpen, state?.running, state?.progress.phase]);

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
    setProgressOpen(true);
    try {
      const result = await window.actspace.startLocalUpdate();
      setState(result.state);
      setStatus(result.ok ? "本地更新已启动，正在构建。" : result.message ?? "本地更新启动失败。");
      if (!result.ok) setProgressOpen(false);
    } catch {
      setStatus("本地更新启动失败。");
      setProgressOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const sourceText = state?.sourceRoot ?? "尚未选择源码目录";
  const appTargetText = state?.appPath ?? "尚未识别到已安装的 Actspace.app";
  const reason = !bridgeReady
    ? "仅桌面端安装版可用。"
    : state?.reason;
  const canStart = Boolean(bridgeReady && state?.canUpdate && !busy);
  const active = isLocalUpdateActive(state);

  return (
    <>
      <SectionShell title="本地更新" description="从本机源码重新构建并替换已安装的 Actspace.app。">
        <SettingGroup>
          <SettingRow
            title="源码目录"
            description={
              <span className="break-all">
                {sourceText}
                {state?.sourceRoot && !state.sourceValid ? <span className="ml-2 text-on-danger">目录不可用</span> : null}
              </span>
            }
            control={
              <button type="button" className={BTN_SECONDARY} onClick={() => void chooseSource()} disabled={!bridgeReady || busy || active}>
                选择目录
              </button>
            }
            align="start"
          />
          <SettingRow
            title="安装目标"
            description={
              <span className="flex max-w-[430px] flex-col gap-1">
                <span className="break-all">{appTargetText}</span>
                {state?.appExecutablePath ? (
                  <span className="break-all text-text-subtle">当前进程：{state.appExecutablePath}</span>
                ) : null}
                {typeof state?.appIsPackaged === "boolean" ? (
                  <span className="text-text-subtle">Electron packaged：{state.appIsPackaged ? "是" : "否"}</span>
                ) : null}
              </span>
            }
            align="start"
          />
          <SettingRow
            title="构建并更新"
            description={
              <span className="flex max-w-[430px] flex-col gap-1">
                <span>先在当前应用内完成构建；构建完成后再退出、替换已安装的 Actspace.app 并自动重启。</span>
                {state?.logPath ? <span className="break-all text-text-subtle">日志：{state.logPath}</span> : null}
                {reason ? <span className="text-on-danger">{reason}</span> : null}
                {status ? <span className={status.includes("失败") ? "text-on-danger" : "text-text-muted"}>{status}</span> : null}
              </span>
            }
            control={
              <button type="button" className={BTN_PRIMARY} onClick={() => void startUpdate()} disabled={!canStart}>
                {busy || active ? "处理中…" : "构建并更新"}
              </button>
            }
            align="start"
          />
        </SettingGroup>
      </SectionShell>
      {progressOpen && state ? (
        <LocalUpdateProgressDialog state={state} onClose={() => setProgressOpen(false)} />
      ) : null}
    </>
  );
}

const LOCAL_UPDATE_STEPS: { phase: LocalUpdateProgressPhase; label: string }[] = [
  { phase: "starting", label: "启动" },
  { phase: "building", label: "构建" },
  { phase: "ready_to_replace", label: "准备替换" },
  { phase: "waiting_for_exit", label: "退出当前应用" },
  { phase: "replacing", label: "替换" },
];

function localUpdateStepIndex(phase: LocalUpdateProgressPhase): number {
  if (phase === "succeeded") return LOCAL_UPDATE_STEPS.length;
  if (phase === "failed") return Math.max(1, LOCAL_UPDATE_STEPS.findIndex((step) => step.phase === "building") + 1);
  const index = LOCAL_UPDATE_STEPS.findIndex((step) => step.phase === phase);
  return index >= 0 ? index + 1 : 0;
}

function formatLocalUpdateTime(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function LocalUpdateProgressDialog({
  state,
  onClose,
}: {
  state: LocalUpdateState;
  onClose: () => void;
}) {
  const progress = state.progress;
  const phase = progress.phase;
  const isFailed = phase === "failed";
  const isSucceeded = phase === "succeeded";
  const isActive = isActiveLocalUpdatePhase(phase);
  const completedSteps = localUpdateStepIndex(phase);
  const progressWidth = isFailed
    ? "100%"
    : `${Math.min(100, Math.max(8, (completedSteps / LOCAL_UPDATE_STEPS.length) * 100))}%`;
  const updatedAt = formatLocalUpdateTime(progress.updatedAt);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-overlay px-4"
      role="presentation"
      onClick={isActive ? undefined : onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-[14px] border border-line bg-surface-raised p-5 shadow-act-popover"
        role="dialog"
        aria-modal="true"
        aria-label="本地更新进度"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-act-lg",
                isFailed ? "bg-danger-soft text-on-danger" : isSucceeded ? "bg-success-soft text-on-success" : "bg-brand-soft text-brand",
              ].join(" ")}
              aria-hidden="true"
            >
              {isFailed ? (
                <CircleAlert size={21} strokeWidth={2.2} />
              ) : isSucceeded ? (
                <CheckCircle2 size={21} strokeWidth={2.2} />
              ) : (
                <Loader2 size={21} strokeWidth={2.2} className="animate-spin" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-bold text-text-main">本地更新</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-text-faint">{progress.message}</p>
            </div>
          </div>
          {!isActive ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-act-md text-text-faint transition hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main"
              aria-label="关闭更新进度"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <div
          className="mt-5 h-2 overflow-hidden rounded-act-pill bg-line"
          role="progressbar"
          aria-label="本地更新进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isFailed ? 100 : Math.round(Math.min(100, Math.max(0, (completedSteps / LOCAL_UPDATE_STEPS.length) * 100)))}
        >
          <div
            className={[
              "h-full rounded-act-pill transition-all duration-300",
              isFailed ? "bg-danger" : isSucceeded ? "bg-success" : "bg-brand",
            ].join(" ")}
            style={{ width: progressWidth }}
          />
        </div>

        <ol className="mt-4 grid grid-cols-5 gap-1.5">
          {LOCAL_UPDATE_STEPS.map((step, index) => {
            const done = isSucceeded || index < completedSteps;
            const current = step.phase === phase;
            return (
              <li key={step.phase} className="flex min-w-0 flex-col items-center gap-1 text-center">
                <span
                  className={[
                    "flex h-5 w-5 items-center justify-center rounded-act-pill border text-[10px] font-semibold",
                    current && isActive
                      ? "border-brand bg-brand text-white"
                      : done
                        ? "border-success bg-success-soft text-on-success"
                        : "border-line bg-surface text-text-faint",
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                <span className="w-full truncate text-[11px] text-text-faint">{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-col gap-1 rounded-act-md border border-line bg-surface-subtle px-3 py-2">
          {updatedAt ? <span className="text-[12px] text-text-faint">更新时间：{updatedAt}</span> : null}
          <span className="break-all text-[12px] text-text-subtle">日志：{state.logPath}</span>
        </div>

        {isActive ? (
          <p className="mt-3 text-[12px] leading-relaxed text-text-faint">
            构建阶段不会退出应用；构建完成后才会关闭窗口并执行替换。
          </p>
        ) : null}

        {!isActive ? (
          <div className="mt-5 flex justify-end">
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>
              关闭
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SEARCH_PROVIDER_ROWS: Array<{
  provider: SearchProviderId;
  label: string;
  description: string;
}> = [
  {
    provider: "zhipu",
    label: "智谱 Web Search",
    description: "国内搜索通道；按次计费（search_pro ¥0.03/次），中文内容覆盖好。",
  },
  {
    provider: "tavily",
    label: "Tavily",
    description: "国际搜索通道优先级 1；每月 1000 credits 免费，超出按量计费。",
  },
  {
    provider: "tinyfish",
    label: "TinyFish",
    description: "国际搜索通道优先级 2；搜索接口目前免费（按套餐限速）。",
  },
  {
    provider: "exa",
    label: "Exa",
    description: "国际搜索通道优先级 3；语义搜索，按量计费。",
  },
];

function SearchProviderRow({
  provider,
  label,
  description,
  hasApiKey,
  onConnect,
  onClear,
}: {
  provider: SearchProviderId;
  label: string;
  description: string;
  hasApiKey: boolean;
  onConnect: (provider: SecretProviderId) => void;
  onClear: (provider: SecretProviderId) => Promise<void>;
}) {
  const badge = hasApiKey
    ? { text: "已连接", className: "bg-success-soft text-on-success" }
    : { text: "未连接", className: "bg-surface-subtle text-text-faint" };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
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
          <button type="button" className={BTN_DANGER} onClick={() => void onClear(provider)}>
            断开连接
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={() => onConnect(provider)}>
            连接
          </button>
        )}
      </div>
    </div>
  );
}

/** Tavily 额度显示：账户级 plan credits 用量（GET /usage）。其余 provider 无公开用量接口。 */
function TavilyUsageRow({ hasApiKey }: { hasApiKey: boolean }) {
  const [usage, setUsage] = useState<SearchUsageResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasApiKey || typeof window === "undefined" || !window.actspace?.getSearchUsage) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.actspace
      .getSearchUsage()
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        if (!cancelled) setUsage({ ok: false, error: "Tavily 用量查询失败。" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasApiKey]);

  if (!hasApiKey) return null;

  return (
    <div className="px-4 py-3">
      <p className="text-[12px] text-text-faint">
        {loading
          ? "查询 Tavily 剩余额度中…"
          : usage?.ok && usage.tavily
            ? `Tavily 本周期已用 ${usage.tavily.planUsage}${
                usage.tavily.planLimit !== null ? ` / ${usage.tavily.planLimit}` : ""
              } credits${
                usage.tavily.planLimit !== null
                  ? `，剩余 ${Math.max(usage.tavily.planLimit - usage.tavily.planUsage, 0)}`
                  : ""
              }。`
            : usage?.error ?? "Tavily 用量暂不可用。"}
      </p>
    </div>
  );
}

function AgentSection({ settings, onUpdate }: SectionProps) {
  const [promptFile, setPromptFile] = useState<AgentSystemPromptFile | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptBridgeReady = hasPromptFileBridge();

  useEffect(() => {
    let cancelled = false;

    async function loadPrompt() {
      setPromptError(null);
      if (!promptBridgeReady) {
        setPromptFile(null);
        setDraftPrompt("");
        setSaved(false);
        setPromptError("系统提示词文件接口不可用。");
        return;
      }

      try {
        const next = await window.actspace.readAgentSystemPrompt();
        if (cancelled) return;
        setPromptFile(next);
        setDraftPrompt(next.content);
        setSaved(false);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load agent system prompt", error);
        setPromptFile(null);
        setDraftPrompt("");
        setPromptError("读取系统提示词文件失败。");
      }
    }

    void loadPrompt();
    return () => {
      cancelled = true;
    };
  }, [promptBridgeReady]);

  const dirty = Boolean(promptFile && draftPrompt !== promptFile.content);
  const charCount = draftPrompt.length;
  const savePrompt = async () => {
    if (!promptBridgeReady || !promptFile) {
      setPromptError("系统提示词文件接口不可用。");
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
          <div className="break-all text-[12px] text-text-faint">
            {promptFile?.path ?? settings.agent.systemPromptPath}
          </div>
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
            disabled={!promptBridgeReady || !promptFile}
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
                  setDraftPrompt(promptFile?.content ?? "");
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

    </SectionShell>
  );
}

function KairosSection({ settings, onUpdate, onRefresh }: SectionProps) {
  return (
    <SectionShell
      title="Kairos"
      description="自主智能体的模型、人格、规则、任务表与运行边界（2026-07-04 由「智能体」分区拆出）。"
    >
      <KairosSettings settings={settings} onUpdate={onUpdate} onChanged={onRefresh} />
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
      setSessions([]);
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
      setError("归档会话仅桌面端可恢复。");
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

const PROVIDER_LABELS: Record<SecretProviderId, string> = {
  deepseek: "DeepSeek",
  kimi: "Kimi",
  openrouter: "OpenRouter",
  zhipu: "智谱 Web Search",
  tavily: "Tavily",
  tinyfish: "TinyFish",
  exa: "Exa",
};

function ProviderKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: SecretProviderId;
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
