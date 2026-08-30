import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import type { ToolCapabilitySet, ToolPreparedEnvironment } from "@actspace/tools-runtime";

/** Stable Context service name used by trusted Runtime plugins to read Host facts. */
export const RUNTIME_HOST_SERVICES_ID = "actspace.host.services" as const;

/** Stable Context service names consumed by the Host-facing Runtime facade. */
export const RUNTIME_CONTEXT_SERVICE_IDS = Object.freeze({
  sessions: "actspace.runtime.sessions",
  runs: "actspace.runtime.runs",
  compaction: "actspace.runtime.compaction",
  llm: "actspace.runtime.llm",
} as const);

/**
 * Host-owned capabilities that may cross the Bootstrap → Cordis Context
 * boundary. Domain services (Session, LLM, Tools and AgentLoop) deliberately
 * do not belong in this object; later phases publish those from plugin
 * Behaviors instead.
 */
export type RuntimeHostServices = {
  readonly descriptor: RuntimeV2HostDescriptor;
  readonly dataRoot: string;
  readonly workspaceRoot: string;
  readonly capabilityCeiling: ReadonlySet<string>;
  readonly capabilitySet: ToolCapabilitySet;
  readonly services: Readonly<Record<string, unknown>>;
};

export type RuntimeHostServicesInput = {
  readonly descriptor: RuntimeV2HostDescriptor;
  readonly dataRoot: string;
  readonly workspaceRoot: string;
  readonly toolEnvironment: Pick<ToolPreparedEnvironment, "hostCapabilities" | "capabilitySet">;
  readonly services?: Readonly<Record<string, unknown>>;
};

/**
 * Normalize the CLI/Desktop Host inputs once, before a Cordis config tree is
 * mounted. The capability Set is copied so a Host cannot mutate the runtime's
 * admission facts after Loader settlement begins.
 */
export function createRuntimeHostServices(input: RuntimeHostServicesInput): RuntimeHostServices {
  const capabilityCeiling = freezeSet(input.toolEnvironment.hostCapabilities);
  return Object.freeze({
    descriptor: input.descriptor,
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    capabilityCeiling,
    capabilitySet: input.toolEnvironment.capabilitySet,
    services: Object.freeze({ ...(input.services ?? {}) }),
  });
}

function freezeSet(values: Iterable<string>): ReadonlySet<string> {
  const source = new Set(values);
  let view: ReadonlySet<string>;
  view = Object.freeze({
    get size() { return source.size; },
    has: (value: string) => source.has(value),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: unknown) => source.forEach((value) => callback.call(thisArg, value, value, view)),
    [Symbol.iterator]: () => source[Symbol.iterator](),
  } as ReadonlySet<string>);
  return view;
}
