import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, CircleAlert, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import {
  DEFAULT_IMAGE_GENERATION_BASE_URL,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  IMAGE_INSPECTION_MODEL_LIST,
  resolveImageInspectionModel,
  type AgentSystemPromptFile,
  type AppSettings,
  type LocalUpdateProgressPhase,
  type LocalUpdateState,
  type SecretProviderId,
  type SessionListItem,
  type SetProviderKeyResult,
  type SettingsV4NamespacePatch,
  type SettingsV4Snapshot,
  type SettingsUpdateInput,
  type TaskModelSettings,
  type ModelKey,
  type UsableModelView,
  type UsageStatisticsSnapshot,
  type UsageActivitySnapshot,
  type WorkspaceEntry,
} from "@actspace/shared";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import { ShortcutSettings } from "./ShortcutSettings";
import {
  BROWSER_TOOL_GROUP,
  BROWSER_TOOL_ITEMS,
  PRIMARY_TOOL_ITEMS,
} from "./tool-catalog";
import { ProviderSettings } from "./ProviderSettings";
import { UsageStatisticsPage } from "../UsageStatisticsPage";
import { useDialogFocusTrap } from "./useDialogFocusTrap";
import { SearchSettings } from "./SearchSettings";
import { useToolToggle } from "./useToolToggle";
import {
  SectionShell,
  PageShell,
  SettingsSaveNoticeProvider,
  SettingGroup,
  SettingLinkRow,
  SettingSubhead,
  InlineWarning,
  SettingEditor,
  SettingsInput,
  StatusDot,
  useSettingsSaveNotice,
  useSingleEditor,
  SettingRow,
  SettingsSelect,
  Stepper,
  Toggle,
  type SelectOption,
} from "./SettingsPrimitives";
import { ModelPurposeSelect } from "./ModelPurposeSelect";
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
import { Button } from "../ui/Button";

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
  if (!root) return "默认工作区";
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "默认工作区";
}

function formatUpdatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
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
  if (provider === "image-generation") {
    const currentImage = current.imageGeneration ?? {
      hasApiKey: false,
      baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL,
      model: DEFAULT_IMAGE_GENERATION_MODEL,
    };
    return { ...current, imageGeneration: { ...currentImage, hasApiKey } };
  }
  return { ...current, searchProviders: { ...current.searchProviders, [provider]: { hasApiKey } } };
}

function mergeSettings(current: AppSettings, input: SettingsUpdateInput): AppSettings {
  return {
    ...current,
    defaultModelId: input.defaultModelId !== undefined ? input.defaultModelId : current.defaultModelId,
    agent: input.agent ? { ...current.agent, ...input.agent } : current.agent,
    skills: input.skills ? { ...current.skills, ...input.skills } : current.skills,
    imageInspection: input.imageInspection ?? current.imageInspection,
  };
}

