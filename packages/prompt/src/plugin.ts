import type { ContextRequest } from "@actspace/context";
import type { PromptExtensionRegistry } from "./extensions.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { createCoreContributors } from "./core-contributors.js";
import { emptyRuntimePromptSource, type RuntimePromptSource } from "./host-context.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export const PROMPT_HOST_PORT_ID = "actspace.host.prompt" as const;

export type PromptHostPort = {
  readonly extensions?: PromptExtensionRegistry;
  readonly selectSystem?: (request: ContextRequest) => string | undefined;
  readonly workspaceRoot: string;
  readonly resolveSource?: (workspaceRoot: string) => RuntimePromptSource | Promise<RuntimePromptSource>;
  readonly resolveUserSource?: () => RuntimePromptSource | Promise<RuntimePromptSource>;
};

export type PromptRuntimeService = {
  readonly selectSystem?: (request: ContextRequest) => string | undefined;
  readonly resolveForTurn: (workspaceRoot: string, turnId: string, chat: boolean) => Promise<RuntimePromptSource>;
  readonly source: RuntimePromptSource;
  readonly resolveSource: (workspaceRoot: string) => Promise<RuntimePromptSource>;
  readonly createCoreContributors: typeof createCoreContributors;
};

/** Cordis owner for prompt source cache and core contributor factory. */
export class SystemPromptService extends Service implements PromptRuntimeService {
  static inject = Object.freeze([PROMPT_HOST_PORT_ID]);
  readonly selectSystem?: (request: ContextRequest) => string | undefined;
  readonly resolveForTurn: (workspaceRoot: string, turnId: string, chat: boolean) => Promise<RuntimePromptSource>;
  readonly source: RuntimePromptSource;
  readonly resolveSource: (workspaceRoot: string) => Promise<RuntimePromptSource>;
  readonly createCoreContributors = createCoreContributors;
  private readonly cache = new Map<string, Promise<RuntimePromptSource>>();

  constructor(ctx: CordisServiceContext, source: RuntimePromptSource, host: PromptHostPort) {
    super(ctx, "prompt.runtime");
    this.source = source;
    this.selectSystem = host.selectSystem;
    this.resolveSource = async workspaceRoot => await host.resolveSource?.(workspaceRoot) ?? emptyRuntimePromptSource();
    this.resolveForTurn = (workspaceRoot, turnId, chat) => {
      const key = `${workspaceRoot}\0${turnId}\0${chat}`;
      let pending = this.cache.get(key);
      if (!pending) {
        pending = Promise.resolve(chat ? host.resolveUserSource?.() ?? emptyRuntimePromptSource() : this.resolveSource(workspaceRoot)).then(source => {
          if (source.warnings.length) throw new Error(`Context rules source failed: ${source.warnings.join("; ")}`);
          return source;
        });
        this.cache.set(key, pending);
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
      }
      return pending;
    };
    ctx.effect(() => () => this.cache.clear(), "prompt.runtime.cache");
  }
}

export async function apply(ctx: CordisContext): Promise<void> {
  const host = ctx.get?.(PROMPT_HOST_PORT_ID) as PromptHostPort | undefined;
  if (host === undefined) throw new Error(`Prompt plugin requires ${PROMPT_HOST_PORT_ID}.`);
  const source = await host.resolveUserSource?.() ?? emptyRuntimePromptSource();
  new SystemPromptService(ctx as never, source, host);
}
