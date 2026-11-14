import type { WaterfallHook } from "@actspace/cordis-adapter";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext } from "./executor.js";

/** `tools/pre-execute` 的 payload：参数已按工具的 schema 物化。 */
export type ToolPreExecutePayload = {
  readonly callId: string;
  readonly name: string;
  readonly args: Readonly<Record<string, RuntimeV2JsonValue>>;
  readonly definitionDigest: string;
};
/** `tools/pre-execute` 的结果。给了 `args` 就换掉参数；新参数重新过 schema 校验，再走权限和审批。 */
export type ToolArgumentsPatch = { readonly args?: Readonly<Record<string, RuntimeV2JsonValue>> };

/** `tools/execute` 的 payload：`execute` 是工具体的执行入口，监听器可以包住它。 */
export type ToolExecutePayload = { readonly context: ToolExecutionContext; readonly execute: () => Promise<ToolBodyResult> };
/** `tools/execute` 的结果。给了 `execute` 就调用它，否则调用原来的入口。 */
export type ToolExecutePatch = { readonly execute?: () => Promise<ToolBodyResult> };

/**
 * 工具运行时的三个干预点。分发时带上 Agent 的 carrier，payload 里没有 `agent`。
 * 监听器用 `onHook(ctx, 名字, 监听器)` 注册，payload 和返回值的类型从这里来。
 * `tools/post-execute` 在工具体结束后修饰输出：`status` 和 `failure` 以工具体的为准，监听器改了也不生效。
 */
export interface ToolHooks {
  /** @mode waterfall */
  "tools/pre-execute": WaterfallHook<ToolPreExecutePayload, ToolArgumentsPatch>;
  /** @mode waterfall */
  "tools/execute": WaterfallHook<ToolExecutePayload, ToolExecutePatch>;
  /** @mode waterfall */
  "tools/post-execute": WaterfallHook<ToolBodyResult, ToolBodyResult>;
}

declare module "@actspace/cordis-adapter" { interface DomainEvents extends ToolHooks {} }
