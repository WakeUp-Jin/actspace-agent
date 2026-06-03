export * from "./agent";
export * from "./context";
export * from "./env";
export * from "./llm";
export * from "./observability";
export * from "./persistence";
export * from "./prompt";
export * from "./skills";
export * from "./tools";
export * from "./types";
export * from "./usage";
export * from "./visualize";

export * from "./messages";
export * from "./internal-tools";
export * from "./adapters";
export * from "./fixtures";

// Kairos 自治模式入口。Main 进程一处 import 即可装配。
export * from "./kairos";

import type { BootstrapState } from "@actspace/shared";

export function createBootstrapState(input: BootstrapState): BootstrapState {
  return input;
}
