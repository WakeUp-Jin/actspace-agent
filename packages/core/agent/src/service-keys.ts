import { ACTSPACE_SERVICE_DEFINITIONS, bindServiceType } from "@actspace/cordis-adapter";
import type { AgentRegistryContract } from "./registry.js";

// 这个文件只放服务定义，对实现只做类型引用：单独打包的工具插件引这里的定义时，不会把 AgentRegistry 一起带进产物。

export const AGENT_REGISTRY_SERVICE = bindServiceType<AgentRegistryContract>(
  ACTSPACE_SERVICE_DEFINITIONS.agentRegistry,
);
