# 沙箱第一期：地基 + 工具沙箱（macOS / Linux）

## 目标

把沙箱做成一组可替换的 Harness 插件：管理器插件 `sandbox`，加上后端插件 `sandbox-nono`、`sandbox-seatbelt`。第一期一次做完整的地基：执行契约、策略合并、能力模型、执行生命周期、结果状态、继承模式。bash 工具改为通过 `sandbox` 服务执行，macOS / Linux 默认使用随应用打包的 nono（`wrap`）。组合里没有沙箱或沙箱不可用时，bash 调用按“沙箱外执行”走审批，审批卡显示“真实环境”，不再悄悄改为不加沙箱执行。

## 范围

- 包含：
  - `packages/sandbox/manager`（`@actspace/sandbox`）：契约、策略合并、后端注册与选择、执行生命周期、继承模式、Harness 插件、Host 进程端口的 Node 实现。
  - `packages/sandbox/nono`（`@actspace/sandbox-nono`）、`packages/sandbox/seatbelt`（`@actspace/sandbox-seatbelt`）：后端插件。
  - 三个插件加入默认 Harness 组合；Desktop 与 agent-host（CLI / headless）提供 Host 进程端口。
  - shell-tools 可选依赖 `sandbox`，删除 `node-ports.ts` 中的 `sandboxSpawn` / `probeSandbox`。
  - nono 程序：锁定版本、下载与校验脚本、Desktop 打包与签名、路径解析。
  - Desktop 审批请求补上 `executionEnvironment`。
  - 文档同步与 history。
- 不包含（契约里预留，功能留给后续扩展）：
  - `purpose: evaluation` 的模板与评估流程、CLI 的“继承外层沙箱”启动参数（第二期）。
  - `network: allowlist` 与 nono `run` 模式（第二期）。第一期后端对它们报告 `unsupported`。
  - Windows 后端（第三期）。
  - 环境变量白名单：bash 子进程仍继承完整 `process.env`，与现状一致。
  - CLI 独立安装包（`scripts/package-agent-cli.mjs`）携带 nono。
  - 设置页开关与用户自定义策略。

## 背景

- 必读：
  - `AGENTS.md`
  - [沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)：本计划的设计依据，契约字段以它为准
  - [执行安全入口](../../design-docs/execution-safety/README.md)：Tool Runtime 执行顺序与 Bash 当前边界
  - [Tool 插件边界](../../design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)
  - [前缀授权方案](../completed/20261011-approval-card-cursor-style/backend-bash-command-prefix-grant.md)：`no_sandbox` 与授权复用的关系
- 相关代码路径：
  - `packages/tools/shell-tools/src/node-ports.ts`：`createNodeBashToolPorts`（:36）、`wantsSandbox`（:69）、`ProcessHandle`（:96-155）、`signalProcess`（:157）、`sandboxSpawn`（:284）、`probeSandbox`（:303）
  - `packages/tools/shell-tools/src/plugin.ts`：`ToolPorts` / `HostPort`（:16-20）、`permissionContract("bash")`（:59-72）、bash 定义（:83）
  - `packages/tools/shell-tools/src/manifest.ts`：插件清单写法
  - `packages/tools/runtime/src/permission/grants.ts:49`：`covers()` 要求 `noSandbox === false`
  - `packages/cordis-adapter/src/harness-contracts.ts`：`optional` + `fallback` 的可选依赖
  - `packages/cordis-adapter/src/service-contract.ts`：服务 id 登记（参照 todoTools :42、:122、:156）
  - `packages/runtime/src/harness/default-harness-definition.ts:5-34`：默认组合条目与模块解析
  - `packages/runtime/src/profiles/composition.ts:12,68,85`：清单注册
  - `apps/desktop/src/main/runtime-v2/tool-host-services.ts:16`、`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts:43-55,126-136`
  - `packages/agent-host/src/node-ports/tool-host-services.ts:18`、`apps/cli/src/runtime-v2/host-adapter.ts:44`
  - `apps/desktop/src/main/runtime-v2/approval-broker.ts`、`apps/desktop/src/main/runtime-v2/host-ports.ts:19`、`apps/desktop/src/main/index.ts:83`
  - `apps/desktop/src/main/index.ts:183-185`：browser-components 的开发 / 打包路径解析，nono 照此处理
  - `scripts/release-package.sh`、`scripts/package-browser-components.mjs`：打包外部程序与签名的先例
