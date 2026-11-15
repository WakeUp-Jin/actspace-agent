import { getService, type CordisContext } from "@actspace/cordis-adapter";
import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { RUNTIME_CORDIS_HOST_PORT } from "../service-keys.js";

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
  const host = getService(ctx, RUNTIME_CORDIS_HOST_PORT);
  if (host === undefined) throw new Error("Runtime Cordis entry requires actspace.host.");
  // Host 端口表按 id 逐项发布：表里每一项的类型由 Host 一侧构造它的地方负责，取用方再按各自的服务定义读。
  for (const [name, value] of Object.entries(host.services ?? {})) ctx.provide?.(name, value);
  ctx.provide?.("actspace.runtime", Object.freeze({ hostKind: host.hostKind ?? "unknown", config: Object.freeze({ ...config }) }));
  await host.onReady?.(ctx);
}
