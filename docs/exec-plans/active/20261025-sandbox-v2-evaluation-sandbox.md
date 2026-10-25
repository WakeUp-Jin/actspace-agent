# 沙箱第二期：评估沙箱（macOS / Linux）

## 目标

在第一期的地基上加出评估沙箱：管理器实现 `purpose: evaluation` 模板，nono 后端用 `nono run` 实现域名白名单与上游代理；继承模式改由 Host 的显式启动参数打开；CLI 能用指定的候选组合启动并继承外层沙箱。新增使用方 `harness-evaluation`：v1 通过 `sandbox` 服务在评估沙箱里启动候选 Harness（CLI），跑一个任务，沙箱退出后读取结果文件。真实 nono、真实 CLI 候选与假模型服务的集成测试证明这条路径能跑通，而且边界成立：原工作区写不进去、白名单外的域名连不上、候选里的 bash 标为 `inherited`。

## 范围

- 包含：
  - `@actspace/sandbox`：`evaluation` 模板；`allowlist` 网络与 `upstreamProxy`；预留 `network.credentials`、`limits` 字段与三项新能力；继承模式改由 Host 沙箱端口的 `inherited` 打开，移除插件配置 `mode`。
  - `@actspace/sandbox-nono`：`allowlist` 时改用 `nono run`（`--allow-domain`、`--upstream-proxy`），macOS profile 与 Linux 权限清单两条路径。
  - `@actspace/sandbox-seatbelt`：能力表补齐新能力（都报告 `unsupported`）。
  - agent-host / CLI：`--sandbox-inherited`（写进 Host 沙箱端口）、`--harness <选择文件>`（用指定候选组合启动，不写入持久选择）。
  - 新包 `packages/harness-evaluation`（`@actspace/harness-evaluation`）：Harness 插件，服务 `harnessEvaluation`，必需依赖 `sandbox`；Host 评估端口 `actspace.host.harness-evaluation`（启动入口、模型连接）。
  - 集成测试（macOS 真实 nono；Linux Docker 复验）、契约矩阵与仓库检查、文档与 history。
- 不包含：
  - 评估用例、打分、拦住 apply 的门槛，`plugin_manager` 的评估动作（自进化 V2）。
  - 把 `harness-evaluation` 加进默认 Harness 组合、Desktop 提供评估端口、打包版 Desktop 携带 CLI（自进化 V2）。
  - 复制用户真实工作区（自进化 V2；第二期只用临时测试工作区）。
  - 凭据注入（nono 反向代理 + 替身 token）、内存 / CPU 上限：契约预留，后端报告 `unsupported`。
  - Windows（第三期）。

## 背景

- 必读：
  - `AGENTS.md`
  - [沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)：4.1、4.3、4.6、5.1、第 6 节是本计划的依据
  - [第一期计划](../completed/20261025-sandbox-v1-tool-sandbox.md)与[执行摘要](../../exec-runs/20261025-sandbox-v1-tool-sandbox/execution-summary.md)
  - [自进化 V1 实现与使用说明](../../design-docs/自进化的方案设计/10-V1实现与使用说明.md)：选择、产物、`executionDigest`
- 相关代码路径：
  - `packages/sandbox/manager/src/{types,policy,service,plugin,execution}.ts`：契约、模板与收窄、继承模式（当前读 `config.mode`）
  - `packages/sandbox/nono/src/{backend,config}.ts`：`wrap` 启动、`allowlist` 当前直接抛错
  - `packages/sandbox/seatbelt/src/*`：能力表
  - `packages/agent-host/src/node-ports/tool-host-services.ts`：Host 沙箱端口的组装
  - `apps/cli/src/{args.ts,runtime-v2/run.ts,runtime-v2/host-adapter.ts}`：`run` 参数、`bootCliV2`；模型连接来自环境变量 `LLM_PROVIDER`、`<P>_API_KEY`、`<P>_BASE_URL`、`LLM_PROXY_URL`
  - `packages/runtime/src/harness/agent-runtime-plugin.ts:70`：`HarnessControl` 以 `dataRoot/harness-artifacts` 与 `harness-state` 启动 main Harness
  - `packages/harness-control/src/{contracts,candidate,service}.ts`：`SelectionDescription`、`loadArtifact`、`validateCandidate`
  - `packages/llm/service/src/provider-proxy.ts`：模型连接自带代理
