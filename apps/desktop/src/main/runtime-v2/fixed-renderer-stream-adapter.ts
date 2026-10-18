import type { AgentLoopLiveEvent } from "@actspace/runtime";
import type { AgentLiveEvent } from "@actspace/shared/runtime-v2";

// 实现已迁到 @actspace/client/live，Web 端共用。
export { FixedRendererStreamAdapter } from "@actspace/client/live";

// Host 把 AgentLoopLiveEvent 原样发给 Web；共享的线上类型必须接得住它。
type Wire<T extends AgentLiveEvent> = T;
export type AgentLiveEventContract = Wire<AgentLoopLiveEvent>;
