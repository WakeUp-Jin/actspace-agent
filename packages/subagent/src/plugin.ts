import { OneShotSubagentProvider } from "./provider.js";
import { createBuiltInPresets } from "./preset.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("subagent.one-shot", Object.freeze({ OneShotSubagentProvider, createBuiltInPresets }));
}

export function activate() {
  return { services: { "subagent.one-shot": Object.freeze({ OneShotSubagentProvider, createBuiltInPresets }) }, dispose: () => undefined };
}
