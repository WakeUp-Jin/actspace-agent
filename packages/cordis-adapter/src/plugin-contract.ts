export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
import { entryId, pluginId, type EntryId, type PluginId } from "./identity.js";
export type { EntryId, EventTypeId, PluginId } from "./identity.js";

export interface PluginActivationContext {
  readonly pluginId: string;
  readonly entryId: string;
  readonly config: JsonObject;
  readonly register: (contributionId: string, value: unknown) => () => Promise<void> | void;
}

export interface PluginActivation {
  readonly dispose: () => Promise<void> | void;
}

export interface PluginBehavior {
  readonly activate: (context: PluginActivationContext) => Promise<PluginActivation> | PluginActivation;
}

export interface PluginCodec {
  readonly eventType: string;
  readonly ownerPluginId: string;
  readonly currentVersion: number;
  readonly criticality: "required" | "optional" | "ignorable";
  readonly decode: (payload: JsonValue) => JsonValue;
}

export const ACTSPACE_RUNTIME_CONTRACT = "actspace.runtime.v2" as const;

export function asPluginId(value: string): PluginId {
  return pluginId(value);
}

export function asEntryId(value: string): EntryId {
  return entryId(value);
}
