import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  SecretProviderId,
  SettingsV4Snapshot,
  UsageActivitySnapshot,
  UsageStatisticsSnapshot,
  WorkspaceEntry,
} from "@actspace/shared";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import { HostConnectionsSettings } from "./HostConnectionsSettings";
import { ProviderSettings } from "./ProviderSettings";
import { SearchSettings } from "./SearchSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { ProviderKeyModal } from "./dialogs/ProviderKeyModal";
import { PageShell, SettingsSaveNoticeProvider } from "./SettingsPrimitives";
import { useSettings } from "./use-settings";
import type { SectionProps } from "./sections/shared";
import { AgentInstructionsSection } from "./sections/AgentInstructionsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { ArchivedChatsSection } from "./sections/ArchivedChatsSection";
import { GeneralSection } from "./sections/GeneralSection";
import { LocalUpdateSection } from "./sections/LocalUpdateSection";
import { MediaDefaultsSection } from "./sections/MediaDefaultsSection";
import { PerformanceSection } from "./sections/PerformanceSection";
import { ConversationDisplaySection } from "./sections/ConversationDisplaySection";
import { SubagentSection } from "./sections/SubagentSection";
import { TaskModelDefaultsSection } from "./sections/TaskModelDefaultsSection";
import { ToolsSection } from "./sections/ToolsSection";
import { UsageStatisticsPage } from "../UsageStatisticsPage";

// 设置页入口：左侧导航 + 右侧按 section 渲染。数据加载与保存在 use-settings，各 section 在 sections/ 下。
// 测试从这里 import TaskModelDefaultsSection 单独渲染，保留再导出。
export { TaskModelDefaultsSection };

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
  usageProgress,
  onUsageCancel,
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
  usageProgress?: import("@actspace/shared").UsageQueryProgress | null;
  onUsageCancel?: () => void;
  usageLoading?: boolean;
  usageError?: string | null;
  onUsageRefresh?: (range: UsageStatisticsSnapshot["range"], requestRowsPage?: number, status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  onUsageRequestPageChange?: (page: number, range: UsageStatisticsSnapshot["range"], status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  workspaces?: WorkspaceEntry[];
}) {
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const { settings, settingsV4, settingsError, refresh, update, updateNamespace, replaceSettings, saveProviderKey, clearProviderKey } =
    useSettings(onSettingsChange);
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
              onUpdate={update}
              onConnectProvider={setKeyModalProvider}
              onClearProvider={clearProviderKey}
              onSaveProviderKey={saveProviderKey}
              onNavigate={navigate}
              onArchivedSessionsChange={onArchivedSessionsChange}
              onRefresh={refresh}
              settingsV4={settingsV4}
              onUpdateNamespace={updateNamespace}
              onReplaceSettings={replaceSettings}
              usageSnapshot={usageSnapshot}
              usageActivitySnapshot={usageActivitySnapshot}
              usageProgress={usageProgress}
              onUsageCancel={onUsageCancel}
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
          onSave={(apiKey) => saveProviderKey(keyModalProvider, apiKey)}
        />
      ) : null}
    </div>
    </SettingsSaveNoticeProvider>
  );
}

function SettingsContent({ section, ...rest }: SectionProps & { section: SettingsSectionId }) {
  switch (section) {
    case "hosts": return <HostConnectionsSettings />;
    case "general":
      return (
        <PageShell title="通用" description="ActSpace 与 Agent 的默认行为。">
          <PerformanceSection {...rest} />
          <ConversationDisplaySection {...rest} />
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
        // 「模型」的页头由 ProviderSettings 自己画：二级路由要把返回箭头放进标题行。
        <PageShell>
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
      return <PageShell title="外观" description="主题、强调色、字体与字号。"><AppearanceSection /></PageShell>;
    case "archivedChats":
      return <PageShell title="归档会话"><ArchivedChatsSection onArchivedSessionsChange={rest.onArchivedSessionsChange} /></PageShell>;
    case "subagents":
      return <PageShell title="子 Agent" description="主 Agent 可以委派任务的专门代理。"><SubagentSection settings={rest.settings} onRefresh={rest.onRefresh} /></PageShell>;
    case "usage":
      return (
        <UsageStatisticsPage
          snapshot={rest.usageSnapshot ?? null}
          activitySnapshot={rest.usageActivitySnapshot ?? null}
          progress={rest.usageProgress}
          onCancel={rest.onUsageCancel}
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