- 已知约束：
  - nono 0.80.0 `run` 自带 CONNECT 代理（`nono-proxy`），子进程只能连代理端口；代理固定拒绝云元数据地址，允许私有网段。
  - Node 22.22 与 Electron 39 自带 Node 的 `fetch` 认 `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`（已实测，会打印 experimental 警告）。
  - CLI 的 `run` 用仓库内 `cordis.yml` 的固定组合启动，目前没有“按选择启动”的入口。
  - 打包版 Desktop 不带 CLI。

## 已确认的决策（2026-10-25）

- **E1 范围拆分。** 沙箱第二期只做评估沙箱能力加最小使用方；评估用例、打分、apply 门槛属于自进化 V2。
- **E2 候选启动。** CLI `run` 加 `--harness <选择文件>` 与 `--sandbox-inherited`；候选用临时的独立 dataRoot，不碰主应用数据。
- **E3 文件系统。** 候选只写工作区副本与临时目录；原工作区只读；凭据目录不能读。因此 Linux 也能用。
- **E4 网络。** 只放行模型服务域名，由模型连接的 `baseUrl` 推出；nono `run` 代理实现。模型连接配置了代理时交给 `--upstream-proxy`，候选环境里去掉代理配置。
- **E5 密钥。** 契约预留凭据字段；第二期用环境变量传给候选。
- **E6 评分在沙箱外。** 候选只写结果文件，v1 在沙箱退出后读取。第二期不打分。
- **E7 候选权限。** 候选以 `full-access` 运行，里面的 bash 处于继承模式，结果标为 `inherited`。
- **E8 不可用就拒绝。** 没有可用的 nono 时评估沙箱不可用，直接拒绝，不转审批。
- **E9 最小使用方。** Harness 插件 `harness-evaluation` 提供服务，不做界面、不改 `plugin_manager`；用集成测试跑通。
- **E10 工作区副本。** 第二期只用临时测试工作区；真实工作区的复制留给自进化 V2。
- **E11 超时与资源。** 默认 10 分钟，复用进程组终止与残留检查；内存、CPU 上限报告 `unsupported`。
- **E12 继承模式由 Host 告知（取代第一期 D6）。** CLI `--sandbox-inherited` 写进 Host 沙箱端口 `inherited: true`；不读环境变量；移除管理器插件配置 `mode`，候选组合无法借配置关掉沙箱。
- **E13 打包版入口留给自进化 V2。**
- **E14 新包 `packages/harness-evaluation`。**

## 计划内的实现选择（审阅时可改）

- **评估环境变量不继承 v1 的进程环境**：只给 `PATH`、`HOME`、`LANG` / `LC_*`、`TMPDIR`（指向本次临时目录）加 Host 给出的模型连接变量。工具沙箱仍完整继承，与第一期一致。
- **`harness-evaluation` 第二期不加进默认 Harness 组合**：没有 Host 提供评估端口时它只会报告不可用；等自进化 V2 有了调用方再加。

## 契约变化（以实现后的 `packages/sandbox/manager/src/types.ts` 为准）

```ts
// Host 沙箱端口：新增 inherited，只由 Host 的显式启动参数设置
export interface SandboxHostPort { /* 第一期字段不变 */ readonly inherited?: true }

export type SandboxNetwork =
  | { readonly mode: "unrestricted" } | { readonly mode: "blocked" }
  | { readonly mode: "allowlist"; readonly domains: readonly string[]; readonly localPorts?: readonly number[]; readonly upstreamProxy?: string; readonly credentials?: readonly SandboxCredential[] };
export type SandboxCredential = { readonly domain: string; readonly header: string; readonly source: { readonly env: string } }; // 预留
export type SandboxRequest = { /* 第一期字段不变 */ readonly limits?: { readonly memoryBytes?: number; readonly cpuSeconds?: number } }; // 预留
// 新能力
//   network.local-ports            localPorts 非空时派生（T0：本机地址不经代理，必须按端口放行）
//   network.upstream-proxy         upstreamProxy 存在时派生
//   network.credential-injection   credentials 非空时派生；第二期所有后端 unsupported
//   process.resource-limits        limits 存在时派生；第二期所有后端 unsupported
export type SandboxManagerConfig = Record<string, never>; // 移除 mode
```

