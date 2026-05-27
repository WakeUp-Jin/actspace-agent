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
  buildHistorySummary,
  buildObservationSummary,
  type AssembleSystemPromptInput,
  type BuildObservationSummaryInput,
  type BuildHistorySummaryInput,
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
export { WatchDiffEngine, type WatchDiffEntry } from "./context/watch-diff";
export { SessionsDigestBuilder, type SessionsDigestResult, type SessionDigestItem } from "./context/sessions-digest";
export { scanWatchPath } from "./context/watch-scanner";
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
export { sleepDefinition, sleepExecutor, registerKairosTools } from "./tools";
export { aggregateKairosEvents, type KairosEventRow } from "./aggregator";
export { resolveKairosEnv, type KairosEnvConfig } from "./env";
