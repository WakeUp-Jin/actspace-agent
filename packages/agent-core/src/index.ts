export * from "./agent";
export * from "./context";
export * from "./llm";
export * from "./persistence";
export * from "./tools";
export * from "./types";

import type { BootstrapState } from "@actspace/shared";

export function createBootstrapState(input: BootstrapState): BootstrapState {
  return input;
}
