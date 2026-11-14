import type { ServiceOf } from "@actspace/cordis-adapter";
import type { LOOP_CHECKPOINT_VIEW } from "@actspace/agent-loop";
import type {
  APPLICATION_AGENT_RUNTIME_VIEW,
  APPLICATION_BROWSER_TOOLS_VIEW,
  APPLICATION_CONTEXT_ENGINE_VIEW,
  APPLICATION_SESSIONS_VIEW,
} from "@actspace/agent-service";
import type { DISCLOSURE_HOST_VIEW } from "@actspace/context-disclosure";
import type { CONTEXT_ENGINE_SERVICE } from "@actspace/context-engine";
import type { TITLE_SESSIONS_VIEW } from "@actspace/desktop-app";
import type { ENGLISH_LEARNING_SESSIONS_VIEW } from "@actspace/english-learning";
import type { HEADLESS_AGENT_RUNTIME_VIEW, HEADLESS_SESSIONS_VIEW } from "@actspace/headless";
import type { PLUGIN_MANAGER_HOST_VIEW } from "@actspace/plugin-manager";
import type { CHECKPOINT_SESSIONS_VIEW, SESSION_CHECKPOINT_SERVICE } from "@actspace/session-checkpoint-policy";
import type { JSONL_STORAGE_HOST_VIEW } from "@actspace/session-persistence-jsonl";
import type { SESSION_STORAGE_SERVICE } from "@actspace/session-storage";
import type {
  TRANSCRIPT_HOST_VIEW,
  TRANSCRIPT_SESSIONS_VIEW,
  TRANSCRIPT_STORAGE_VIEW,
} from "@actspace/session-transcript";
import type { SIDE_CHAT_SESSIONS_VIEW } from "@actspace/side-chat";
import type { BROWSER_TOOLS_SERVICE } from "@actspace/tool-browser";
import type { SHELL_SESSION_HOST_VIEW, SHELL_TOOLS_SERVICE } from "@actspace/tool-shell";
import type { TODO_SESSIONS_VIEW } from "@actspace/tool-todo";
import type {
  AGENT_RUNTIME_HOST_PORT,
  AGENT_RUNTIME_SERVICE,
  FACTORY_SHELL_TOOLS_VIEW,
  SESSION_RUNTIME_HOST_PORT,
  SESSION_RUNTIME_SERVICE,
} from "../service-keys.js";

/**
 * 视图和真实服务的对照表，只做类型检查，运行时没有内容。
 *
 * 视图（`serviceView`）是取用方对别的包的服务写的局部声明，取用方那边看不到真实类型。Runtime 依赖两边，
 * 所以在这里逐个核对：真实服务必须满足视图要的成员。服务改了签名而视图没跟上，下面对应那一行编译不过。
 *
 * 新增一个视图时在这里补一行，写成 `Covers<真实服务, ServiceOf<typeof 视图>>`。`pnpm check:service-access` 按这个写法读每一行：
 * 仓库里的视图在这里没有对照行，或者一行里两边不是同一个 id，检查都会失败。
 */
type Covers<Provider extends View, View> = Provider;

type Sessions = ServiceOf<typeof SESSION_RUNTIME_SERVICE>;
type AgentRuntime = ServiceOf<typeof AGENT_RUNTIME_SERVICE>;
type SessionHost = ServiceOf<typeof SESSION_RUNTIME_HOST_PORT>;
type AgentHost = ServiceOf<typeof AGENT_RUNTIME_HOST_PORT>;

export type ServiceViewConformance = {
  // session.runtime
  readonly checkpointSessions: Covers<Sessions, ServiceOf<typeof CHECKPOINT_SESSIONS_VIEW>>;
  readonly todoSessions: Covers<Sessions, ServiceOf<typeof TODO_SESSIONS_VIEW>>;
  readonly sideChatSessions: Covers<Sessions, ServiceOf<typeof SIDE_CHAT_SESSIONS_VIEW>>;
  readonly transcriptSessions: Covers<Sessions, ServiceOf<typeof TRANSCRIPT_SESSIONS_VIEW>>;
  readonly englishLearningSessions: Covers<Sessions, ServiceOf<typeof ENGLISH_LEARNING_SESSIONS_VIEW>>;
  readonly applicationSessions: Covers<Sessions, ServiceOf<typeof APPLICATION_SESSIONS_VIEW>>;
  readonly headlessSessions: Covers<Sessions, ServiceOf<typeof HEADLESS_SESSIONS_VIEW>>;
  readonly titleSessions: Covers<Sessions, ServiceOf<typeof TITLE_SESSIONS_VIEW>>;
  // agent.runtime
  readonly applicationAgentRuntime: Covers<AgentRuntime, ServiceOf<typeof APPLICATION_AGENT_RUNTIME_VIEW>>;
  readonly headlessAgentRuntime: Covers<AgentRuntime, ServiceOf<typeof HEADLESS_AGENT_RUNTIME_VIEW>>;
  // actspace.host.session
  readonly jsonlStorageHost: Covers<SessionHost, ServiceOf<typeof JSONL_STORAGE_HOST_VIEW>>;
  readonly shellSessionHost: Covers<SessionHost, ServiceOf<typeof SHELL_SESSION_HOST_VIEW>>;
  readonly transcriptHost: Covers<SessionHost, ServiceOf<typeof TRANSCRIPT_HOST_VIEW>>;
  // actspace.host.agent
  readonly disclosureHost: Covers<AgentHost, ServiceOf<typeof DISCLOSURE_HOST_VIEW>>;
  readonly pluginManagerHost: Covers<AgentHost, ServiceOf<typeof PLUGIN_MANAGER_HOST_VIEW>>;
  // 其它包拥有的服务
  readonly transcriptStorage: Covers<
    ServiceOf<typeof SESSION_STORAGE_SERVICE>,
    ServiceOf<typeof TRANSCRIPT_STORAGE_VIEW>
  >;
  readonly loopCheckpoint: Covers<ServiceOf<typeof SESSION_CHECKPOINT_SERVICE>, ServiceOf<typeof LOOP_CHECKPOINT_VIEW>>;
  readonly applicationBrowserTools: Covers<
    ServiceOf<typeof BROWSER_TOOLS_SERVICE>,
    ServiceOf<typeof APPLICATION_BROWSER_TOOLS_VIEW>
  >;
  readonly applicationContextEngine: Covers<
    ServiceOf<typeof CONTEXT_ENGINE_SERVICE>,
    ServiceOf<typeof APPLICATION_CONTEXT_ENGINE_VIEW>
  >;
  readonly factoryShellTools: Covers<ServiceOf<typeof SHELL_TOOLS_SERVICE>, ServiceOf<typeof FACTORY_SHELL_TOOLS_VIEW>>;
};