- 已知约束：
  - 仓库中只有 Host 侧 `node-ports.ts` 直接起子进程；Harness 插件通过 Host 注入的端口获得能力。
  - nono 权限清单的 `deny` 在 macOS 上优先于授权；在 Linux（Landlock）上只能靠“不授权”表达。
  - 现有 Seatbelt 规则：允许读全部；禁止读 `~/.ssh` `~/.aws` `~/.gnupg`；只允许写工作区 / 输出目录 / 临时目录；禁止写 `.git/hooks` 与 `.git/config`；网络不限。
  - 用户本机 nono 0.72.0；上游最新 0.80.0（2026-10-13），Apache-2.0，提供四个平台压缩包与 `SHA256SUMS.txt`。

## 已确认的决策

- **D1 沙箱是 Harness 插件，可以替换、可以不要。** 管理器与后端都是 Harness 插件；shell-tools 可选依赖 `sandbox`；Host 只提供进程端口与 nono 路径，不决定用不用沙箱。
- **D2 第一期打完整地基。** 管理器负责完整执行生命周期（准备、运行、终止、清理、结果状态）；功能可以少，但第二、三期不改契约。
- **D3 后端按注册优先级选择：nono > Seatbelt。** 都不合格时返回不可用，不返回不加沙箱的启动方式。
- **D4 沙箱缺失或不可用时转审批。** bash 的有效 `noSandbox` 为 `true`：`default` 模式每次询问、前缀授权不覆盖、审批卡显示“真实环境”；`full-access` 直接允许。
- **D5 只用我们打包的 nono。** 打包路径 → `ACTSPACE_NONO_PATH` → 仓库 `dist/sandbox-components/`；不查 PATH，系统里装的也不用。
- **D6 继承模式只能由显式配置打开。** 管理器插件配置 `{ "mode": "inherited" }`，不读环境变量。第一期实现并测试管理器行为，第二期由 CLI 启动参数写入配置。

## 契约（以 `packages/sandbox/manager/src/types.ts` 为准）

```ts
// —— Host 进程端口（Host 实现，插件使用）——
export const SANDBOX_HOST_PORT_ID = "actspace.host.sandbox";
export type HostProcessSpec = { readonly command: string; readonly args: readonly string[]; readonly cwd: string; readonly env: NodeJS.ProcessEnv };
export interface HostProcess {
  readonly pid: number | undefined;
  onOutput(listener: (chunk: { readonly stream: "stdout" | "stderr"; readonly text: string }) => void): void;
  readonly exited: Promise<{ readonly exitCode: number | null; readonly signal: NodeJS.Signals | null; readonly startError?: string }>;
  signalGroup(signal: "SIGTERM" | "SIGKILL"): void;   // 向整个进程组发信号
}
export interface SandboxHostPort {
  readonly platform: NodeJS.Platform;
  readonly resources: { readonly nonoPath?: string };
  spawn(spec: HostProcessSpec): HostProcess;          // 新进程组；Windows 上退化为单进程
  run(spec: HostProcessSpec & { readonly timeoutMs: number }): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }>; // 供后端探测
}

// —— 执行请求 ——
export type SandboxNetwork = { readonly mode: "unrestricted" } | { readonly mode: "blocked" } | { readonly mode: "allowlist"; readonly domains: readonly string[] };
export type SandboxCapability = "filesystem.write" | "filesystem.read-deny" | "filesystem.write-deny" | "network.blocked" | "network.allowlist" | "process.inherit";
export type CapabilityLevel = "full" | "partial" | "unsupported";
export type SandboxRequest = {
  readonly purpose: "tool" | "evaluation";
  readonly isolation: "sandboxed" | "none";           // none 只用于已获批准的沙箱外执行
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly filesystem?: { readonly readWrite?: readonly string[]; readonly readOnly?: readonly string[]; readonly denyRead?: readonly string[]; readonly denyWrite?: readonly string[] };
  readonly network?: SandboxNetwork;
  readonly timeoutMs?: number;
  readonly requiredCapabilities?: readonly SandboxCapability[];
  readonly scratchDir: string;                        // 本次执行的私有目录，后端写策略文件
};
export type SandboxPolicy = Required<Omit<SandboxRequest, "timeoutMs">> & { readonly timeoutMs?: number; readonly fingerprint: string };

// —— 后端 ——
export type BackendProbe = { readonly available: true; readonly version: string; readonly capabilities: Readonly<Record<SandboxCapability, CapabilityLevel>> } | { readonly available: false; readonly reason: string };
export interface SandboxBackend {
  readonly id: string;
  readonly priority: number;                          // 大者优先：nono 100，seatbelt 50
  probe(): Promise<BackendProbe>;
  prepare(policy: SandboxPolicy): Promise<{ readonly spawn: HostProcessSpec; dispose(): Promise<void> }>;
}

// —— 执行句柄与结果 ——
export type SandboxOutcome =
  | { readonly status: "prepare_failed"; readonly reasons: readonly string[] }
  | { readonly status: "exited"; readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }
  | { readonly status: "timed_out" | "cancelled"; readonly signal: NodeJS.Signals | null; readonly residual: boolean };
export type SandboxFacts = { readonly isolation: "sandboxed" | "inherited" | "none"; readonly backend?: { readonly id: string; readonly version: string }; readonly capabilities?: Readonly<Record<SandboxCapability, CapabilityLevel>>; readonly policyFingerprint: string; readonly cleanup: "ok" | { readonly failed: string } };
export interface SandboxExecution {
  onOutput(listener: (chunk: { readonly stream: "stdout" | "stderr"; readonly text: string }) => void): void;
  terminate(reason: "cancelled"): void;               // SIGTERM → 宽限期后 SIGKILL
  forceTerminate(): void;
  readonly result: Promise<{ readonly outcome: SandboxOutcome; readonly facts: SandboxFacts }>;
}

// —— sandbox 服务 ——
export const SANDBOX_SERVICE_ID = "sandbox";
export interface SandboxService {
  register(backend: SandboxBackend): () => void;      // 返回注销函数
  status(required?: readonly SandboxCapability[]): Promise<{ readonly available: boolean; readonly isolation: "sandboxed" | "inherited"; readonly backendId?: string; readonly reasons: readonly string[] }>;
  run(request: SandboxRequest): SandboxExecution;
}
```

