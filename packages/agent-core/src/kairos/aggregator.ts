/**
 * Re-export `@actspace/shared` 的 Kairos 事件聚合工具，
 * 让 agent-core 内部直接 `from "../kairos/aggregator"` 即可使用，
 * 不必每个内部模块都去 import shared 包。
 */
export {
  aggregateKairosEvents,
  type KairosEventRow,
  type KairosRowKind,
  type KairosRowStatus,
} from "@actspace/shared";