export function SettingsPage({
  onBack,
  initialSection = "general",
  focusSpeech = false,
  onSpeechFocused,
  onSectionChange,
  onSettingsChange,
  onArchivedSessionsChange,
  usageSnapshot,
  usageActivitySnapshot,
  usageLoading,
  usageError,
  onUsageRefresh,
  onUsageRequestPageChange,
  workspaces,
}: {
  onBack: () => void;
  initialSection?: SettingsSectionId;
  focusSpeech?: boolean;
  onSpeechFocused?: () => void;
  onSectionChange?: (section: SettingsSectionId) => void;
  /** 设置变更后回传最新快照，供上层（如 Composer 默认模型）联动。 */
  onSettingsChange?: (settings: AppSettings) => void;
  /** 归档会话恢复后通知上层刷新普通会话列表。 */
  onArchivedSessionsChange?: () => void;
  usageSnapshot?: UsageStatisticsSnapshot | null;
  usageActivitySnapshot?: UsageActivitySnapshot | null;
  usageLoading?: boolean;
  usageError?: string | null;
  onUsageRefresh?: (range: UsageStatisticsSnapshot["range"], requestRowsPage?: number, status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  onUsageRequestPageChange?: (page: number, range: UsageStatisticsSnapshot["range"], status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  workspaces?: WorkspaceEntry[];
}) {
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsV4, setSettingsV4] = useState<SettingsV4Snapshot | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [keyModalProvider, setKeyModalProvider] = useState<SecretProviderId | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const navigate = useCallback((nextSection: SettingsSectionId) => {
    setSection(nextSection);
    onSectionChange?.(nextSection);
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [onSectionChange]);

  useEffect(() => {
    if (!focusSpeech || !settings || section !== "general") return;
    document.getElementById("speech-settings")?.scrollIntoView({ block: "start" });
    onSpeechFocused?.();
  }, [focusSpeech, settings, section, onSpeechFocused]);

  useEffect(() => {
    if (!hasSettingsBridge()) {
      setSettingsError("设置仅在桌面端可用。");
      return;
    }
    void Promise.all([
      window.actspace.getSettings(),
      window.actspace.getSettingsV4?.() ?? Promise.resolve(null),
    ])
      .then(([next, nextV4]) => {
        setSettings(next);
        setSettingsV4(nextV4);
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
      if (window.actspace.getSettingsV4) {
        setSettingsV4(await window.actspace.getSettingsV4());
      }
      onSettingsChange?.(next);
    } catch (error) {
      console.error("Failed to refresh settings", error);
    }
  }, [onSettingsChange]);

  const handleUpdateNamespace = useCallback(async (input: SettingsV4NamespacePatch): Promise<SettingsV4Snapshot | null> => {
    if (!window.actspace?.updateSettingsV4 || !settingsV4) return null;
    const result = await window.actspace.updateSettingsV4({ ...input, expectedRevision: settingsV4.revision });
    if ("latest" in result) {
      setSettingsV4(result.latest);
      throw new Error(result.message);
    }
    setSettingsV4(result.snapshot);
    if (window.actspace.getSettings) {
      const legacy = await window.actspace.getSettings();
      setSettings(legacy);
      onSettingsChange?.(legacy);
    }
    return result.snapshot;
  }, [onSettingsChange, settingsV4]);

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
    <SettingsSaveNoticeProvider>
    <div
      data-testid="settings-page-shell"
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-app-bg text-text-main"
    >
      <div className="window-chrome-bar" role="presentation">
        <div className="chrome-left" />
        <div className="chrome-center" />
        <div className="chrome-right" />
      </div>

      {/* 导航列与内容区各自延伸到窗口顶部，顶部 chrome 区域不再是一条独立色带。 */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[820px]:flex-col">
        <SettingsNav
          active={section}
          onSelect={navigate}
          onBack={onBack}
        />
        <main
          ref={mainRef}
          aria-label="设置内容"
          className={`mt-[var(--window-chrome-strip-height)] min-h-0 flex-1 bg-app-bg max-[820px]:mt-0 ${section === "usage" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {settings ? (
            <SettingsContent
              section={section}
              settings={settings}
              onUpdate={handleUpdate}
              onConnectProvider={setKeyModalProvider}
              onClearProvider={handleClearKey}
              onSaveProviderKey={handleSaveKey}
              onNavigate={navigate}
              onArchivedSessionsChange={onArchivedSessionsChange}
              onRefresh={refresh}
              settingsV4={settingsV4}
              onUpdateNamespace={handleUpdateNamespace}
              onReplaceSettings={(next) => {
                setSettings(next);
                onSettingsChange?.(next);
              }}
              usageSnapshot={usageSnapshot}
              usageActivitySnapshot={usageActivitySnapshot}
              usageLoading={usageLoading}
              usageError={usageError}
              onUsageRefresh={onUsageRefresh}
              onUsageRequestPageChange={onUsageRequestPageChange}
              workspaces={workspaces}
            />
          ) : settingsError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-act-sm text-text-faint">
              {settingsError}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-act-sm text-text-faint">加载设置中…</div>
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
    </SettingsSaveNoticeProvider>
  );
}

type SectionProps = {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
  onConnectProvider: (provider: SecretProviderId) => void;
  onClearProvider: (provider: SecretProviderId) => Promise<void>;
  onSaveProviderKey: (provider: SecretProviderId, apiKey: string) => Promise<SetProviderKeyResult>;
  onNavigate: (section: SettingsSectionId) => void;
  onArchivedSessionsChange?: () => void;
  onRefresh: () => Promise<void>;
  onReplaceSettings: (settings: AppSettings) => void;
  usageSnapshot?: UsageStatisticsSnapshot | null;
  usageActivitySnapshot?: UsageActivitySnapshot | null;
  usageLoading?: boolean;
  usageError?: string | null;
  onUsageRefresh?: (range: UsageStatisticsSnapshot["range"], requestRowsPage?: number, status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  onUsageRequestPageChange?: (page: number, range: UsageStatisticsSnapshot["range"], status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  workspaces?: WorkspaceEntry[];
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
};

function SettingsContent({ section, ...rest }: SectionProps & { section: SettingsSectionId }) {
  switch (section) {
    case "general":
      return (
        <PageShell title="通用" description="ActSpace 与 Agent 的默认行为。">
          <GeneralSection {...rest} />
          <AgentInstructionsSection {...rest} />
          <TaskModelDefaultsSection
            settings={rest.settings}
            settingsV4={rest.settingsV4}
            onUpdateNamespace={rest.onUpdateNamespace}
            onChanged={rest.onRefresh}
            onNavigate={rest.onNavigate}
          />
          <MediaDefaultsSection
            settings={rest.settings}
            onUpdate={rest.onUpdate}
            onClear={rest.onClearProvider}
            onRefresh={rest.onRefresh}
            onNavigate={rest.onNavigate}
          />
          <SpeechSettingsSection />
          <ShortcutSettings settings={rest.settings} onSettingsChange={rest.onReplaceSettings} />
        </PageShell>
      );
    case "model":
      return (
        <PageShell title="模型" description="模型连接、API Key 与模型目录管理。">
          <ProviderSettings settings={rest.settings} onChanged={rest.onRefresh} />
        </PageShell>
      );
    case "search":
      return (
        <PageShell title="搜索" description="Agent 联网搜索使用的服务。Key 只保存在本机。">
          <SearchSettings {...rest} />
        </PageShell>
      );
    case "tools":
      return <PageShell title="工具" description="Agent 可以调用哪些工具，以及执行前是否需要你确认。联网搜索在「搜索」中管理。"><ToolsSection {...rest} /></PageShell>;
    case "appearance":
      return <PageShell title="外观" description="主题、字体与字号。"><AppearanceSection /></PageShell>;
    case "archivedChats":
      return <PageShell title="归档会话"><ArchivedChatsSection onArchivedSessionsChange={rest.onArchivedSessionsChange} /></PageShell>;
    case "subagents":
      return <PageShell title="子 Agent" description="主 Agent 可以委派任务的专门代理。"><SubagentSection settings={rest.settings} onRefresh={rest.onRefresh} /></PageShell>;
    case "usage":
      return (
        <UsageStatisticsPage
          snapshot={rest.usageSnapshot ?? null}
          activitySnapshot={rest.usageActivitySnapshot ?? null}
          isLoading={rest.usageLoading}
          error={rest.usageError}
          onRefresh={rest.onUsageRefresh}
          onRequestPageChange={rest.onUsageRequestPageChange}
          workspaces={rest.workspaces}
          settingsV4={rest.settingsV4}
          onUpdateNamespace={rest.onUpdateNamespace}
        />
      );
    case "update":
      return <PageShell title="更新" description="检查版本并从本机源码更新 ActSpace。"><LocalUpdateSection /></PageShell>;
    default:
      return null;
  }
}

function ProvidersSection({ settings, onUpdate, onConnectProvider, onClearProvider, onRefresh }: SectionProps) {
  return <ProviderSettings onChanged={onRefresh} />;
}

function ImageInspectionSettingsRows({
  settings,
  onUpdate,
  onNavigate,
}: Pick<SectionProps, "settings" | "onUpdate"> & { onNavigate?: (section: SettingsSectionId) => void }) {
  const notifySaved = useSettingsSaveNotice();
  const current = settings.imageInspection ?? { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY };
  const selectedModel = resolveImageInspectionModel(current.modelKey);
  const provider = settings.providers[selectedModel.provider];
  const credentials = provider?.additionalCredentials ?? [];
  const selectedCredential = credentials.find((credential) => credential.id === current.credentialId);
  const credentialAvailable = current.credentialId
    ? selectedCredential?.hasApiKey === true
    : provider?.hasApiKey === true;
  const providerLabel = selectedModel.provider === "openrouter" ? "OpenRouter" : "Kimi";
  const modelOptions = IMAGE_INSPECTION_MODEL_LIST.map((model) => ({
    value: model.key,
    label: `${model.label} · ${model.provider === "openrouter" ? "OpenRouter" : "Kimi"}`,
  }));
  const credentialOptions = [
    { value: "", label: `默认 Key${provider?.hasApiKey ? "" : "（不可用）"}`, disabled: !provider?.hasApiKey },
    ...(current.credentialId && !selectedCredential ? [{ value: current.credentialId, label: "已删除的 Key（不可用）", disabled: true }] : []),
    ...credentials.map((credential) => ({
      value: credential.id,
      label: `${credential.label}${credential.hasApiKey ? "" : "（不可用）"}`,
      disabled: !credential.hasApiKey,
    })),
  ];

  return (
    <>
      <SettingRow
        title="图片分析模型"
        description={credentialAvailable
          ? `${selectedModel.apiModel} · 调用时会把本地图片发送给 ${providerLabel}。`
          : (
            <InlineWarning actionLabel={onNavigate ? "去连接" : undefined} onAction={onNavigate ? () => onNavigate("model") : undefined}>
              缺少 {providerLabel} Key，调用会失败。
            </InlineWarning>
          )}
        control={
          <SettingsSelect
            value={current.modelKey}
            options={modelOptions}
            ariaLabel="图片分析模型"
            onChange={(modelKey) => {
              const nextModel = resolveImageInspectionModel(modelKey);
              const nextProvider = settings.providers[nextModel.provider];
              const fallbackCredential = nextProvider?.hasApiKey
                ? undefined
                : nextProvider?.additionalCredentials?.find((credential) => credential.hasApiKey)?.id;
              onUpdate({ imageInspection: { modelKey: nextModel.key as typeof current.modelKey, credentialId: fallbackCredential } });
              notifySaved();
            }}
          />
        }
      />
      {credentials.length > 0 ? (
        <SettingRow
          indent
          title="调用 Key"
          description={`${providerLabel} 已保存的凭据；Key 本身不会进入界面设置。`}
          control={
            <SettingsSelect
              value={current.credentialId ?? ""}
              options={credentialOptions}
              ariaLabel="图片分析调用 Key"
              onChange={(credentialId) => {
                onUpdate({ imageInspection: { modelKey: current.modelKey, credentialId: credentialId || undefined } });
                notifySaved();
              }}
            />
          }
        />
      ) : null}
    </>
  );
}

function MediaDefaultsSection({
  settings,
  onUpdate,
  onClear,
  onRefresh,
  onNavigate,
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
  onClear: (provider: SecretProviderId) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const current = settings.imageGeneration ?? {
    hasApiKey: false,
    baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL,
    model: DEFAULT_IMAGE_GENERATION_MODEL,
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const endpointLabel = formatImageGenerationEndpoint(current.baseUrl);

  return (
    <>
      <SettingGroup title="媒体" headingLevel={3} description="图片生成与图片分析默认使用的服务。">
        <SettingLinkRow
          title="图片生成"
          description={current.hasApiKey
            ? `${current.model} · ${endpointLabel}`
            : "配置 API Key 后，主 Agent 才能使用图片生成工具。"}
          trailing={<StatusDot tone={current.hasApiKey ? "ok" : "off"}>{current.hasApiKey ? "已配置" : "未配置"}</StatusDot>}
          ariaLabel={current.hasApiKey ? "编辑图片生成服务配置" : "配置图片生成服务"}
          onClick={() => {
            triggerRef.current = document.activeElement as HTMLElement | null;
            setDialogOpen(true);
          }}
        />
        <ImageInspectionSettingsRows settings={settings} onUpdate={onUpdate} onNavigate={onNavigate} />
      </SettingGroup>
      {dialogOpen ? (
        <ImageGenerationSettingsDialog
          current={current}
          restoreFocusTo={triggerRef.current}
          onClose={() => setDialogOpen(false)}
          onClear={onClear}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}

function ImageGenerationSettingsDialog({
  current,
  restoreFocusTo,
  onClose,
  onClear,
  onRefresh,
}: {
  current: { hasApiKey: boolean; baseUrl: string; model: string };
  restoreFocusTo?: HTMLElement | null;
  onClose: () => void;
  onClear: (provider: SecretProviderId) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [model, setModel] = useState(current.model);
  const [replaceKey, setReplaceKey] = useState(!current.hasApiKey);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, trapTabKey } = useDialogFocusTrap(restoreFocusTo);
  const endpointLabel = formatImageGenerationEndpoint(baseUrl);

  const save = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      setAdvancedOpen(true);
      setError("Base URL 和模型名称不能为空。");
      return;
    }
    if (!current.hasApiKey && !apiKey.trim()) {
      setError("首次配置时请输入 API Key。");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      if (!window.actspace.updateImageGeneration) {
        setError("当前环境不支持保存图片生成配置。");
        return;
      }
      const result = await window.actspace.updateImageGeneration({
        ...(apiKey.trim() && { apiKey }),
        baseUrl,
        model,
      });
      if (!result.ok) {
        setError(result.error ?? "保存失败。");
        return;
      }
      await onRefresh();
      onClose();
    } catch {
      setError("保存失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError(null);
    try {
      await onClear("image-generation");
      onClose();
    } catch {
      setError("断开失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-(--act-z-modal) grid place-items-center bg-scrim px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-generation-dialog-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
        else trapTabKey(event);
      }}
    >
      <div className="max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="image-generation-dialog-title" className="text-act-lg font-semibold text-text-main">
              配置图片生成服务
            </h2>
            <p className="mt-1 text-act-xs leading-relaxed text-text-faint">
              密钥只在 main 进程解密使用；保存后从下一次图片生成调用生效。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭图片生成服务配置"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-act-md text-text-faint transition hover:bg-surface-subtle"
            onClick={onClose}
            disabled={Boolean(busy)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {current.hasApiKey && !replaceKey ? (
            <div className="flex items-center gap-3 rounded-act-lg border border-line bg-surface-subtle px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md bg-operational-soft text-operational">
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-act-sm font-semibold text-text-main">API Key 已安全保存</div>
                <p className="mt-0.5 text-act-xxs text-text-faint">出于安全原因，已保存的 Key 不会回显。</p>
              </div>
              <Button variant="secondary" autoFocus  onClick={() => setReplaceKey(true)}>
                更换 Key
              </Button>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
              API Key
              <div className="relative">
                <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <input
                  autoFocus
                  type="password"
                  value={apiKey}
                  placeholder={current.hasApiKey ? "输入新 Key；留空保持现有 Key" : "sk-..."}
                  aria-label="图片生成服务 API Key"
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-10 w-full rounded-act-md border border-line bg-surface-subtle pl-9 pr-3 text-act-sm text-text-main outline-none placeholder:text-text-subtle focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                />
              </div>
            </label>
          )}

          <div className="overflow-hidden rounded-act-lg border border-line">
            <button
              type="button"
              aria-label="高级设置"
              aria-expanded={advancedOpen}
              aria-controls="image-generation-advanced-settings"
              className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/20"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <ChevronRight size={16} className={`shrink-0 text-text-faint transition-transform ${advancedOpen ? "rotate-90" : ""}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-act-sm font-semibold text-text-main">高级设置</span>
                <span className="mt-0.5 block truncate text-act-xxs text-text-faint">{model || "未填写模型"} · {endpointLabel}</span>
              </span>
            </button>
            {advancedOpen ? (
              <div id="image-generation-advanced-settings" className="grid gap-4 border-t border-line bg-surface-subtle px-3.5 py-3.5">
                <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
                  Base URL
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="h-10 rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-act-xs font-semibold text-text-muted">
                  模型名称
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="h-10 rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
                  />
                </label>
                {baseUrl.trim().toLowerCase().startsWith("http://") ? (
                  <p className="flex gap-1.5 text-act-xxs leading-relaxed text-on-danger">
                    <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    当前 Base URL 使用 HTTP，API Key 和请求内容可能以未加密网络流量传输。
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div>
            {current.hasApiKey ? (
              <Button variant="danger" onClick={() => void disconnect()} disabled={Boolean(busy)}>
                {busy === "disconnect" ? "断开中…" : "断开服务"}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>取消</Button>
            <Button variant="primary" onClick={() => void save()} disabled={Boolean(busy)}>
              {busy === "save" ? "保存中…" : "保存配置"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatImageGenerationEndpoint(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || baseUrl;
  } catch {
    return baseUrl || "未填写地址";
  }
}

function GeneralSection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const editor = useSingleEditor<"displayName" | "responseStyle">();
  const saved = settingsV4?.settings.general.personalization;
  const [displayName, setDisplayName] = useState("");
  const [responseStyle, setResponseStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const v4Ready = Boolean(settingsV4 && settingsV4Available());

  useEffect(() => {
    if (!saved || editor.openId) return;
    setDisplayName(saved.displayName);
    setResponseStyle(saved.responseStyle);
  }, [saved, editor.openId]);

  const cancelEditing = () => {
    setDisplayName(saved?.displayName ?? "");
    setResponseStyle(saved?.responseStyle ?? "");
    setSaveError(null);
    editor.close();
  };

  const toggleEditor = (field: "displayName" | "responseStyle") => {
    if (editor.isOpen(field)) {
      cancelEditing();
      return;
    }
    setDisplayName(saved?.displayName ?? "");
    setResponseStyle(saved?.responseStyle ?? "");
    setSaveError(null);
    editor.open(field);
  };

  const savePersonalization = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdateNamespace({
        namespace: "general",
        patch: { personalization: { displayName: displayName.trim(), responseStyle: responseStyle.trim() } },
      });
      editor.close();
      notifySaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "个人偏好保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingGroup
      title="个人偏好"
      headingLevel={3}
      description="影响 Agent 对你的称呼与表达方式，不覆盖系统规则。"
    >
      <SettingLinkRow
        title="显示名称"
        value={saved?.displayName || "未设置"}
        ariaLabel="编辑显示名称"
        expanded={editor.isOpen("displayName")}
        controlsId="personalization-display-name"
        disabled={!v4Ready}
        onClick={() => toggleEditor("displayName")}
      />
      {editor.isOpen("displayName") ? (
        <SettingEditor
          id="personalization-display-name"
          hint="最多 60 个字符"
          error={saveError}
          saving={saving}
          saveAriaLabel="保存显示名称"
          onCancel={cancelEditing}
          onSave={() => void savePersonalization()}
        >
          <SettingsInput
            aria-label="显示名称"
            width="full"
            autoFocus
            value={displayName}
            maxLength={60}
            placeholder="例如：Jin"
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void savePersonalization();
            }}
          />
        </SettingEditor>
      ) : null}
      <SettingLinkRow
        title="回复风格"
        value={saved?.responseStyle || "未设置"}
        ariaLabel="编辑回复风格"
        expanded={editor.isOpen("responseStyle")}
        controlsId="personalization-response-style"
        disabled={!v4Ready}
        onClick={() => toggleEditor("responseStyle")}
      />
      {editor.isOpen("responseStyle") ? (
        <SettingEditor
          id="personalization-response-style"
          hint="一句话描述偏好的语气、详略或格式 · 最多 500 字"
          error={saveError}
          saving={saving}
          saveAriaLabel="保存回复风格"
          onCancel={cancelEditing}
          onSave={() => void savePersonalization()}
        >
          <textarea
            aria-label="回复风格偏好"
            autoFocus
            value={responseStyle}
            maxLength={500}
            onChange={(event) => setResponseStyle(event.target.value)}
            placeholder="例如：简洁、直接，优先给结论"
            className={SETTINGS_TEXTAREA_CLASS}
          />
        </SettingEditor>
      ) : null}
    </SettingGroup>
  );
}

const SETTINGS_TEXTAREA_CLASS =
  "min-h-[76px] w-full resize-y rounded-act-sm border border-line bg-surface px-2.5 py-2 text-act-sm leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-subtle hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15 disabled:cursor-not-allowed disabled:opacity-55";

const EMPTY_TASK_MODELS: TaskModelSettings = {
  defaultChatModel: null,
  utilityModel: null,
  exploreModel: null,
};

type GenerationDefaults = { temperature: string; maxOutputTokens: string; compactionPercent: number };

function parseTemperature(raw: string): number | null | "invalid" {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 2 ? value : "invalid";
}

function parseMaxOutputTokens(raw: string): number | null | "invalid" {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : "invalid";
}

export function TaskModelDefaultsSection({
  settings,
  settingsV4,
  onUpdateNamespace,
  onChanged,
  onNavigate,
}: {
  settings: AppSettings;
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace?: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
  onChanged?: () => void | Promise<void>;
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const notifySaved = useSettingsSaveNotice();
  const [taskModels, setTaskModels] = useState<TaskModelSettings>(settings.taskModels ?? EMPTY_TASK_MODELS);
  const [usable, setUsable] = useState<Record<"chat" | "utility" | "explore", UsableModelView[]>>({ chat: [], utility: [], explore: [] });
  const [draft, setDraft] = useState<GenerationDefaults>({ temperature: "", maxOutputTokens: "", compactionPercent: 80 });
  const [fieldError, setFieldError] = useState<{ temperature?: string; maxOutputTokens?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const v4Ready = Boolean(settingsV4 && onUpdateNamespace && settingsV4Available());
  const savedDefaults = settingsV4?.settings.general.taskDefaults;

  const load = async () => {
    if (!window.actspace?.listUsableModels) return;
    const [chat, utility, explore] = await Promise.all([
      window.actspace.listUsableModels({ purpose: "chat" }),
      window.actspace.listUsableModels({ purpose: "utility" }),
      window.actspace.listUsableModels({ purpose: "explore" }),
    ]);
    setUsable({ chat: chat.models, utility: utility.models, explore: explore.models });
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (settings.taskModels) setTaskModels(settings.taskModels); }, [settings.taskModels]);
  useEffect(() => {
    if (!savedDefaults) return;
    setDraft({
      temperature: savedDefaults.temperature === null ? "" : String(savedDefaults.temperature),
      maxOutputTokens: savedDefaults.maxOutputTokens === null ? "" : String(savedDefaults.maxOutputTokens),
      compactionPercent: Math.round((savedDefaults.chatCompactionTriggerRatio ?? 0.8) * 100),
    });
  }, [savedDefaults]);

  const updateTask = async (field: keyof TaskModelSettings, value: ModelKey | null) => {
    if (!window.actspace?.updateTaskModels) return;
    setError(null);
    try {
      const result = await window.actspace.updateTaskModels({ [field]: value });
      setTaskModels(result.taskModels);
      notifySaved();
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务默认模型保存失败。");
    }
  };

  /** 失焦或步进时保存；只提交合法且与已保存值不同的生成参数。 */
  const commitDefaults = async (next: GenerationDefaults) => {
    const temperature = parseTemperature(next.temperature);
    const maxOutputTokens = parseMaxOutputTokens(next.maxOutputTokens);
    const errors = {
      temperature: temperature === "invalid" ? "温度需在 0–2 之间；留空使用模型默认值。" : undefined,
      maxOutputTokens: maxOutputTokens === "invalid" ? "需为 1–1,000,000 的整数；留空使用模型默认值。" : undefined,
    };
    setFieldError(errors);
    if (temperature === "invalid" || maxOutputTokens === "invalid" || !onUpdateNamespace) return;
    const chatCompactionTriggerRatio = next.compactionPercent / 100;
    if (savedDefaults
      && savedDefaults.temperature === temperature
      && savedDefaults.maxOutputTokens === maxOutputTokens
      && Math.abs((savedDefaults.chatCompactionTriggerRatio ?? 0.8) - chatCompactionTriggerRatio) < 1e-9) return;
    setError(null);
    try {
      await onUpdateNamespace({
        namespace: "general",
        patch: { taskDefaults: { temperature, maxOutputTokens, chatCompactionTriggerRatio } },
      });
      notifySaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成参数保存失败，请重试。");
    }
  };

  const exploreModel = taskModels.exploreModel;
  const exploreLabel = exploreModel
    ? usable.explore.find((model) => model.key === exploreModel)?.label ?? exploreModel
    : "跟随会话模型";
  const fieldDescription = (message: string | undefined, fallback?: string) =>
    message ? <span className="text-on-danger">{message}</span> : fallback;

  return (
    <SettingGroup title="模型与生成" headingLevel={3} description="新请求使用的模型和生成参数，只影响之后的请求。">
      <ModelPurposeSelect label="默认会话模型" description="新会话和未手动选择模型时使用。" value={taskModels.defaultChatModel} models={usable.chat} onChange={(value) => void updateTask("defaultChatModel", value)} />
      <ModelPurposeSelect label="轻量任务模型" description="标题、工具摘要和上下文压缩。" value={taskModels.utilityModel} models={usable.utility} onChange={(value) => void updateTask("utilityModel", value)} />
      <SettingLinkRow
        title="Explore 模型"
        description="在「子 Agent」中管理。"
        value={exploreLabel}
        ariaLabel="前往子 Agent 设置 Explore 模型"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("subagents")}
      />
      <SettingRow
        title="温度"
        description={fieldDescription(fieldError.temperature)}
        control={
          <SettingsInput
            aria-label="默认温度"
            type="number"
            min="0"
            max="2"
            step="0.1"
            width="sm"
            numeric
            invalid={Boolean(fieldError.temperature)}
            value={draft.temperature}
            placeholder="模型默认"
            disabled={!v4Ready}
            onChange={(event) => setDraft((current) => ({ ...current, temperature: event.target.value }))}
            onBlur={() => void commitDefaults(draft)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        }
      />
      <SettingRow
        title="最大输出 Token"
        description={fieldDescription(fieldError.maxOutputTokens)}
        control={
          <SettingsInput
            aria-label="默认最大输出 Token"
            type="number"
            min="1"
            max="1000000"
            step="1"
            width="sm"
            numeric
            invalid={Boolean(fieldError.maxOutputTokens)}
            value={draft.maxOutputTokens}
            placeholder="模型默认"
            disabled={!v4Ready}
            onChange={(event) => setDraft((current) => ({ ...current, maxOutputTokens: event.target.value }))}
            onBlur={() => void commitDefaults(draft)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        }
      />
      <SettingRow
        title="自动压缩阈值"
        description={fieldDescription(error ?? undefined, "仅 Chat 形态：上下文占用达到该比例时压缩历史。")}
        control={
          <Stepper
            ariaLabel="自动压缩阈值"
            value={draft.compactionPercent}
            min={50}
            max={95}
            step={5}
            defaultValue={80}
            disabled={!v4Ready}
            format={(value) => `${value}%`}
            onChange={(compactionPercent) => {
              const next = { ...draft, compactionPercent };
              setDraft(next);
              void commitDefaults(next);
            }}
          />
        }
      />
    </SettingGroup>
  );
}

function settingsV4Available(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.getSettingsV4 && window.actspace?.updateSettingsV4);
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
        <SettingGroup title="更新来源" headingLevel={3} description="从本机源码重新构建并替换已安装的 Actspace.app。">
          <SettingRow
            title="源码目录"
            description={
              <span className="break-all font-mono text-act-xs text-text-faint">
                {sourceText}
                {state?.sourceRoot && !state.sourceValid ? <span className="ml-2 text-on-danger">目录不可用</span> : null}
              </span>
            }
            control={
              <Button variant="secondary" onClick={() => void chooseSource()} disabled={!bridgeReady || busy || active}>
                选择目录
              </Button>
            }
            align="start"
          />
          <SettingRow
            title="安装目标"
            description={
              <span className="flex max-w-[430px] flex-col gap-1">
                <span className="break-all font-mono text-act-xs text-text-faint">{appTargetText}</span>
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
              <Button variant="primary" onClick={() => void startUpdate()} disabled={!canStart}>
                {busy || active ? "处理中…" : "构建并更新"}
              </Button>
            }
            align="start"
          />
        </SettingGroup>
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
  return new Intl.DateTimeFormat("zh-CN", {
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
      className="fixed inset-0 z-(--act-z-modal) flex items-center justify-center bg-overlay px-4"
      role="presentation"
      onClick={isActive ? undefined : onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-act-lg border border-line bg-surface-raised p-5 shadow-act-popover"
        role="dialog"
        aria-modal="true"
        aria-label="本地更新进度"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center",
                isFailed ? "text-on-danger" : isSucceeded ? "text-on-success" : "text-operational",
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
            </span>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="text-act-lg font-bold text-text-main">本地更新</h3>
              <p className="min-w-0 text-act-xs leading-relaxed text-text-faint">{progress.message}</p>
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
              "h-full rounded-act-pill transition-all duration-(--motion-slow)",
              isFailed ? "bg-danger" : isSucceeded ? "bg-success" : "bg-operational",
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
                    "flex h-5 w-5 items-center justify-center rounded-act-pill border text-act-xxs font-semibold",
                    current && isActive
                      ? "border-operational bg-operational text-on-operational"
                      : done
                        ? "border-success bg-success-soft text-on-success"
                        : "border-line bg-surface text-text-faint",
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                <span className="w-full truncate text-act-xxs text-text-faint">{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-col gap-1 rounded-act-md border border-line bg-surface-subtle px-3 py-2">
          {updatedAt ? <span className="text-act-xs text-text-faint">更新时间：{updatedAt}</span> : null}
          <span className="break-all text-act-xs text-text-subtle">日志：{state.logPath}</span>
        </div>

        {isActive ? (
          <p className="mt-3 text-act-xs leading-relaxed text-text-faint">
            构建阶段不会退出应用；构建完成后才会关闭窗口并执行替换。
          </p>
        ) : null}

        {!isActive ? (
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AgentInstructionsSection({ settings }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const [promptFile, setPromptFile] = useState<AgentSystemPromptFile | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptBridgeReady = hasPromptFileBridge();

  useEffect(() => {
    let cancelled = false;

    async function loadPrompt() {
      setPromptError(null);
      if (!promptBridgeReady) {
        setPromptFile(null);
        setDraftPrompt("");
        setPromptError("系统提示词文件接口不可用。");
        return;
      }

      try {
        const next = await window.actspace.readAgentSystemPrompt();
        if (cancelled) return;
        setPromptFile(next);
        setDraftPrompt(next.content);
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
  const closeEditor = () => {
    setDraftPrompt(promptFile?.content ?? "");
    if (promptFile) setPromptError(null);
    setEditorOpen(false);
  };
  const savePrompt = async () => {
    if (!promptBridgeReady || !promptFile) {
      setPromptError("系统提示词文件接口不可用。");
      return;
    }
    setSaving(true);
    setPromptError(null);
    try {
      const next = await window.actspace.writeAgentSystemPrompt({ content: draftPrompt });
      setPromptFile(next);
      setDraftPrompt(next.content);
      setEditorOpen(false);
      notifySaved();
    } catch (error) {
      console.error("Failed to save agent system prompt", error);
      setPromptError("保存系统提示词文件失败，内容已保留。");
    } finally {
      setSaving(false);
    }
  };

  const path = promptFile?.path ?? settings.agent.systemPromptPath;
  return (
    <SettingGroup title="Agent 指令" headingLevel={3}>
      <SettingLinkRow
        title="系统提示词"
        description={promptError && !editorOpen ? <span className="font-sans text-act-xs text-on-danger">{promptError}</span> : path}
        monoDescription
        value={promptFile ? `${promptFile.content.length.toLocaleString("zh-CN")} 字` : undefined}
        ariaLabel={editorOpen ? "收起 Agent 指令" : "编辑 Agent 指令"}
        expanded={editorOpen}
        controlsId="agent-system-prompt-editor"
        disabled={!promptBridgeReady || !promptFile}
        onClick={() => (editorOpen ? closeEditor() : setEditorOpen(true))}
      />
      {editorOpen ? (
        <SettingEditor
          id="agent-system-prompt-editor"
          hint={`保存后从下一次请求生效 · ${draftPrompt.length.toLocaleString("zh-CN")} / ${AGENT_SYSTEM_PROMPT_MAX_CHARS.toLocaleString("zh-CN")}`}
          error={promptError}
          saving={saving}
          saveDisabled={!dirty}
          onCancel={closeEditor}
          onSave={() => void savePrompt()}
        >
          <textarea
            id="agent-system-prompt"
            value={draftPrompt}
            maxLength={AGENT_SYSTEM_PROMPT_MAX_CHARS}
            onChange={(event) => setDraftPrompt(event.target.value)}
            className={`${SETTINGS_TEXTAREA_CLASS} min-h-[180px] font-mono`}
            spellCheck={false}
            autoFocus
            aria-label="主 Agent 自定义系统提示词"
          />
        </SettingEditor>
      ) : null}
    </SettingGroup>
  );
}

function SubagentSection({
  settings,
  onRefresh,
}: Pick<SectionProps, "settings" | "onRefresh">) {
  const notifySaved = useSettingsSaveNotice();
  const [exploreModel, setExploreModel] = useState<ModelKey | null>(settings.taskModels?.exploreModel ?? null);
  const [models, setModels] = useState<UsableModelView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setExploreModel(settings.taskModels?.exploreModel ?? null); }, [settings.taskModels?.exploreModel]);
  useEffect(() => {
    if (!window.actspace?.listUsableModels) return;
    let cancelled = false;
    void window.actspace.listUsableModels({ purpose: "explore" })
      .then((result) => { if (!cancelled) setModels(result.models); })
      .catch(() => { if (!cancelled) setError("可用模型读取失败。"); });
    return () => { cancelled = true; };
  }, []);

  const update = async (value: ModelKey | null) => {
    if (!window.actspace?.updateTaskModels) return;
    setError(null);
    try {
      const result = await window.actspace.updateTaskModels({ exploreModel: value });
      setExploreModel(result.taskModels.exploreModel);
      notifySaved();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Explore 模型保存失败。");
    }
  };

  return (
    <SettingGroup title="Explore" headingLevel={3} description="只读代码探索：读取、搜索、列目录；不写文件，不执行命令。">
      <ModelPurposeSelect
        label="Explore 模型"
        description={error ? undefined : "未单独设置时跟随默认会话模型。"}
        emptyLabel="跟随会话模型"
        value={exploreModel}
        models={models}
        disabled={!window.actspace?.updateTaskModels}
        onChange={(value) => void update(value)}
      />
      {error ? <div role="alert" className="px-4 py-2.5 text-act-xs text-on-danger">{error}</div> : null}
    </SettingGroup>
  );
}

function ToolsSection({ settings, onUpdate, settingsV4, onUpdateNamespace }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const tools = useToolToggle({ settings, settingsV4, onUpdate, onUpdateNamespace });
  const bashAlwaysAsk = settingsV4?.settings.tools.bash.alwaysAsk ?? settings.agent.bashAlwaysAsk;
  const showFileChangeStats = settingsV4?.settings.tools.showFileChangeStats !== false;
  const [browserDetailsOpen, setBrowserDetailsOpen] = useState(false);
  const bashEnabled = tools.isEnabled("bash");
  const browserEnabled = tools.isEnabled(BROWSER_TOOL_GROUP) && tools.isEnabled("browser_help");
  const browserExecutionTools = BROWSER_TOOL_ITEMS.filter((tool) => tool.kind !== "capability");
  const browserCapabilities = BROWSER_TOOL_ITEMS.filter((tool) => tool.kind === "capability");
  const codeTools = PRIMARY_TOOL_ITEMS.filter((tool) => ["read_file", "grep", "glob", "list_directory", "edit_file_diff", "write_file"].includes(tool.name));
  const mediaTools = PRIMARY_TOOL_ITEMS.filter((tool) => ["generate_image", "inspect_image"].includes(tool.name));
  const enabledCodeTools = codeTools.filter((tool) => tools.isEnabled(tool.name)).length;
  const imageGenerationReady = settings.imageGeneration?.hasApiKey === true;
  const imageInspectionModel = resolveImageInspectionModel((settings.imageInspection ?? { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY }).modelKey);
  const imageInspectionReady = settings.providers[imageInspectionModel.provider]?.hasApiKey === true
    || Boolean(settings.providers[imageInspectionModel.provider]?.additionalCredentials?.some((credential) => credential.hasApiKey));

  const writeToolsPatch = (patch: Extract<SettingsV4NamespacePatch, { namespace: "tools" }>["patch"], legacy: () => void, label: string) => {
    if (tools.v4Writable) {
      void onUpdateNamespace({ namespace: "tools", patch }).then(() => notifySaved()).catch((error: unknown) => {
        console.error(`Failed to update ${label}`, error);
      });
    } else {
      legacy();
      notifySaved();
    }
  };

  const toggleBrowserGroup = (enabled: boolean) => {
    tools.setToolEnabled(enabled ? [BROWSER_TOOL_GROUP, "browser_help"] : [BROWSER_TOOL_GROUP], enabled);
  };

  const renderToolRow = (tool: (typeof PRIMARY_TOOL_ITEMS)[number], options: { indent?: boolean; disabled?: boolean; description?: ReactNode } = {}) => (
    <SettingRow
      key={tool.name}
      tight
      indent={options.indent}
      disabled={options.disabled}
      title={tool.label}
      description={options.description ?? tool.description}
      control={<Toggle checked={tools.isEnabled(tool.name)} disabled={options.disabled} onChange={(next) => tools.setToolEnabled(tool.name, next)} ariaLabel={tool.label} />}
    />
  );

  const renderBrowserItem = (tool: (typeof BROWSER_TOOL_ITEMS)[number]) => renderToolRow(tool, {
    indent: true,
    disabled: !browserEnabled,
    description: tool.description,
  });

  const mediaDescription = (tool: (typeof PRIMARY_TOOL_ITEMS)[number]) => {
    if (tool.name === "generate_image") {
      return imageGenerationReady
        ? "使用「通用 → 媒体」中配置的服务。"
        : <InlineWarning>图片生成服务尚未配置，工具不会出现。</InlineWarning>;
    }
    return imageInspectionReady
      ? "使用「通用 → 媒体」中选择的模型。"
      : <InlineWarning>当前图片分析模型缺少可用 Key。</InlineWarning>;
  };

  return (
    <>
      <SettingGroup title="代码库" headingLevel={3} description="读取、搜索和修改工作区文件。" meta={`${enabledCodeTools} / ${codeTools.length} 已启用`}>
        {codeTools.map((tool) => renderToolRow(tool))}
      </SettingGroup>

      <SettingGroup title="终端" headingLevel={3}>
        {PRIMARY_TOOL_ITEMS.filter((tool) => tool.name === "bash").map((tool) => (
          <SettingRow
            key={tool.name}
            title={tool.label}
            description={tool.description}
            control={<Toggle checked={bashEnabled} onChange={(next) => tools.setToolEnabled(tool.name, next)} ariaLabel={tool.label} />}
          />
        ))}
        <SettingRow
          indent
          disabled={!bashEnabled}
          title="执行前确认"
          description="每条命令执行前询问你；硬性拒绝规则始终生效。"
          control={
            <Toggle
              checked={bashAlwaysAsk}
              disabled={!bashEnabled}
              onChange={(next) => writeToolsPatch({ bash: { alwaysAsk: next } }, () => onUpdate({ agent: { bashAlwaysAsk: next } }), "Bash review settings")}
              ariaLabel="执行前确认"
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="浏览器" headingLevel={3}>
        <SettingRow
          title="浏览器工具"
          description="需要 Browser Bridge 与 Chrome 扩展；修改从下一次模型调用开始生效。"
          control={<Toggle checked={browserEnabled} onChange={toggleBrowserGroup} ariaLabel="浏览器" />}
        />
        <SettingLinkRow
          indent
          disabled={!browserEnabled}
          title="高级设置"
          description="按类别启用浏览器操作。"
          ariaLabel="浏览器高级设置"
          expanded={browserDetailsOpen}
          controlsId="browser-tool-details"
          onClick={() => setBrowserDetailsOpen((open) => !open)}
        />
        {browserDetailsOpen ? (
          <div id="browser-tool-details" className="divide-y divide-line/60">
            <SettingSubhead indent>执行工具</SettingSubhead>
            {browserExecutionTools.map(renderBrowserItem)}
            <SettingSubhead indent>敏感能力</SettingSubhead>
            {browserCapabilities.map((tool) => renderToolRow(tool, {
              indent: true,
              disabled: !browserEnabled,
              description: tool.description,
            }))}
          </div>
        ) : null}
      </SettingGroup>

      <SettingGroup title="多媒体" headingLevel={3}>
        {mediaTools.map((tool) => renderToolRow(tool, { description: mediaDescription(tool) }))}
      </SettingGroup>

      <SettingGroup title="显示" headingLevel={3}>
        <SettingRow
          title="显示写入变动"
          description="写入时显示增删行数，不自动展开内容。"
          control={
            <Toggle
              checked={showFileChangeStats}
              disabled={!tools.v4Writable}
              onChange={(next) => writeToolsPatch({ showFileChangeStats: next }, () => undefined, "file change display settings")}
              ariaLabel="显示写入变动"
            />
          }
        />
      </SettingGroup>
    </>
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
      <SettingGroup title="已归档" headingLevel={3} description="恢复后会重新出现在左侧会话栏。">
        {loading ? (
          <div className="px-3.5 py-4 text-act-sm text-text-faint">正在加载归档会话…</div>
        ) : error ? (
          <div className="px-3.5 py-4 text-act-sm text-on-danger">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-act-sm text-text-faint">暂无归档会话</div>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-act-sm font-medium text-text-main">{session.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-act-xs text-text-muted">
                  <span>{formatUpdatedAt(session.updatedAt)}</span>
                  <span>{session.agentRunCount} 次运行</span>
                  <span>{workspaceLabelFromRoot(session.workspaceRoot)}</span>
                </div>
              </div>
              <Button
                busy={restoringId === session.id}
                disabled={restoringId === session.id}
                onClick={() => void restoreSession(session.id)}
              >
                {restoringId === session.id ? "恢复中…" : "恢复"}
              </Button>
            </div>
          ))
        )}
      </SettingGroup>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

const PREVIEW_PALETTE = {
  light: {
    bg: "bg-[var(--act-preview-light-bg)]",
    sidebar: "bg-[var(--act-preview-light-sidebar)]",
    line: "bg-[var(--act-preview-light-line)]",
    ink: "bg-[var(--act-preview-light-ink)]",
  },
  dark: {
    bg: "bg-[var(--act-preview-dark-bg)]",
    sidebar: "bg-[var(--act-preview-dark-sidebar)]",
    line: "bg-[var(--act-preview-dark-line)]",
    ink: "bg-[var(--act-preview-dark-ink)]",
  },
} as const;

function ThemeMiniWindow({ tone, className = "" }: { tone: "light" | "dark"; className?: string }) {
  const palette = PREVIEW_PALETTE[tone];
  return (
    <span aria-hidden="true" className={`absolute inset-0 flex ${palette.bg} ${className}`}>
      <span className={`flex w-[30%] flex-col gap-[5px] px-1.5 py-2.5 ${palette.sidebar}`}>
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-2.5 py-3">
        <i className={`block h-[5px] w-1/2 rounded-full ${palette.ink}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] w-[70%] rounded-full ${palette.line}`} />
      </span>
    </span>
  );
}

function ThemeTiles({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  return (
    <div role="radiogroup" aria-label="主题" className="grid grid-cols-3 gap-3 max-[600px]:gap-2">
      {THEME_OPTIONS.map(({ value: optionValue, label }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => onChange(optionValue)}
            className="group rounded-act-group text-left focus-visible:outline-none"
          >
            <span
              className={`relative block h-[84px] overflow-hidden rounded-act-md border transition-shadow duration-(--motion-base) group-focus-visible:ring-[3px] group-focus-visible:ring-focus-ring/20 ${
                selected ? "border-transparent ring-2 ring-text-main" : "border-line group-hover:border-line-strong"
              }`}
            >
              {optionValue === "system" ? (
                <>
                  <ThemeMiniWindow tone="light" />
                  <ThemeMiniWindow tone="dark" className="[clip-path:polygon(55%_0,100%_0,100%_100%,45%_100%)]" />
                </>
              ) : (
                <ThemeMiniWindow tone={optionValue} />
              )}
            </span>
            <span className={`mt-2 block text-act-xs font-medium ${selected ? "text-text-main" : "text-text-muted"}`}>{label}</span>
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
    <>
      <SectionShell title="主题" description="“跟随系统”会随 macOS 外观自动切换。">
        <ThemeTiles value={prefs.theme} onChange={(value) => update({ theme: value })} />
      </SectionShell>

      <SettingGroup title="字体与字号" headingLevel={3}>
        <SettingRow
          title="界面字体"
          description="界面与 AI 回复正文。"
          control={
            <SettingsSelect
              size="sm"
              value={prefs.uiFontId}
              options={UI_FONT_OPTIONS}
              onChange={(value) => update({ uiFontId: value as UiFontId })}
              ariaLabel="界面字体"
            />
          }
        />
        <SettingRow
          title="界面字号"
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
          title="代码字体"
          description="代码块、diff 与终端输出。"
          control={
            <SettingsSelect
              size="sm"
              value={prefs.codeFontId}
              options={CODE_FONT_OPTIONS}
              onChange={(value) => update({ codeFontId: value as CodeFontId })}
              ariaLabel="代码字体"
            />
          }
        />
        <SettingRow
          title="代码字号"
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
        <div aria-label="字体预览" className="px-4 py-4">
          <p className="leading-relaxed text-text-main" style={{ fontSize: prefs.uiFontSize }}>
            已完成设置页重构：导航分组保持不变，所有页面使用同一套分组和控件。
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-act-sm bg-surface-subtle px-3 py-2.5 font-mono text-text-muted" style={{ fontSize: prefs.codeFontSize }}>
            pnpm --filter @actspace/desktop test
          </pre>
        </div>
      </SettingGroup>
    </>
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
  "speech-minimax": "MiniMax 语音",
  "image-generation": "图片生成服务",
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
      className="fixed inset-0 z-(--act-z-modal) flex items-center justify-center bg-overlay px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-act-lg border border-line bg-surface-raised p-5 shadow-act-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`连接 ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-act-lg font-bold text-text-main">连接 {label}</h3>
        <p className="mt-1.5 text-act-xs leading-relaxed text-text-faint">
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
          className="mt-4 h-10 w-full rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none transition-colors focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20"
        />
        {error ? <p className="mt-2 text-act-xs text-on-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