- 策略合并：`默认策略 → purpose 模板（第一期只有 tool）→ 本次请求`，结果冻结并计算 `fingerprint`（规范化 JSON 的 sha256）。本次请求只能收窄：`readWrite` 必须落在模板允许的根目录内，否则 `prepare_failed`。
- `tool` 模板：`network: unrestricted`；`denyRead` 显式列出凭据、钥匙串、浏览器数据、macOS 私有数据、shell 历史路径（取自 nono 必选规则组，只保留当前平台的条目）；`denyWrite` 为工作区的 `.git/hooks` 与 `.git/config`；`requiredCapabilities` 为 `filesystem.write`、`filesystem.read-deny`、`filesystem.write-deny`、`process.inherit`。
- 继承模式：`status()` 返回 `isolation: "inherited"`，`run()` 不选后端、直接启动，`facts.isolation = "inherited"`。

## 任务

### T0 实测（先做，结果决定 T3 策略与 T5 准入写法）

- 在 `tmp/sandbox-spike/` 用本机 nono 与下载的 0.80.0 实测 `nono wrap -s --no-diagnostics -c manifest.json -- /bin/zsh -lc <cmd>`：
  1. macOS 清单：`grants` 给 `/` 只读、工作区 / 临时目录读写；`deny` 给 `~/.ssh` `~/.aws` `~/.gnupg` `<ws>/.git/hooks` `<ws>/.git/config`。期望：读 `~/.ssh/known_hosts` 失败、写工作区成功、写 `$HOME/x` 失败、写 `.git/config` 失败；`git status`、`node -e 1`、`pnpm --version`、`curl -sI https://example.com` 成功。
  2. 同一清单加 `network.mode: "blocked"`：`curl` 失败，其余成功。
  3. 记录 nono 自带保护是否额外拦截常用命令（读取 `~/.gitconfig`、`~/.npmrc`、`~/.cache`）。
  4. 测 `wrap` 每次的额外耗时（20 次中位数），与研究文档的 4–5ms 对比。
- 验证 Cordis 可选依赖：在 `packages/boot` 现有测试旁写一个临时用例，组合里放一个 `requires: [{ id: "sandbox", version: 1, optional: true, fallback: "…" }]` 的条目但不放 `sandbox` 提供者，确认准入通过、`ctx.get("sandbox")` 返回 `undefined`。不通过就把“准入支持可选依赖”加为 T5 的子任务，并写入决策记录。
- 结果写入执行过程文档。macOS 能表达现有语义时 T3 按“行为对齐”实现；不能时选更严格且第 1 条命令仍能跑通的方案，差异写进执行摘要。

### T1 `packages/sandbox/manager`（`@actspace/sandbox`）

