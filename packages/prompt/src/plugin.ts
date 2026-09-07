import { RequestAssembler } from "./assembler.js";
import { ContributorRegistry } from "./registry.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { createCoreContributors } from "./core-contributors.js";
import { emptyRuntimePromptSource, type RuntimePromptSource } from "./host-context.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export const PROMPT_HOST_PORT_ID = "actspace.host.prompt" as const;

export type PromptHostPort = {
  readonly workspaceRoot: string;
  readonly resolveSource?: (workspaceRoot: string) => RuntimePromptSource | Promise<RuntimePromptSource>;
};

export type PromptRuntimeService = {
  readonly source: RuntimePromptSource;
  readonly resolveSource: (workspaceRoot: string) => Promise<RuntimePromptSource>;
  readonly createCoreContributors: typeof createCoreContributors;
};

/** Cordis owner for prompt source cache and core contributor factory. */
export class SystemPromptService extends Service implements PromptRuntimeService {
  static inject = Object.freeze([PROMPT_HOST_PORT_ID, "context.assembly"]);
  readonly source: RuntimePromptSource;
  readonly resolveSource: (workspaceRoot: string) => Promise<RuntimePromptSource>;
  readonly createCoreContributors = createCoreContributors;
  private readonly cache = new Map<string, RuntimePromptSource>();

  constructor(ctx: CordisServiceContext, source: RuntimePromptSource, host: PromptHostPort) {
    super(ctx, "prompt.runtime");
    this.source = source;
    this.resolveSource = async (workspaceRoot) => {
      const cached = this.cache.get(workspaceRoot);
      if (cached !== undefined) return cached;
      const resolved = await host.resolveSource?.(workspaceRoot) ?? emptyRuntimePromptSource();
      this.cache.set(workspaceRoot, resolved);
      return resolved;
    };
    ctx.effect(() => () => this.cache.clear(), "prompt.runtime.cache");
  }
}

export async function apply(ctx: CordisContext): Promise<void> {
  const host = ctx.get?.(PROMPT_HOST_PORT_ID) as PromptHostPort | undefined;
  if (host === undefined) throw new Error(`Prompt plugin requires ${PROMPT_HOST_PORT_ID}.`);
  const source = await host.resolveSource?.(host.workspaceRoot) ?? emptyRuntimePromptSource();
  const service = new SystemPromptService(ctx as never, source, host);
  ctx.provide?.("prompt.assembly", Object.freeze({ RequestAssembler, ContributorRegistry, service }));
}

export function activate() {
  return {
    services: { "prompt.assembly": Object.freeze({ RequestAssembler, ContributorRegistry, SystemPromptService }) },
    dispose: () => undefined,
  };
}
