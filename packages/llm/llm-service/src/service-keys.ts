import { ACTSPACE_SERVICE_DEFINITIONS, bindServiceType, serviceKey } from "@actspace/cordis-adapter";
import type { LlmRouteRegistration } from "./adapter.js";
import type { CredentialResolver } from "./credential-port.js";
import type { LlmServiceContract } from "./service.js";

// 这个文件只放服务定义，对实现只做类型引用：单独打包的工具插件引这里的定义时，不会把 LlmService 一起带进产物。

export const LLM_HOST_PORT_ID = "actspace.host.llm" as const;
export type LlmHostPort = {
  readonly credentials: CredentialResolver;
  readonly routes: readonly LlmRouteRegistration[];
};
export const LLM_HOST_PORT = serviceKey<LlmHostPort>(LLM_HOST_PORT_ID);

export const LLM_SERVICE = bindServiceType<LlmServiceContract>(ACTSPACE_SERVICE_DEFINITIONS.llmRuntime);