- 文件：`package.json`（exports `.`、`./manifest`、`./plugin`、`./node-ports`）、`tsconfig.json`（extends `../../../tsconfig.package.json`）、`tsconfig.build.json`、`src/index.ts`、`src/types.ts`（上方契约）、`src/policy.ts`、`src/select.ts`、`src/execution.ts`、`src/service.ts`、`src/manifest.ts`、`src/plugin.ts`、`src/node-ports.ts`、`src/test/*.test.ts`。骨架照 `packages/tools/background-tasks`。
- `policy.ts`：`resolvePolicy(request, template, defaults)`；校验路径为绝对路径并做 `realpath`；收窄规则；`fingerprint`。
- `select.ts`：按 `priority` 降序探测（结果缓存，后端注册或注销时失效），返回第一个 `available` 且必需能力全部 `full` 的后端；否则返回每个后端的不合格原因。
- `execution.ts`：`run()` 立刻返回句柄；内部依次合并策略 → 选后端 → `prepare` → `host.spawn` → 转发输出 → 等待退出 → `dispose`。`terminate()` 先 `signalGroup("SIGTERM")`，`KILL_GRACE_MS`（2000）后 `SIGKILL`，再等 `RESIDUAL_WAIT_MS`（1000）；仍未退出时 `residual: true`。`timeoutMs` 到期走同一路径，状态为 `timed_out`。准备阶段任何失败都返回 `prepare_failed`，且不调用 `host.spawn`。`isolation: "none"` 时跳过选后端，`facts.isolation = "none"`。
- `service.ts`：`register` / `status` / `run`；插件配置 `{ mode?: "sandboxed" | "inherited" }`，默认 `sandboxed`。
- `manifest.ts`：`pluginId: "actspace.sandbox"`，`entryId: "sandbox"`，`host.required: ["process"]`，`injects: ["actspace.host.sandbox"]`，`services: ["sandbox"]`。
- `node-ports.ts`：`createNodeSandboxHostPort({ nonoPath? })`。`spawn` 使用 `detached: process.platform !== "win32"`；`signalGroup` 照 `shell-tools` 的 `signalProcess`（`process.kill(-pid, signal)`）。
- 测试（fake host、fake backend）：
  - 策略：模板 + 请求合并结果；请求放宽 `readWrite` 到模板外时 `prepare_failed`；同一输入的 `fingerprint` 相同。
  - 选择：优先级高者优先；高优先级不可用时选次一个；能力为 `partial` 时不选；全部不合格时原因齐全；探测缓存且注销后失效。
  - 生命周期：正常退出的 `exited` 与 facts；`prepare` 抛错时 `prepare_failed` 且 fake spawn 计数为 0；`terminate()` 依次发出 SIGTERM、SIGKILL；忽略 SIGKILL 的 fake 进程得到 `residual: true`；`timeoutMs` 到期为 `timed_out`；`dispose` 抛错时 `cleanup.failed` 有值而 `outcome` 不变；`isolation: "none"` 不调用后端。
  - 继承模式：`status().isolation === "inherited"`，`run()` 不调用任何后端。
  - `node-ports`：真实 `spawn` 一个会再起子进程的 `sh -c 'sleep 30 & sleep 30'`，`signalGroup("SIGKILL")` 后两个进程都退出（非 Windows）。
- 验证：`pnpm --filter @actspace/sandbox test`、`pnpm --filter @actspace/sandbox typecheck`。

### T2 `packages/sandbox/seatbelt`（`@actspace/sandbox-seatbelt`）

- 把 `shell-tools/src/node-ports.ts:284-315` 的 SBPL 生成与探测搬到 `src/backend.ts`，导出 `createSeatbeltBackend(host)`，`priority: 50`。规则文本保持不变，路径来自 `SandboxPolicy.filesystem`；`network.blocked` 时在规则中把 `(allow network*)` 换成 `(deny network*)`。
- 能力：`filesystem.write`、`filesystem.read-deny`、`filesystem.write-deny`、`network.blocked`、`process.inherit` 为 `full`，`network.allowlist` 为 `unsupported`。非 darwin 或 `/usr/bin/sandbox-exec` 探测失败时不可用。
- `src/plugin.ts`：注入 `sandbox` 与 `actspace.host.sandbox`，`register` 后在 `ctx.effect` 中注销。
- 测试：规则逐条断言（与原实现一致）；darwin 上真实执行写工作区成功、写工作区外失败、断网时 `curl` 失败（非 darwin 用 `it.skipIf`）。
- 验证：`pnpm --filter @actspace/sandbox-seatbelt test`。

### T3 `packages/sandbox/nono`（`@actspace/sandbox-nono`）

