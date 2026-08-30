export type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  PluginActivation,
  PluginActivationContext,
  PluginBehavior,
  PluginCodec,
} from "./plugin-contract.js";
export { ACTSPACE_RUNTIME_CONTRACT, asEntryId, asPluginId } from "./plugin-contract.js";
export * from "./identity.js";
export * from "./manifest.js";
export * from "./behavior-loader.js";
export * from "./codec-discovery.js";
export * from "./cordis-types.js";
export * from "./event-contract.js";
export * from "./dispatch.js";
export * from "./cordis-admission.js";
export * from "./cordis-root.js";
export * from "./source-loader.js";
export * from "./service-contract.js";

export const CORDIS_PACKAGE_VERSIONS = Object.freeze({
  "@deepseek-ai/cordis": "4.0.1",
  "@deepseek-ai/cordis-plugin-loader": "1.0.2",
  "@deepseek-ai/cordis-plugin-include": "1.0.6",
  "@deepseek-ai/cordis-plugin-group": "1.0.1",
  "@deepseek-ai/cordis-plugin-timer": "1.1.3",
} as const);