- `evaluation` 模板：读取全部、`denyRead` 同 `tool`（凭据、钥匙串、浏览器数据、shell 历史）、`denyWriteWithinWritable` 为空、网络为“必须是 `allowlist`，域名由请求给出且不能为空”、必需能力 `filesystem.write`、`filesystem.read-deny`、`network.allowlist`、`process.inherit`。
- 收窄规则不变：请求不能比模板宽。`evaluation` 请求的网络只能是 `allowlist`（或 `blocked`）。
- 继承模式：`host.inherited === true` 时 `status()` 返回 `isolation: "inherited"`，`run()` 直接启动；`purpose: evaluation` 在继承模式下返回 `prepare_failed`（候选内不应再启动评估）。

## `harness-evaluation` 接口（草案，T5 定稿）

```ts
export const HARNESS_EVALUATION_HOST_PORT_ID = "actspace.host.harness-evaluation";
export interface HarnessEvaluationHostPort {
  /** 启动 CLI 的命令前缀，如 [node, <repo>/apps/cli/dist/cli.js]。 */
  readonly launcher: readonly string[];
  /** 主应用的产物目录（只读来源）。 */
  readonly artifactRoot: string;
  /** Host 解析模型连接：给候选的环境变量、放行域名、上游代理。密钥只经这里流出。 */
  modelEnvironment(model: string | undefined): Promise<{ readonly env: Readonly<Record<string, string>>; readonly domains: readonly string[]; readonly localPorts?: readonly number[]; readonly upstreamProxy?: string }>;
}
export type HarnessEvaluationRequest = { readonly selection: SelectionDescription; readonly task: { readonly input: string; readonly model?: string }; readonly workspace: string; readonly timeoutMs?: number };
export type HarnessEvaluationResult =
  | { readonly status: "unavailable"; readonly reasons: readonly string[] }
  | { readonly status: "completed" | "failed" | "timed_out" | "cancelled"; readonly result?: CliRunResult; readonly sandbox: SandboxResult; readonly outputTail: string };
export interface HarnessEvaluationService {
  status(): Promise<{ readonly available: boolean; readonly reasons: readonly string[] }>;
  run(request: HarnessEvaluationRequest, signal?: AbortSignal): Promise<HarnessEvaluationResult>;
}
```

一次评估：创建临时根目录（`data/`、`workspace/`、`out/`、`tmp/`、`scratch/`）→ 把 `selection.artifactIds` 从 `artifactRoot` 复制到 `data/harness-artifacts/` → 复制工作区 → 写选择文件与任务文件 → `sandbox.run({ purpose: "evaluation", argv: [...launcher, "run", "--data-dir", …, "--workspace", …, "--harness", …, "--sandbox-inherited", "--permission-mode", "full-access", "--input-file", …, "--out", …, "--json"], network: { mode: "allowlist", domains, localPorts, upstreamProxy }, filesystem: { readWrite: [临时根目录] }, timeoutMs })` → 沙箱退出后读取并校验 `out/` 的结果 → 删除临时根目录（失败只记在结果里）。

## 任务

### T0 实测（先做，结论决定 T2、T4 的写法）

在 `tmp/sandbox-v2-spike/` 用 `dist/sandbox-components/` 的 nono 0.80.0：