- `src/cover.ts`：`coverReadable(roots, excluded, fs)` 实现 T0 的拆分覆盖：从 `/` 开始，不是排除路径上级的目录整体授权，是上级的展开子项递归，排除路径本身跳过，符号链接按目标类型授权、目标不存在的跳过。符号链接的目标落在排除路径之内或之上时也跳过（nono 按目标授权，否则会绕过排除）。排除集合：Linux 为 `denyRead` 加 nono 受保护目录（`~/.nono`、`$XDG_STATE_HOME/nono`，默认 `~/.local/state/nono`）；macOS 只排除受保护目录（`denyRead` 改用 Seatbelt 规则，见下）。文件系统访问通过参数注入，便于测试。
- `src/config.ts`：纯函数。macOS 生成 profile：`filesystem.read` / `read_file` 为拆分覆盖结果，`allow` 为 `readWrite`，`allow_file` 为 `/dev/null`，`bypass_protection` 为登录 shell 会读取的配置文件（zsh：`~/.zshenv` `~/.zprofile` `~/.zlogin`；bash：`~/.bash_profile` `~/.bash_login` `~/.profile`），`unsafe_macos_seatbelt_rules` 为 `denyRead` 的 `(deny file-read* …)` 与 `denyWrite` 的 `(deny file-write* …)`（路径做 SBPL 字符串转义；读取限制用规则而不靠拆分，授权条目从约 1100 条降到约 110 条，单次耗时从约 900ms 降到约 40ms），`network.block` 按策略设置。Linux 生成权限清单：`grants` 为拆分覆盖结果加 `readWrite`，`network.mode` 为 `unrestricted` / `blocked`，`rollback.enabled: false`，不写 `deny`（nono 清单模式忽略它）。
- `src/backend.ts`：`createNonoBackend(host)`，`priority: 100`，`id: "nono"`。没有 `host.resources.nonoPath` 时不可用（原因写明“未找到打包的 nono”）。`probe()` 执行 `<nonoPath> --version`（3 秒超时）解析版本，并执行一次 `wrap` 空命令确认可用（Linux 上同时确认 Landlock）。`prepare()` 把配置写到 `scratchDir`，macOS 返回 `["wrap", "-s", "--no-diagnostics", "-p", profilePath, "--", ...argv]`，Linux 返回 `["wrap", "-s", "--no-diagnostics", "-c", manifestPath, "--", ...argv]`；传给 nono 的环境变量去掉所有 `NONO_*`；`dispose` 删除配置文件。
- 能力：`filesystem.write`、`filesystem.read-deny`、`network.blocked`、`process.inherit` 为 `full`；`filesystem.write-deny` 在 macOS 为 `full`、Linux 为 `unsupported`（因此第一期 Linux 的 bash 走审批）；`network.allowlist` 为 `unsupported`（第二期由 `run` 模式提供）。
- `src/plugin.ts`：同 T2。
- 测试：拆分覆盖（假文件系统：排除路径、上级展开、符号链接、目标不存在）；macOS profile 与 Linux 清单快照；SBPL 转义；`NONO_*` 被去掉；无 `nonoPath` 时不可用；真实执行与 T2 相同的读写和断网断言（`describe.skipIf(!process.env.ACTSPACE_NONO_PATH)`，执行摘要必须写明在哪台机器、哪个 nono 版本上跑过）。
- 验证：`ACTSPACE_NONO_PATH=$(pwd)/dist/sandbox-components/darwin-arm64/nono pnpm --filter @actspace/sandbox-nono test`。

### T4 nono 程序获取与打包

- `scripts/sandbox/nono-version.json`：`{ "version": "0.80.0", "assets": { "darwin-arm64": { "file": "nono-v0.80.0-aarch64-apple-darwin.tar.gz", "sha256": "…" }, … } }`，哈希取自上游 `SHA256SUMS.txt`，四个平台齐全。
- `scripts/sandbox/fetch-nono.mjs`：按当前平台（或 `--all`）下载到 `dist/sandbox-components/<platform>/nono`，校验 SHA256，不一致时失败并删除文件，`chmod 755`。根 `package.json` 增加 `"sandbox:fetch-nono"`。
- `scripts/release-package.sh`：在 browser-components 步骤旁用 `fetch-nono.mjs --out` 把 nono 直接装到 `${deploy_dir}/sandbox-components/bin/nono`（脚本开头会删掉整个 `dist/`，不能从 `dist/sandbox-components` 复制；压缩包缓存在 `.cache/sandbox/nono/`）；在 macOS 签名步骤中单独签名该程序（方式同 `package-browser-components.mjs`）；程序缺失时打包失败。
- 测试：`scripts/test/fetch-nono.test.mjs`，用本地 fixture 验证哈希不符时失败、平台映射正确，不访问网络。
- 验证：`node --test scripts/test/fetch-nono.test.mjs`；`pnpm sandbox:fetch-nono` 后 `dist/sandbox-components/darwin-arm64/nono --version` 输出 `nono 0.80.0`。

### T5 注册进默认 Harness，Host 提供端口

- **准入支持可选依赖**（T0 结论 11）：`DEFAULT_HARNESS_ENTRIES` 条目增加第四项 `optionalInjects`；清单 `contracts.services.requires` 为它们写 `optional: true` 与 `fallback`；`PluginBehaviorDescriptor`、组合条目、`IsolatedCordisEntry` 增加 `optionalInjects`，`harness-mount.ts` 一并校验。`mountIsolatedCordisTree`：可选依赖由组合提供或属于共享服务时并入 Cordis `inject`（保证启动顺序），否则不注入，并把该名字加入隔离表，使 `ctx.get` 返回 `undefined` 而不是 Host 上的同名服务。测试：有提供者时注入且先启动；没有时准入通过、`ctx.get` 为 `undefined`；Host 上存在同名服务时仍为 `undefined`。

