export * from "./agent";
export * from "./context";
export * from "./env";
export * from "./llm";
export * from "./observability";
export * from "./persistence";
export * from "./prompt";
export * from "./tools";
export * from "./types";

export * from "./messages";
export * from "./internal-tools";
export * from "./adapters";
export * from "./fixtures";

import type { BootstrapState } from "@actspace/shared";

export function createBootstrapState(input: BootstrapState): BootstrapState {
  return input;
}
