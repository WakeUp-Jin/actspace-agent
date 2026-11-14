import type { ServiceKey, ServiceOf } from "@actspace/cordis-adapter";
import { HOST_APPLICATION_SERVICE } from "@actspace/agent-host";
import { DESKTOP_APP_SERVICE } from "@actspace/desktop-app";
import { ENGLISH_LEARNING_SERVICE } from "@actspace/english-learning";
import { HARNESS_CONTROL_SERVICE } from "@actspace/harness-control";
import { HEADLESS_RUNNER_SERVICE } from "@actspace/headless";
import { AGENT_RUNTIME_SERVICE, SESSION_RUNTIME_SERVICE } from "../service-keys.js";

/**
 * Host 进程（CLI、桌面端主进程）从启动好的 Profile 里按 id 取的服务，和每个 id 取出来的类型。
 *
 * 这两个进程只能动态加载 Runtime，拿不到服务定义这个值，所以包的入口只导出这个类型：它们按 id 取，
 * 类型从这里查。每一行的类型都从服务定义推出来，定义改了这里跟着变。
 *
 * 每一行都写成 `ServiceOf<typeof 定义>`，不要改成从下面那张表整体推导：整体推导时，声明文件里会出现
 * 以仓库根目录为起点的路径（`import("packages/…")`），apps 那边解析不到，类型会悄悄变成 `any`。
 * 两个 app 的 `profile-service.ts` 里各有一行检查，类型丢了时那边编译不过。
 */
export type ProfileServices = {
  readonly "session.runtime": ServiceOf<typeof SESSION_RUNTIME_SERVICE>;
  readonly "agent.runtime": ServiceOf<typeof AGENT_RUNTIME_SERVICE>;
  readonly "headless.runner": ServiceOf<typeof HEADLESS_RUNNER_SERVICE>;
  readonly "harness.control": ServiceOf<typeof HARNESS_CONTROL_SERVICE>;
  readonly "host.application": ServiceOf<typeof HOST_APPLICATION_SERVICE>;
  readonly "desktop.app": ServiceOf<typeof DESKTOP_APP_SERVICE>;
  readonly "english-learning": ServiceOf<typeof ENGLISH_LEARNING_SERVICE>;
};

/**
 * 上面每个 id 对应的服务定义。类型对不上时这里编译不过；
 * 左边的 id 是否等于右边定义自己的 id，由 `profile-services.test.ts` 核对。
 */
export const PROFILE_SERVICE_KEYS: { readonly [K in keyof ProfileServices]: ServiceKey<ProfileServices[K]> } =
  Object.freeze({
    "session.runtime": SESSION_RUNTIME_SERVICE,
    "agent.runtime": AGENT_RUNTIME_SERVICE,
    "headless.runner": HEADLESS_RUNNER_SERVICE,
    "harness.control": HARNESS_CONTROL_SERVICE,
    "host.application": HOST_APPLICATION_SERVICE,
    "desktop.app": DESKTOP_APP_SERVICE,
    "english-learning": ENGLISH_LEARNING_SERVICE,
  });