1. **macOS `nono run`**：profile 模式（`-p`，沿用第一期生成的 profile）+ `--allow-domain example.com`：Node `fetch` 访问 `example.com` 成功、`github.com` 失败；`curl` 同样；读 `~/.ssh` 失败；写临时根目录外失败。记录额外耗时与常驻内存。
2. **Linux `nono run`**：Docker `node:22`，权限清单模式（`-c`）+ `--allow-domain`，同上检查；确认 Landlock 网络限制生效。
3. **上游代理**：本机起一个假 CONNECT 代理，`--upstream-proxy 127.0.0.1:<port>` 时放行的请求经过它、不放行的不经过。
4. **本地假模型服务**：集成测试的假模型服务在 `127.0.0.1` 上。确认它在 `run` 模式下能否放行（`--allow-domain 127.0.0.1`？`NO_PROXY`？），不能的话确定测试的替代方案（例如假服务挂在一个解析到本机的域名，或经上游代理转发），并记录。
5. **进程**：`run` 的 supervisor 与子进程是否在同一进程组；对进程组 SIGTERM / SIGKILL 后无残留；退出码是否透传。
6. **CLI 能否在 `run` 里启动**：`nono run … -- node apps/cli/dist/cli.js run --mock --input hi`，确认需要的可写路径与读取路径。
7. **“按选择启动”的接法**（读代码 + 小实验）：比较 (a) 在临时 dataRoot 预置 `harness-state` 选择记录，(b) Host 端口给 `agent-runtime` 一个固定选择、`HarnessControl` 直接挂载它且不持久化。倾向 (b)：不伪造持久记录，也不经过授权链（授权已在 v1 一侧完成）。结论写进执行过程，T4 照此实现。

### T1 管理器：评估模板与契约加法

- `types.ts`：上面的契约变化；`SANDBOX_CAPABILITIES` 加三项。
- `policy.ts`：`sandboxTemplate("evaluation")`；模板网络支持“必须是 allowlist、域名由请求给出”；`allowlist` 域名规范化（小写、去重、排序、拒绝空列表与非法域名）；`upstreamProxy` 校验为 `host:port`；派生新能力；指纹覆盖新字段。
- `service.ts` / `plugin.ts`：继承模式改读 `host.inherited`；移除 `config.mode`；继承模式下 `evaluation` 返回 `prepare_failed`。
- `node-ports.ts`：`createNodeSandboxHostPort({ nonoPath, inherited })`。
- 第一期测试里的 `config: { mode: "inherited" }` 改为 Host 端口；新增：评估模板收窄（`unrestricted` 被拒绝）、空域名拒绝、`tool` 请求用 `allowlist` 仍合法（比模板窄）、预留能力导致 `prepare_failed`、插件配置带 `mode` 时清单校验拒绝。
- 验证：`pnpm --filter @actspace/sandbox test`、`typecheck`。

### T2 nono 后端：`run` 模式

- `nonoCapabilities`：`network.allowlist`、`network.upstream-proxy` 为 `full`（macOS / Linux），`network.credential-injection`、`process.resource-limits` 为 `unsupported`。
- `prepare`：`allowlist` 时两个平台都用 `run -s --no-diagnostics --no-audit --no-rollback -p <profile>`（T0：Linux 权限清单会忽略上游代理，`-c` 也不能带参数）；profile 的 `network` 写 `allow_domain`、`open_port`（`localPorts`）、`upstream_proxy`；Linux profile 用拆分覆盖授权生成 `read` / `read_file` / `allow` / `allow_file`；仍去掉 `NONO_*`；`run` 的代理变量由 nono 设置，后端不自己拼。`nonoCapabilities` 加 `network.local-ports` 为 `full`。
- Seatbelt 能力表补齐三项 `unsupported`，`network.allowlist` 仍 `unsupported`。
- 验证：sandbox-nono 真实测试（macOS 本机）新增：白名单内成功、白名单外失败、上游代理经过、终止无残留；Linux Docker 复验。`pnpm --filter @actspace/sandbox-seatbelt test`。

### T3 Host 端口与 CLI `--sandbox-inherited`

- agent-host `createNodeToolHostServices({ sandboxInherited })` 传给 Host 沙箱端口；Desktop 不设置。
- CLI `run` 解析 `--sandbox-inherited`，只能与 `run` 一起用；帮助文本说明它只应由评估沙箱的启动方使用。
- 启动诊断 `SANDBOX_STATUS` 在继承模式下显示 `inherited`。
- 验证：agent-host、agent-cli 测试；CLI 带参数时 bash 结果摘要为 `sandboxed=true, sandbox=inherited`（以实现的摘要格式为准）。

### T4 CLI `--harness <选择文件>`

