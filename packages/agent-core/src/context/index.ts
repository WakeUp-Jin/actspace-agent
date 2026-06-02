/**
 * Context 模块统一导出
 *
 * 新架构：ContextManager + modules/ 编排模式
 */

// 类型
export { CACHE_STABILITY, SystemPart } from "./types";
export type {
  ContextParts,
  ContextModule,
  PromptSegment,
  CompressionConfig,
} from "./types";

// 核心组件
export { ContextManager } from "./manager";
export type {
  ContextManagerOptions,
  ContextManagerForSessionOptions,
} from "./manager";

// Token 估算
export {
  estimateTokens,
  estimateMessagesTokens,
  createEmptyBuckets,
  createContextUsageSnapshot,
} from "./token-estimator";
export type { SnapshotInput } from "./token-estimator";

// 模块
export { SystemPromptContext } from "./modules/system-prompt";
export { ConversationContext } from "./modules/conversation";