- `packages/runtime/src/harness/default-harness-definition.ts`：增加三条条目 `["sandbox", ["sandbox"], ["actspace.host.sandbox"]]`、`["sandbox-nono", [], ["sandbox", "actspace.host.sandbox"]]`、`["sandbox-seatbelt", [], ["sandbox", "actspace.host.sandbox"]]`；`defaultHarnessEntrySource` 加特殊映射到 `@actspace/sandbox/plugin`、`@actspace/sandbox-nono/plugin`、`@actspace/sandbox-seatbelt/plugin`。
- `packages/runtime/src/profiles/composition.ts`：导入三个清单并加入 `baseBundle.manifests`。
- `packages/runtime/package.json` 与 `packages/runtime/tsconfig.build.json`：加入三个依赖与引用。
- `packages/cordis-adapter/src/service-contract.ts`：登记 `sandbox` 服务与 `actspace.host.sandbox` Host 端口（照 todoTools 的三处写法）。
- Desktop：`apps/desktop/src/main/index.ts` 按 D5 解析 nono 路径（打包时 `join(process.resourcesPath, "app", "sandbox-components", "bin", "nono")`；开发时依次 `ACTSPACE_NONO_PATH`、`dist/sandbox-components/<platform>/nono`，文件不存在就不传），`desktop-host-adapter.ts:126` 的 `hostServices` 加入 `[SANDBOX_HOST_PORT_ID]: createNodeSandboxHostPort({ nonoPath })`。
- agent-host / CLI：`packages/agent-host/src/node-ports/tool-host-services.ts` 同样加入，路径依次 `ACTSPACE_NONO_PATH`、仓库 `dist/sandbox-components/<platform>/nono`。
- 启动时把 `sandbox.status()` 写一行日志：`isolation`、后端 id 与版本，或不可用原因。
- 测试：nono 路径解析单测（打包 / 环境变量 / 仓库 / 都不存在）；`packages/runtime/src/harness/default-harness.test.ts` 断言三个条目存在且准入通过。
- 验证：`pnpm --filter @actspace/runtime test`、`pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/agent-host test`。

### T6 shell-tools 接入

- `packages/tools/shell-tools/src/manifest.ts`：增加对 `sandbox` 的可选依赖（按 T0 结论用 `contracts.services.requires` 的 `optional: true, fallback: "bash runs outside the sandbox after approval"`）。
- `packages/tools/shell-tools/src/plugin.ts`：
  - `const sandbox = ctx.get?.("sandbox") as SandboxService | undefined`；`HostPort.createPorts(background, sandbox)`。
  - 在 `apply` 中调用一次 `sandbox?.status(TOOL_REQUIRED)` 并缓存 `sandboxAvailable`；后端注册变化时刷新（`register` 触发 `status` 失效，shell-tools 在每次 `evaluate` 前读取缓存值，缓存由 `sandbox` 服务维护）。
  - `permissionContract("bash")`：有效 `noSandbox = 显式 no_sandbox || !sandboxAvailable`，资源与 `suggestGrants` 都用这个值。
- `packages/tools/shell-tools/src/node-ports.ts`：
  - `createNodeBashToolPorts` 的选项 `sandbox?: boolean` 删除；`createPorts(background, sandbox)` 传入服务。
  - 抽出执行接口 `BashRunner`：有 `sandbox` 时用 `sandbox.run({ purpose: "tool", isolation: 有效 noSandbox ? "none" : "sandboxed", argv: [shell, "-lc", command], cwd, env: { ...process.env, TMPDIR: outputRoot }, filesystem: { readWrite: [workspace, outputRoot, tmp] , denyWrite: [<ws>/.git/hooks, <ws>/.git/config] }, scratchDir: outputRoot })`；没有 `sandbox` 时保留现有直接 `spawn`，只在有效 `noSandbox` 为 `true`（已获批准）时允许执行，否则返回 `SANDBOX_PREPARE_FAILED`。
  - `ProcessHandle` 保留输出文件、头部截断、磁盘上限逻辑，改为消费 `BashRunner` 的输出与结果；`kill()` → `terminate("cancelled")`，`forceTerminate()` 透传。
  - 结果为 `prepare_failed` 时返回失败，错误码 `SANDBOX_PREPARE_FAILED`，摘要列出原因，命令未执行。
  - 删除 `sandboxSpawn`、`probeSandbox`、`SANDBOX_PROBE_TIMEOUT_MS`、`signalProcess`（有 `sandbox` 时由管理器负责；无 `sandbox` 的直接 spawn 路径保留一份进程组终止）。
  - 摘要保留 `sandboxed=true|false`，追加 `sandbox=<backendId|inherited|none>`。
