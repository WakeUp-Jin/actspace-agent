import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";

export type BrowserCapability = {
  readonly ready: boolean;
  readonly command: (name: string, args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
};
