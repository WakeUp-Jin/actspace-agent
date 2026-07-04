/**
 * Kairos 域对外公共入口。
 * 主进程通过 `import { createKairos, ... } from "@actspace/agent-core/kairos"` 装配 controller。
 */
export { createKairos, type KairosController, type CreateKairosOptions } from "./controller";
export { KairosRunner, type TickResult, type KairosRunnerOptions } from "./runner";
export {
  MessageQueue,
  QueueProcessor,
  clampSleep,
  sleepBiasAt,
  type QueueMessage,
  type SchedulerLike,
  type WakeReason,
} from "./scheduler";
export { KAIROS_SYSTEM_PROMPT } from "./prompt";
export {
  assembleSystemPrompt,
  assembleTickMessage,
  buildHistorySummary,
  buildObservationDelta,
  derivePhase,
  renderKairosSkillCatalog,
  TICK_MESSAGE_REMINDER,
  type AssembleSystemPromptInput,
  type AssembleTickMessageInput,
  type BuildObservationDeltaInput,
  type BuildHistorySummaryInput,
  type KairosActiveBriefInfo,
  type KairosSkillCatalogEntry,
} from "./prompt-assembler";
export { loadKairosConfig, type KairosConfig } from "./config/loader";
export {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
  parseBlocklist,
  parsePathsConfig,
  parsePreferences,
  type Blocklist,
  type PathsConfig,
  type Preferences,
  type SleepBias,
} from "./config/schema";
export { buildConfigTipsBlock } from "./config/prompt-assembler";
export { ShortMemoryStore } from "./storage/short-memory-store";
export { SessionEventRingBuffer } from "./storage/ring-buffer";
export {
  KairosShortTermMemoryContext,
  sanitizeOrphanToolPairs,
  toLlmMessages,
  type KairosShortTermLoadResult,
} from "./context/short-term";
export { SessionsDigestBuilder, type SessionsDigestResult, type SessionDigestItem } from "./context/sessions-digest";
export { BriefsIndexManager, type BriefsIndex, type BriefIndexEntry } from "./briefs/index-manager";
export { BriefsDispatcher, type TickPayload } from "./briefs/dispatcher";
export {
  parseBriefFile,
  fullBriefMarkdown,
  type BriefDoc,
  type BriefFrontmatter,
  type BriefPriority,
  type BriefStatus,
  type BriefTrigger,
} from "./briefs/parser";
export { compressKairosSegments } from "./compression/compressor";
export {
  KairosCompressionTrigger,
  type KairosCompressionOutcome,
  type KairosCompressionTriggerOptions,
} from "./compression/trigger";
export { sleepDefinition, sleepExecutor, registerKairosTools } from "./tools";
export { aggregateKairosEvents, type KairosEventRow } from "./aggregator";
export { resolveKairosEnv, resolveKairosModelSpec, DEFAULT_KAIROS_MODEL_ID, type KairosEnvConfig } from "./env";
export {
  appendKairosInboxMessage,
  commitKairosInboxReadCursor,
  defaultKairosInboxContent,
  ensureKairosInboxScaffolding,
  getKairosInboxDir,
  getKairosInboxFilePath,
  loadKairosInboxReadCursor,
  loadKairosInboxSummary,
  KAIROS_INBOX_DIR,
  KAIROS_INBOX_MAX_CHARS_PER_FILE,
  KAIROS_INBOX_MAX_COMBINED_CHARS,
  KAIROS_INBOX_MAX_MESSAGES_PER_FILE,
  type AppendKairosInboxMessageInput,
  type KairosInboxFileSummary,
  type KairosInboxPriority,
  type KairosInboxReadCursor,
  type KairosInboxSource,
  type KairosInboxSummary,
  type LoadKairosInboxSummaryInput,
} from "./inbox";
