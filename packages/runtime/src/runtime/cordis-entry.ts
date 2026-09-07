import type { CordisContext } from "@actspace/cordis-adapter";
import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";

export type RuntimeCordisHost = {
  readonly hostKind?: string;
  readonly descriptor?: RuntimeV2HostDescriptor;
  readonly services?: Readonly<Record<string, unknown>>;
  readonly onReady?: (context: CordisContext) => void | Promise<void>;
};

/**
 * Trusted Cordis entry mounted by the Host boot. It publishes only normalized
 * Host facts and the Runtime root marker; all Session, LLM, Tool, Agent and
 * Headless services are created by sibling Behaviors in the loaded tree.
 */
export async function apply(ctx: CordisContext, config: Record<string, unknown> = {}): Promise<void> {
  const host = ctx.get?.("actspace.host") as RuntimeCordisHost | undefined;
  if (host === undefined) throw new Error("Runtime Cordis entry requires actspace.host.");
  for (const [name, value] of Object.entries(host.services ?? {})) ctx.provide?.(name, value);
  ctx.provide?.("actspace.runtime", Object.freeze({ hostKind: host.hostKind ?? "unknown", config: Object.freeze({ ...config }) }));
  await host.onReady?.(ctx);
}