- 按 T0 第 7 项的结论实现（方案 b）：`AgentRuntimeHostPort.pinnedHarness`；agent-runtime 的 `builtin` 改为加载固定选择，不传 `upgradePristineBuiltin`；启动后检查 `main` 未被阻塞且 `executionDigest` 一致；`--data-dir` 下 `harness-state` 非空时拒绝。选择文件内容为 `SelectionDescription`（加 `executionDigest`）。
- 启动前校验：每个产物用 `loadArtifact` 验证、`validateCandidate` 检查兼容性；任何一项失败就以明确的错误码退出，不回退到内置组合。
- 不写入持久选择，不改 `harness-state`。
- 验证：CLI 测试覆盖正常启动（结果里能看到候选版本的 `executionDigest`）、产物缺失、摘要不符、兼容性失败。

### T5 `harness-evaluation` 包

- 新建 `packages/harness-evaluation`：清单（`injects: ["sandbox"]`，Host 端口 `actspace.host.harness-evaluation`）、插件、服务、`lifecycle.test.ts`（包边界检查要求）。
- 服务按上面的流程实现：临时目录、复制产物与工作区、写选择与任务文件、构造最小环境（`PATH`、`HOME`、语言、`TMPDIR` + `modelEnvironment` 的变量）、`sandbox.run`、读取并校验结果、清理。默认超时 10 分钟；`signal` 触发 `terminate()`。
- `status()`：`sandbox.status("evaluation")` 不可用或缺少 Host 端口时返回不可用及原因。
- agent-host 提供 `createNodeHarnessEvaluationHostPort`：`launcher` 为当前 Node + CLI 入口；`modelEnvironment` 从 CLI 同款环境变量推出 `env`、`domains`（`baseUrl` 的主机名）、`upstreamProxy`（`LLM_PROXY_URL`，并从 `env` 去掉）。
- 单测用假 `SandboxService`：请求形状（purpose、allowlist、readWrite 只有临时根目录、环境变量不含 v1 其他变量）、结果解析、超时与取消、清理失败只记录。
- 验证：`pnpm --filter @actspace/harness-evaluation test`、`typecheck`、`pnpm check:packages`。

### T6 集成测试：真实 nono + 真实 CLI 候选

- 位置：`packages/harness-evaluation/src/test/integration.test.ts`，`it.runIf(nono 可用)`；依赖 `apps/cli/dist/cli.js` 已构建（按仓库现有的进程测试做法处理构建顺序）。
- 假模型服务（OpenAI 兼容，按 T0 第 4 项的方式可达）依次让候选：`touch inside.txt`、`touch <原工作区>/escape.txt`、`curl -sI https://example.com`（或 Node `fetch`），然后结束。
- 断言：评估结果 `completed`；`facts.backend.id === "nono"`；候选 bash 摘要为 `inherited`；工作区副本里有 `inside.txt`；原工作区没有 `escape.txt`；白名单外访问失败；临时根目录已删除；v1 进程环境里的一个哨兵变量没有出现在候选里。
- 另测：选择文件指向不存在的产物 → `failed` 且有明确错误；超时（很短的 `timeoutMs` + 假模型服务挂起）→ `timed_out`、无残留进程。
- 验证：macOS 本机通过；Linux Docker 复验（脚本放 `tmp/`，结果写执行过程）。

### T7 生成物与仓库检查

- `scripts/contract-matrix/source-registry.mjs` 登记 `harness-evaluation`，执行 `pnpm gen:contract-matrix`。
- `pnpm check:desktop-build-graph` 不通过时重新生成依赖图。
- 验证：`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm check:desktop-build-graph`、`pnpm typecheck`、`pnpm test`。

### T8 文档与收尾

- 沙箱设计：状态改为“第二期已实施”，第 8 节补第二期实测结论。
- 执行安全入口、`packages/README.md`（`harness-evaluation/` 一行）、CLI 帮助与 README（两个新参数）。
- 自进化设计目录补一句：评估入口已就绪，接入留给 V2。
- history；按 `docs/learnings/WRITING_GUIDE.md` 判断是否写学习文档（候选：为什么继承模式必须由 Host 告知）。
- 计划移到 `completed/`，更新 `docs/exec-plans/README.md`。