- 测试（`src/test/node-ports.test.ts`、`src/test/lifecycle.test.ts`）：
  - 无 `sandbox` 服务：`evaluate` 为 ask、资源 `noSandbox: true`、`suggestGrants` 为空；`full-access` 为 allow；执行时走直接 spawn，摘要 `sandbox=none`。
  - `sandbox` 可用：资源 `noSandbox: false`，`pnpm test` 仍有前缀授权建议（与现有断言一致）；执行时 `run` 收到 `isolation: "sandboxed"` 与上述路径。
  - `sandbox` 不可用：同“无 `sandbox` 服务”的权限结果；批准后 `run` 收到 `isolation: "none"`。
  - `run` 返回 `prepare_failed`：结果失败、错误码 `SANDBOX_PREPARE_FAILED`。
  - 取消前台命令触发 `terminate("cancelled")`；后台任务 `task_stop` 触发同一路径。
  - 原 `it.each([false, true])` 改为 `[无 sandbox, 使用真实 @actspace/sandbox + fake 后端]`，覆盖前台、后台与终止。
- 验证：`pnpm --filter @actspace/tools-shell-tools test`、`typecheck`；`pnpm --filter @actspace/tools-runtime test`（`process-grant.test.ts` 不变且通过）。

### T7 审批卡显示“真实环境”

- `apps/desktop/src/main/runtime-v2/approval-broker.ts`：构造 `DesktopRuntimeV2ApprovalRequest` 时，资源中有 `kind: "process"` 就按其 `noSandbox` 设置 `executionEnvironment`（`true` → `"real"`，`false` → `"sandbox"`）。
- 测试：approval broker 单测断言两种取值。渲染层 `BashApprovalEnvironment` 已有展示，不改 UI。
- 验证：`pnpm --filter @actspace/desktop test`。

### T8 生成物与仓库检查

- `scripts/contract-matrix/source-registry.mjs`：`MANIFEST_PATHS` 与 `PACKAGE_PATHS` 加入三个包，执行 `pnpm gen:contract-matrix`。
- `pnpm check:desktop-build-graph` 不通过时执行 `node scripts/generate-desktop-build-graph.mjs` 并提交 `tsconfig.desktop-deps.json`。
- 验证：`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm check:desktop-build-graph`、`pnpm typecheck`、`pnpm test`。

### T9 端到端验证

- macOS：`pnpm sandbox:fetch-nono && pnpm dev:log`，在 Desktop 中让 Agent 依次执行：`echo hi > a.txt`（成功，摘要 `sandbox=nono`）、`echo hi > ~/actspace-sandbox-probe.txt`（失败）、`cat ~/.ssh/known_hosts`（失败）、`git status`、`pnpm --version`（成功）；一个 `sleep 300` 后台任务用 `task_stop` 停止后进程不存在。`logs/latest-dev.log` 有沙箱状态行。
- macOS 无 nono（删除 `dist/sandbox-components`，不设 `ACTSPACE_NONO_PATH`）：摘要为 `sandbox=seatbelt`，行为同上。
- 组合中去掉三个沙箱插件（测试组合）：bash 调用出现审批卡并显示“真实环境”，批准后执行，摘要 `sandbox=none`，没有前缀授权选项。
- Linux：在 Docker 容器（`node:22`，挂载仓库）中执行 T3 的真实测试与 `pnpm --filter @actspace/tools-shell-tools test`；Docker Desktop 内核不支持 Landlock 时记录“Linux 未实机验证”，不当作通过。
- 结果写入执行摘要。

### T10 文档与收尾

- [沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)：状态改为“第一期已实施”，填入 T0 实测结论。
- [执行安全入口](../../design-docs/execution-safety/README.md)“Bash 当前边界”：改为经 `sandbox` 服务执行；写明缺失或不可用时转审批、环境变量仍完整继承。
- `docs/SECURITY.md:43`：删掉“现有 macOS sandbox 尝试及降级行为不变”，改为当前行为。
- `packages/README.md` 增加 `sandbox/` 一行；`packages/tools/README.md` 的 shell-tools 说明补“经 sandbox 服务执行”；`docs/design-docs/agent-plugin-runtime/agent-package-ledger.md` 登记三个包。
- `docs/histories/2026-10/` 记一条 history；按 `docs/learnings/WRITING_GUIDE.md` 判断是否写学习文档（nono `deny` 在 Landlock 上的语义差异属于“有陷阱”）。
- 计划移到 `completed/`，更新 `docs/exec-plans/README.md`。

## 依赖与顺序

