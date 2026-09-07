import type { AgentHandle } from "./agent.js";
import type { AgentRegistry } from "./registry.js";
import { AgentRuntimeError } from "./errors.js";

export type AgentPublicationObserver = { readonly id: string; readonly order: number; onPublished(agent: AgentHandle): void | Promise<void>; onDisposed?(agent: AgentHandle): void | Promise<void> };

export async function publishAgent(registry: AgentRegistry, agent: AgentHandle, observers: readonly AgentPublicationObserver[] = []): Promise<() => Promise<void>> {
  const unpublish = registry.publish(agent);
  const notified: AgentPublicationObserver[] = [];
  try {
    for (const observer of [...observers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) { await observer.onPublished(agent); notified.push(observer); }
  } catch (error) {
    unpublish();
    for (const observer of notified.reverse()) await observer.onDisposed?.(agent);
    await agent.dispose();
    throw new AgentRuntimeError("PUBLICATION_FAILED", `Agent ${agent.agentId} publication failed.`, error);
  }
  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;
    unpublish();
    for (const observer of [...notified].reverse()) await observer.onDisposed?.(agent);
    await agent.dispose();
  };
}