## 依赖与顺序

T0 → T1 →（T2、T3 可并行）→ T4 → T5 → T6 → T7 → T8。

## 风险

- **“按选择启动”比预期复杂**：`HarnessControl` 的持久选择、授权、恢复链路较长。T0 先读代码并做小实验；若两种接法都需要改动 harness-control 的核心语义，停下来和用户讨论，不硬做。
- **本地假模型服务过不了代理**：T0 第 4 项先确认，集成测试按结论设计；不为测试放宽生产策略。
- **`run` 模式的进程模型不同**：supervisor 常驻，终止与残留检查可能要调整；T0 第 5 项先测。
- **Node 代理是 experimental**：候选 stderr 会有警告；不影响功能，结果解析不能依赖 stderr 干净。将来 Node 改变这个行为时，集成测试会失败而不是静默直连（ProxyOnly 下直连本来就会被拦）。
- **移除插件配置 `mode` 影响已有组合**：仓库内没有组合使用它（T1 搜索确认）；清单校验会拒绝旧配置，报错比静默忽略好。
- **密钥在候选里可读**：已知取舍（E5）；建议使用单独的、设了额度上限的 key，写进执行摘要。

## 回退

- 每个任务单独提交。T1–T3 只做加法（移除 `config.mode` 除外，第一期没有使用方），回退不影响工具沙箱；T4–T6 是新入口与新包，不在默认组合里，回退不影响现有路径。

## 验证方式

- 命令：`pnpm --filter @actspace/sandbox test`、`pnpm --filter @actspace/sandbox-nono test`、`pnpm --filter @actspace/sandbox-seatbelt test`、`pnpm --filter @actspace/harness-evaluation test`、`pnpm --filter @actspace/agent-host test`、`pnpm --filter @actspace/agent-cli test`、`pnpm --filter @actspace/tools-shell-tools test`、`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm check:desktop-build-graph`、`pnpm typecheck`、`pnpm test`。
- 手工检查：T6 集成测试在 macOS 本机与 Linux Docker 的结果；第一期的 Host 端到端脚本（`tmp/sandbox-v1-e2e/host-e2e.mjs`）复跑，确认工具沙箱不受影响。
- 观测检查：评估结果里的 `facts`（后端、能力、指纹、清理）；候选 bash 摘要 `sandbox=inherited`。

## 进度记录

- [x] T0 实测（结论见执行过程步骤 1）
- [x] T1 管理器：评估模板与契约加法
- [x] T2 nono 后端：`run` 模式
- [x] T3 Host 端口与 CLI `--sandbox-inherited`
- [x] T4 CLI `--harness`
- [ ] T5 `harness-evaluation` 包
- [ ] T6 集成测试
- [ ] T7 生成物与检查
- [ ] T8 文档与收尾

## 决策记录

- 2026-10-25：用户确认 E1–E11（范围拆分、候选启动参数、文件系统、网络与上游代理、密钥预留、评分在外、候选 full-access、无 nono 即拒绝、最小使用方、临时测试工作区、超时与资源）。
- 2026-10-25：读代码后用户确认 E12–E14：继承模式由 Host 端口告知并移除插件配置 `mode`（取代第一期 D6）；打包版入口留给自进化 V2；新包 `packages/harness-evaluation`。
- 2026-10-25：T0 后调整（计划内的实现细节，不改已确认的决策）：`allowlist` 加 `localPorts` 与能力 `network.local-ports`；nono `run` 两个平台都用 profile 模式并加 `--no-audit --no-rollback`；“按选择启动”用方案 b，不改 harness-control 语义。
- 2026-10-25：T4 实现时把选择文件的 `executionDigest` 改为可选（摘要绑定 Host 契约，Desktop 与 CLI 不同），兼容性由 `validateCandidate` 判断，结果报告实际运行的摘要。

## 执行模式

- **交互模式**：涉及 CLI 启动链路与 harness-control，T0 结论可能改变 T4 的做法。

## 执行文档

执行开始时创建 `docs/exec-runs/20261025-sandbox-v2-evaluation-sandbox/`：`execution-process.md`、`execution-summary.md`。