T0 → T1 →（T2、T3、T4 可并行）→ T5 → T6 →（T7 可与 T6 并行）→ T8 → T9 → T10。

## 风险

- **nono 自带保护拦截常用命令**：T0 先测；必要时在清单里显式授权，并在执行摘要列出。
- **Linux 无法表达“全部可读减去凭据目录”**：用授权列表；T9 至少在一个 Linux 环境实测，否则如实记录未验证。
- **Cordis 准入不支持可选依赖**：T0 先验证；不支持时补准入逻辑并单独提交。
- **nono 版本变化**：锁定 0.80.0 并校验哈希；升级是单独的改动，需要重跑 T3 真实测试与 T9。
- **打包后的 nono 未签名导致 macOS 拒绝执行**：T4 在签名步骤中加入；`ACTSPACE_MAC_ADHOC_SIGN` 本地包也要验证一次。
- **沙箱不可用时审批变多**：有意的取舍（Windows 用户每次 bash 都要确认，直到第三期）；`full-access` 模式不受影响。

## 回退

- 每个任务单独提交。回退 T5–T7 的提交即恢复原有 bash 行为；T1–T4 的新包与脚本不影响现有路径。
- 打包问题只回退 `scripts/release-package.sh` 的改动，Desktop 因找不到 nono 会改用 Seatbelt。

## 验证方式

- 命令：`pnpm --filter @actspace/sandbox test`、`pnpm --filter @actspace/sandbox-seatbelt test`、`pnpm --filter @actspace/sandbox-nono test`、`pnpm --filter @actspace/tools-shell-tools test`、`pnpm --filter @actspace/tools-runtime test`、`pnpm --filter @actspace/runtime test`、`pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/agent-host test`、`node --test scripts/test/fetch-nono.test.mjs`、`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm check:desktop-build-graph`、`pnpm typecheck`、`pnpm test`。
- 手工检查：T9 的 Desktop 操作清单。
- 观测检查：`logs/latest-dev.log` 中的沙箱状态行；bash 结果摘要中的 `sandbox=<backendId|inherited|none>`。

## 进度记录

- [x] T0 实测（结论见执行过程步骤 1）
- [x] T1 manager
- [x] T2 seatbelt
- [x] T3 nono
- [x] T4 nono 获取与打包
- [x] T5 注册与 Host 端口
- [x] T6 shell-tools 接入
- [x] T7 审批卡真实环境
- [ ] T8 生成物与检查
- [ ] T9 端到端验证
- [ ] T10 文档与收尾

## 决策记录

- 2026-10-25：用户确认 macOS / Linux 用 nono，Windows 第三期原生实现；打包 nono 命令行程序而不用 `nono-ts`；工具沙箱用 `nono wrap`。
- 2026-10-25：用户否决“沙箱放在 Host”与“第一期只做准备启动”，确认 D1–D6：沙箱是可替换的 Harness 插件；第一期打完整地基；nono > Seatbelt；缺失或不可用时转审批；只用打包的 nono；继承模式只能由显式配置打开。

- 2026-10-25：T0 实测后用户确认：`filesystem.write-deny`（`.git/hooks`、`.git/config`）列为 `tool` 模板必需能力，Linux 上 nono 不合格，第一期 Linux 的 bash 走审批；接受 nono 拦截钥匙串，沙箱内推送需申请沙箱外执行。nono 在 macOS 用 profile 模式、Linux 用权限清单模式，读取限制用拆分覆盖表达。
- 2026-10-25：T3 实现中发现 macOS 上把 `denyRead` 的上级全部拆开会产生约 1100 条授权，nono 每次启动约 900ms；改为 macOS 只围绕 nono 受保护目录拆分，`denyRead` 写成 `(deny file-read* …)` 规则（实测拒绝生效，经 `/System/Volumes/Data` 访问同样被拒），约 40ms。Linux 仍靠不授权表达。语义不变，执行摘要记录。
- 2026-10-25：T5 实现时打包版 nono 路径只认随包的程序，`ACTSPACE_NONO_PATH` 与仓库副本只在开发版生效；沙箱启动状态记为运行时诊断 `SANDBOX_STATUS`。
- 2026-10-25：T6 执行端只认批准时进程资源的 `noSandbox`，不在执行时重新判断沙箱是否可用；需要沙箱而不可用时返回 `SANDBOX_PREPARE_FAILED`。权限判断每次读取管理器已缓存的 `status("tool")`，插件不另做缓存。

## 执行模式

- **交互模式**：涉及 Harness 组合、权限语义与打包，人在线逐步确认。

## 执行文档

执行开始时，在 `docs/exec-runs/20261025-sandbox-v1-tool-sandbox/` 从 `docs/exec-runs/templates/` 复制 `execution-process.md` 与 `execution-summary.md`。
