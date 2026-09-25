import type { RuntimeV2JsonValue } from "./host-dto";
import type { AgentSystemPromptFile, AppSettingsV2, CustomConnectionInput, ProviderConnectionErrorKind, ProviderConnectionSettings, ProviderProxySettings, SearchUsageResult, SecretProviderId, SettingsV2UpdateInput, SettingsV4Snapshot } from "../settings";
import type { ModelKey } from "../model-config";
import type { ModelsCatalogListResult, ProviderBalanceSnapshot } from "../ipc";
import type { ProviderId as LlmProviderId } from "../provider-config";
import type { RuntimeV2DiagnosticsSnapshot, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "./projection";
import type {
  RuntimeV2BootManifest,
  RuntimeV2RunTurnRequest,
  RuntimeV2RunTurnResponse,
  RuntimeV2RuntimeState,
  RuntimeV2SessionListItem,
} from "./runtime";

export const RUNTIME_V2_DESKTOP_CHANNELS = Object.freeze({
  status: "runtime-v2:get-status",
  snapshot: "runtime-v2:get-snapshot",
  listSessions: "runtime-v2:list-sessions",
  inspectSession: "runtime-v2:inspect-session",
  exportSession: "runtime-v2:export-session",
  createSession: "runtime-v2:create-session",
  resumeSession: "runtime-v2:resume-session",
  forkSession: "runtime-v2:fork-session",
  runTurn: "runtime-v2:run-turn",
  enqueueMessage: "runtime-v2:enqueue-message",
  cancelMessage: "runtime-v2:cancel-message",
  abortRun: "runtime-v2:abort-run",
  flushSession: "runtime-v2:flush-session",
  requestRestart: "runtime-v2:request-restart",
  updateSessionMetadata: "runtime-v2:update-session-metadata",
  readArtifact: "runtime-v2:read-artifact",
  replayLiveEvents: "runtime-v2:replay-live-events",
  getSettings: "runtime-v2:get-settings",
  updateSettings: "runtime-v2:update-settings",
  configureProvider: "runtime-v2:configure-provider",
  configureSecret: "runtime-v2:configure-secret",
  addProviderCredential: "runtime-v2:add-provider-credential",
  updateProviderCredential: "runtime-v2:update-provider-credential",
  removeProviderCredential: "runtime-v2:remove-provider-credential",
  updateModel: "runtime-v2:update-model",
  removeModel: "runtime-v2:remove-model",
  testProvider: "runtime-v2:test-provider",
  testCustomConnection: "runtime-v2:test-custom-connection",
  getProviderBalance: "runtime-v2:get-provider-balance",
  getSearchUsage: "runtime-v2:get-search-usage",
  readAgentSystemPrompt: "runtime-v2:read-agent-system-prompt",
  writeAgentSystemPrompt: "runtime-v2:write-agent-system-prompt",
  listModelCatalog: "runtime-v2:list-model-catalog",
  reloadModelCatalog: "runtime-v2:reload-model-catalog",
  addCatalogModel: "runtime-v2:add-catalog-model",
  addCustomModel: "runtime-v2:add-custom-model",
  editCustomModel: "runtime-v2:edit-custom-model",
  setCustomConnectionDefaultModel: "runtime-v2:set-custom-connection-default-model",
  pickAttachment: "runtime-v2:pick-attachment",
  listApprovals: "runtime-v2:list-approvals",
  decideApproval: "runtime-v2:decide-approval",
  approvalRequired: "runtime-v2:approval-required",
  liveEvent: "runtime-v2:live-event",
} as const);

export type RuntimeV2DesktopStatus = {
  readonly ready: boolean;
  readonly runtimeInstanceId: string | null;
  readonly error: string | null;
};

export type RuntimeV2DesktopSnapshot = {
  readonly kind: "desktop-runtime-snapshot";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly cursor: number;
  readonly runtime: RuntimeV2RuntimeState;
  readonly manifest: RuntimeV2BootManifest;
  readonly diagnostics: RuntimeV2DiagnosticsSnapshot;
  readonly sessions: readonly RuntimeV2SessionListItem[];
  readonly selectedSession: RuntimeV2SessionSnapshot | null;
  readonly workspaceRoot: string;
};

export type RuntimeV2InspectSessionInput = { readonly sessionId: string };
export type RuntimeV2CreateSessionInput = { readonly sessionId?: string; readonly workspaceRoot?: string };
export type RuntimeV2ForkSessionInput = { readonly parentSessionId: string; readonly boundarySeq: number; readonly newSessionId: string };
export type RuntimeV2ExportSessionResult = { readonly sessionId: string; readonly jsonl: string };
export type RuntimeV2EnqueueMessageInput = { readonly sessionId: string; readonly content: RuntimeV2JsonValue; readonly target: "next-step" | "next-turn"; readonly messageId?: string };
export type RuntimeV2CancelMessageInput = { readonly sessionId: string; readonly messageId: string };
export type RuntimeV2AbortRunInput = { readonly sessionId: string; readonly reason?: string };
export type RuntimeV2RequestRestartInput = { readonly reason: string; readonly source: string; readonly candidateDigest?: string };
export type RuntimeV2UpdateSessionMetadataInput = { readonly sessionId: string; readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean };
export type RuntimeV2ReadArtifactInput = { readonly sessionId: string; readonly artifactId: string };
export type RuntimeV2ReadArtifactResult = { readonly artifactId: string; readonly mimeType: string; readonly bytesBase64: string };
export type RuntimeV2SettingsUpdateInput = SettingsV2UpdateInput;
export type RuntimeV2ConfigureProviderInput = {
  readonly provider: LlmProviderId;
  readonly apiKey?: string | null;
  readonly managementKey?: string | null;
  readonly enabled?: boolean;
  readonly baseUrl?: string | null;
  readonly proxy?: ProviderProxySettings;
  readonly defaultPricingMultiplier?: number;
};
export type RuntimeV2CreateCustomConnectionInput = CustomConnectionInput;
export type RuntimeV2RemoveCustomConnectionInput = { readonly connectionId: string };
export type RuntimeV2UpdateCustomConnectionInput = CustomConnectionInput & { readonly connectionId: string; readonly apiKey?: string };
export type RuntimeV2CustomConnectionTestInput = import("../settings").CustomConnectionTestInput;
export type RuntimeV2CustomConnectionTestResult = import("../settings").CustomConnectionTestResult;
export type RuntimeV2ConfigureSecretInput = {
  readonly provider: SecretProviderId;
  readonly apiKey: string | null;
};
export type RuntimeV2ProviderCredentialAddInput = {
  readonly provider: LlmProviderId;
  readonly label: string;
  readonly apiKey: string;
  readonly pricingMultiplier?: number;
};
export type RuntimeV2ProviderCredentialUpdateInput = {
  readonly provider: LlmProviderId;
  readonly credentialId: string;
  readonly label: string;
  readonly pricingMultiplier?: number;
};
export type RuntimeV2ProviderCredentialRemoveInput = {
  readonly provider: LlmProviderId;
  readonly credentialId: string;
};
export type RuntimeV2ModelUpdateInput = {
  readonly modelKey: ModelKey;
  readonly enabled?: boolean;
  readonly customLabel?: string | null;
  readonly credentialId?: string | null;
  readonly connectionId?: string | null;
};
export type RuntimeV2ModelRemoveInput = { readonly modelKey: ModelKey };
export type RuntimeV2ProviderIdInput = { readonly provider: LlmProviderId };
export type RuntimeV2ProviderTestResult = {
  readonly ok: boolean;
  readonly message: string;
  readonly checkedAt: string;
  readonly errorKind?: ProviderConnectionErrorKind;
  readonly statusCode?: number;
  readonly settings: AppSettingsV2;
};
export type RuntimeV2WriteAgentSystemPromptInput = { readonly content: string };
export type RuntimeV2ModelCatalogQuery = { readonly provider?: "openrouter" | "deepseek" | "kimi"; readonly query?: string };
export type RuntimeV2AddCatalogModelInput = { readonly provider?: "openrouter" | "deepseek" | "kimi"; readonly apiModel: string };
export type RuntimeV2AddCustomModelInput = import("../custom-model-input").CustomModelCreateInput;
export type RuntimeV2EditCustomModelInput = import("../custom-model-input").CustomModelEditInput;
export type RuntimeV2SetCustomConnectionDefaultModelInput = import("../custom-model-input").CustomModelSetDefaultInput;
export type RuntimeV2AttachmentRef = {
  readonly artifactId: string;
  readonly mimeType: string;
  readonly name: string;
  readonly sizeBytes: number;
};
export type RuntimeV2ApprovalRequest = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly resources: readonly import("./permission").ApprovalResourceSummary[];
  readonly grantSuggestions: readonly import("./permission").GrantSuggestion[];
  readonly supportedLifetimes: readonly import("./permission").GrantLifetime[];
  readonly risk: "low" | "medium" | "high";
  readonly createdAt: number;
  readonly expiresAt?: number;
};
export type RuntimeV2ApprovalDecisionInput =
  | { readonly requestId: string; readonly decision: "once" | "deny" }
  | { readonly requestId: string; readonly decision: "session"; readonly suggestionId: string };
