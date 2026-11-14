import { ACTSPACE_SERVICE_DEFINITIONS, ACTSPACE_SERVICE_IDS, bindServiceType, serviceKey, serviceView } from "@actspace/cordis-adapter";
import { MODELS_HOST_PORT_ID, type ModelsHostPort } from "@actspace/shared";
import type { ShellToolsService } from "@actspace/tool-shell";
import type { AgentFactoryService } from "./harness/agent-factory-plugin.js";
import type { AgentRuntimeHostPort } from "./harness/agent-host-port.js";
import type { AgentRuntimeService } from "./harness/agent-runtime-plugin.js";
import type { RuntimeSessionController } from "./session/session-controller.js";
import type { RuntimeSessionHostPort } from "./session/session-plugin.js";
import type { RuntimeCordisHost } from "./startup/cordis-entry.js";

// Runtime 自己拥有的服务定义。这个文件对实现只做类型引用：默认 Harness 的 agent-factory 入口也引它，
// 值引用会把 Host 一侧的会话控制器、Harness 管理一起打进 Harness 产物。

/** Host 给会话插件的端口：数据目录、Runtime 身份、Profile。 */
export const SESSION_RUNTIME_HOST_PORT = serviceKey<RuntimeSessionHostPort>(ACTSPACE_SERVICE_IDS.hostSession);
export const SESSION_RUNTIME_SERVICE = serviceKey<RuntimeSessionController>(ACTSPACE_SERVICE_IDS.sessionRuntime);

/** Host 给 Agent Runtime 和默认 Harness 的端口。 */
export const AGENT_RUNTIME_HOST_PORT = serviceKey<AgentRuntimeHostPort>(ACTSPACE_SERVICE_IDS.hostAgent);
export const AGENT_RUNTIME_SERVICE = bindServiceType<AgentRuntimeService>(ACTSPACE_SERVICE_DEFINITIONS.agentRuntime);
/** 每个 Harness 里的 Agent 工厂；Host 在租约内取它来创建子 Agent 的 Loop。 */
export const AGENT_FACTORY_SERVICE = serviceKey<AgentFactoryService>(ACTSPACE_SERVICE_IDS.agentFactory);

export const MODELS_HOST_PORT = serviceKey<ModelsHostPort>(MODELS_HOST_PORT_ID);
/** Host 交给 Runtime 入口的那张表：Host 身份和它提供的全部服务。 */
export const RUNTIME_CORDIS_HOST_PORT = serviceKey<RuntimeCordisHost>(ACTSPACE_SERVICE_IDS.host);

/** agent-factory 读的 `tools.shell-tools`。写成视图是因为 Harness 内核不能值引用工具插件的包。 */
export const FACTORY_SHELL_TOOLS_VIEW = serviceView<ShellToolsService>(ACTSPACE_SERVICE_IDS.shellTools);
