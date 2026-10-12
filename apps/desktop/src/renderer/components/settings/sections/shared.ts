import type { AppSettings, SecretProviderId, SetProviderKeyResult, SettingsV4NamespacePatch, SettingsV4Snapshot, SettingsUpdateInput, UsageStatisticsSnapshot, UsageActivitySnapshot, WorkspaceEntry } from "@actspace/shared";
import type { SettingsSectionId } from "../SettingsNav";

export type SectionProps = {
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
  usageProgress?: import("@actspace/shared").UsageQueryProgress | null;
  onUsageCancel?: () => void;
  usageLoading?: boolean;
  usageError?: string | null;
  onUsageRefresh?: (range: UsageStatisticsSnapshot["range"], requestRowsPage?: number, status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  onUsageRequestPageChange?: (page: number, range: UsageStatisticsSnapshot["range"], status?: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"], search?: string, kind?: import("@actspace/shared").UsageActivityKind) => void;
  workspaces?: WorkspaceEntry[];
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
};

export const SETTINGS_TEXTAREA_CLASS =
  "min-h-[76px] w-full resize-y rounded-act-sm border border-line bg-surface px-2.5 py-2 text-act-sm leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-subtle hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15 disabled:cursor-not-allowed disabled:opacity-55";