export type RuntimeV2ApprovalDecisionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type RuntimeV2DesktopLiveEnvelope = {
  readonly event: RuntimeV2LiveEvent;
  readonly emittedAt: string;
};
export type RuntimeV2LiveReplay = {
  readonly runtimeInstanceId: string;
  readonly afterCursor: number;
  readonly currentCursor: number;
  readonly gap: boolean;
  readonly events: readonly RuntimeV2DesktopLiveEnvelope[];
};

export type RuntimeV2DesktopBridge = {
  getStatus(): Promise<RuntimeV2DesktopStatus>;
  getSnapshot(sessionId?: string): Promise<RuntimeV2DesktopSnapshot>;
  listSessions(): Promise<readonly RuntimeV2SessionListItem[]>;
  inspectSession(input: RuntimeV2InspectSessionInput): Promise<RuntimeV2SessionSnapshot>;
  exportSession(input: RuntimeV2InspectSessionInput): Promise<RuntimeV2ExportSessionResult>;
  createSession(input?: RuntimeV2CreateSessionInput): Promise<RuntimeV2SessionSnapshot>;
  resumeSession(input: RuntimeV2InspectSessionInput): Promise<RuntimeV2SessionSnapshot>;
  forkSession(input: RuntimeV2ForkSessionInput): Promise<RuntimeV2SessionSnapshot>;
  runTurn(input: RuntimeV2RunTurnRequest): Promise<RuntimeV2RunTurnResponse>;
  enqueueMessage(input: RuntimeV2EnqueueMessageInput): Promise<{ readonly messageId: string; readonly target: "next-step" | "next-turn"; readonly enqueuedSeq: number }>;
  cancelMessage(input: RuntimeV2CancelMessageInput): Promise<boolean>;
  abortRun(input: RuntimeV2AbortRunInput): Promise<boolean>;
  flushSession(input: RuntimeV2InspectSessionInput): Promise<void>;
  requestRestart(input: RuntimeV2RequestRestartInput): Promise<RuntimeV2RuntimeState>;
  updateSessionMetadata(input: RuntimeV2UpdateSessionMetadataInput): Promise<RuntimeV2SessionSnapshot>;
  readArtifact(input: RuntimeV2ReadArtifactInput): Promise<RuntimeV2ReadArtifactResult>;
  replayLiveEvents(afterCursor: number): Promise<RuntimeV2LiveReplay>;
  getSettings(): Promise<AppSettingsV2>;
  updateSettings(input: RuntimeV2SettingsUpdateInput): Promise<AppSettingsV2>;
  createCustomConnection(input: RuntimeV2CreateCustomConnectionInput): Promise<SettingsV4Snapshot>;
  removeCustomConnection(input: RuntimeV2RemoveCustomConnectionInput): Promise<SettingsV4Snapshot>;
  updateCustomConnection(input: RuntimeV2UpdateCustomConnectionInput): Promise<SettingsV4Snapshot>;
  testCustomConnection(input: RuntimeV2CustomConnectionTestInput): Promise<RuntimeV2CustomConnectionTestResult>;
  configureProvider(input: RuntimeV2ConfigureProviderInput): Promise<AppSettingsV2>;
  configureSecret(input: RuntimeV2ConfigureSecretInput): Promise<AppSettingsV2>;
  addProviderCredential(input: RuntimeV2ProviderCredentialAddInput): Promise<AppSettingsV2>;
  updateProviderCredential(input: RuntimeV2ProviderCredentialUpdateInput): Promise<AppSettingsV2>;
  removeProviderCredential(input: RuntimeV2ProviderCredentialRemoveInput): Promise<AppSettingsV2>;
  updateModel(input: RuntimeV2ModelUpdateInput): Promise<AppSettingsV2>;
  removeModel(input: RuntimeV2ModelRemoveInput): Promise<AppSettingsV2>;
  testProvider(input: RuntimeV2ProviderIdInput): Promise<RuntimeV2ProviderTestResult>;
  getProviderBalance(input: RuntimeV2ProviderIdInput): Promise<ProviderBalanceSnapshot>;
  getSearchUsage(): Promise<SearchUsageResult>;
  readAgentSystemPrompt(): Promise<AgentSystemPromptFile>;
  writeAgentSystemPrompt(input: RuntimeV2WriteAgentSystemPromptInput): Promise<AgentSystemPromptFile>;
  listModelCatalog(input?: RuntimeV2ModelCatalogQuery): Promise<ModelsCatalogListResult>;
  reloadModelCatalog(input?: RuntimeV2ModelCatalogQuery): Promise<ModelsCatalogListResult>;
  addCatalogModel(input: RuntimeV2AddCatalogModelInput): Promise<AppSettingsV2>;
  addCustomModel(input: RuntimeV2AddCustomModelInput): Promise<AppSettingsV2>;
  editCustomModel(input: RuntimeV2EditCustomModelInput): Promise<AppSettingsV2>;
  setCustomConnectionDefaultModel(input: RuntimeV2SetCustomConnectionDefaultModelInput): Promise<AppSettingsV2>;
  pickAttachment(sessionId: string): Promise<RuntimeV2AttachmentRef | null>;
  listApprovals(sessionId?: string): Promise<readonly RuntimeV2ApprovalRequest[]>;
  decideApproval(input: RuntimeV2ApprovalDecisionInput): Promise<RuntimeV2ApprovalDecisionResult>;
  onApprovalRequired(listener: (request: RuntimeV2ApprovalRequest) => void): () => void;
  onLiveEvent(listener: (event: RuntimeV2DesktopLiveEnvelope) => void): () => void;
};
