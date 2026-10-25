# 沙箱第二期：评估沙箱 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261025-sandbox-v2-evaluation-sandbox.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：进行中

## 执行时间线

### 步骤 1：T0 实测 nono `run` 与“按选择启动”

- **操作**：
  - 在 `tmp/sandbox-v2-spike/` 写实验脚本，用 `dist/sandbox-components/` 的 nono 0.80.0。
  - 脚本先用第一期的 `resolvePolicy` 加 `createNonoBackend(...).prepare` 生成真实的 profile 或权限清单，再只替换网络段。
  - macOS 在本机测（Darwin 25.3.0，arm64）。Linux 在 Docker `node:22` 里测（arm64，Landlock），把仓库与 nono 只读挂载进去。
  - 第 7 项靠读代码：`packages/harness-control/src/service.ts`、`packages/runtime/src/harness/agent-runtime-plugin.ts`、`packages/boot/src/harness-mount.ts`。
- **影响文件**：只有 `tmp/` 下的实验文件。
- **结论**：
  1. **白名单在两个平台都生效。**
     - 写法：macOS 用 profile 的 `network.allow_domain`；Linux 用权限清单 `network: { mode: "proxy", allow_domains }` 或 profile 的 `allow_domain`。
     - nono 会给子进程设置 `HTTPS_PROXY`、`HTTP_PROXY`、`NODE_USE_ENV_PROXY=1`、`NO_PROXY=localhost,127.0.0.1`、`NONO_PROXY_TOKEN`、`NONO_CAP_FILE`，以及对应的小写变量。
     - Node `fetch` 与 `curl` 访问 `example.com` 成功；访问 `github.com` 时 curl 收到 CONNECT 403，Node 报 “Request was cancelled”。
     - 去掉代理变量直接连接也会被拦。读 `~/.ssh` 失败，写临时根目录以外失败。
  2. **`127.0.0.1` 上的服务必须显式放行端口。**
     - 原因：`NO_PROXY` 让 Node 对本机地址直连，不经过代理。
     - 把 `127.0.0.1` 或 `localhost` 写进白名单不起作用。
     - 能放行的写法：macOS 用 profile 的 `network.open_port: [port]`（或 `--open-port`）；Linux 权限清单用 `network.ports.localhost: [port]`（`ports.connect` 无效）。
     - 因此契约要加“本机端口”：模型连接的 `baseUrl` 指向本机时由 Host 推出端口。集成测试的假模型服务也按这条路径放行，不需要为测试放宽生产策略。
  3. **上游代理只能用 profile 模式。**
     - profile 的 `network.upstream_proxy` 在 macOS 与 Linux 上都生效：假 CONNECT 代理只收到放行域名的连接，不放行的请求根本没有发出去。
     - Linux 权限清单会静默忽略 `upstream_proxy`。`-c` 也不能和任何命令行参数一起用（usage error，退出码 2），所以清单模式没法加 `--upstream-proxy`。
     - 结论：`run` 模式在两个平台都用 profile 模式。Linux profile 用拆分覆盖授权生成 `read` / `read_file` / `allow` / `allow_file`，不写 Seatbelt 规则。实测 Linux profile 模式下读 `~/.ssh` 失败、写临时根目录以外失败、写临时根目录成功。
  4. **进程模型**：
     - supervisor 是进程组长，子进程与它同组。
     - 对进程组发 SIGTERM 后没有残留进程（退出码 143）。只给组长发 SIGTERM 会留下残留进程，所以第一期“对进程组终止”的做法必须保留。
     - 退出码会原样透传（`exit 7` 返回 7）。
  5. **额外耗时**（`/usr/bin/true`，5 次取中位数）：macOS 上 `run` 158ms、`wrap` 45ms；Linux 上 `run` 41ms、`wrap` 7ms。多出来的是代理启动；一次评估只启动一次，可以接受。
  6. **CLI 能在 `run` 里启动**（macOS）：
     - 命令：`nono run … -- node apps/cli/dist/cli.js run --mock --permission-mode full-access --data-dir <root>/data --workspace <root>/workspace --out <root>/out --json`。
     - 可写路径只有临时根目录，耗时约 950ms，退出码 0。
     - 产物：`out/` 下有 `result.json`、`final-response.md`、`trace.jsonl`；`data/` 下有 `harness-artifacts`、`harness-state`。
     - 参数：`run -s --no-diagnostics --no-audit --no-rollback`。不加后两个参数，nono 会往 `~/.nono` 写审计和回滚数据。
  7. **“按选择启动”用 (b)，不改 harness-control。**
     - `HarnessControl.initialize()` 在 `harness-state` 为空时走 bootstrap：调用 `options.builtin()`，经 `validateCandidate` 检查后挂载并激活。这里的 `harness-state` 在候选的临时 dataRoot 里。
     - 所以 agent-runtime 只需在 Host 端口给了固定选择时，让 `builtin` 返回“用 `loadArtifact` 加载选择里的产物”得到的挂载请求，同时不传 `upgradePristineBuiltin`。
     - 启动后检查 `inspect("main")`：没有 `blocked`，并且 `current.executionDigest` 等于选择文件里的 `executionDigest`；任何一项不满足就以明确的错误退出。
     - `executionDigest` 的计算包含 `hostContractDigest`（`harness-mount.ts`），而 bootstrap 会把它换成当前 Host 的值。所以 Host 契约不一致时摘要也会不一致，这一项检查同时覆盖了产物、组合和契约。
     - 为了不覆盖已有的选择，CLI 在 `--harness` 时要求 `--data-dir` 下的 `harness-state` 为空。
     - 选择记录写进临时 dataRoot，标为 Host 的 `trusted-bootstrap`，随临时目录一起删除。授权已在 v1 一侧完成，不经过 `EvolutionApproval`。
     - 需要的改动：`AgentRuntimeHostPort` 加 `pinnedHarness`，agent-runtime-plugin 加载和检查它；harness-control 的 index 导出 `loadArtifact`。不改选择、授权与恢复的语义。
- **计划调整**：
  - 契约：`allowlist` 网络加 `localPorts?: readonly number[]`。nono 写成 profile 的 `open_port`，有它时派生能力 `network.local-ports`（nono macOS / Linux 都为 `full`，Seatbelt 为 `unsupported`）。`HarnessEvaluationHostPort.modelEnvironment` 的返回值加 `localPorts`。
  - nono 后端：`allowlist` 时两个平台都用 `run -s --no-diagnostics --no-audit --no-rollback -p <profile>`，域名、上游代理、本机端口都写进 profile；`wrap` 路径不变。
  - T4 按结论 7 实现。
- **验证**：上述输出来自 `tmp/sandbox-v2-spike/{run-mode,run-mode-2,linux-profile,cli-in-run}.mjs`。

### 步骤 2：T1 管理器的评估模板与契约改动

- **操作**：
  - `types.ts`：Host 沙箱端口加 `inherited?: true`；`allowlist` 加 `localPorts`、`upstreamProxy`，以及预留的 `credentials`；请求与策略加预留的 `limits`；新增四项能力 `network.local-ports`、`network.upstream-proxy`、`network.credential-injection`、`process.resource-limits`；`SandboxManagerConfig` 改为空对象。
  - `policy.ts`：新增 `evaluation` 模板。网络写成 `{ mode: "allowlist", domains: "requested" }`，表示模式最宽到白名单、域名由请求给出；请求没写网络时按 `blocked` 处理。白名单会被规范化（小写、去掉末尾的点、去重、排序），并校验域名、端口、`host:port`。至少要有一个域名或本机端口，否则提示改用 `blocked`。模板若是固定白名单，请求的域名、端口、凭据必须是模板的子集，上游代理必须与模板相同。按需派生新能力。指纹包含 `limits`。
  - `service.ts` / `execution.ts`：继承模式改为读 `host.inherited`。继承模式下 `status("evaluation")` 返回不可用，`run` 一个评估请求返回 `prepare_failed`（`INHERITED_EVALUATION`）。
  - `plugin.ts`：带任何配置都直接抛错。
  - `node-ports.ts`：`createNodeSandboxHostPort({ inherited })`。
  - nono 与 Seatbelt 的能力表先把四项新能力都标为 `unsupported`，nono 在 T2 再改。
- **影响文件**：`packages/sandbox/manager/src/**`，`packages/sandbox/{nono,seatbelt}/src/backend.ts`。
- **验证**：
  - `pnpm --filter @actspace/sandbox test`：30 个通过。新增的用例覆盖评估模板、白名单规范化与非法输入、固定白名单的上限、Host 端口打开继承模式、继承模式拒绝评估、预留能力导致 `prepare_failed`、插件配置被拒绝。
  - 三个沙箱包的 `typecheck` 都通过。
  - `@actspace/sandbox-seatbelt` 7 个测试通过；`@actspace/sandbox-nono` 11 个通过、4 个跳过（没设 `ACTSPACE_NONO_PATH`）；`@actspace/tools-shell-tools` 109 个通过。
  - 仓库里没有任何组合用到插件配置 `mode`。

## 遇到的问题

- 第一版代理实验在代理服务所在的进程里用 `execFileSync` 启动 nono，事件循环被阻塞，代理无法响应，请求一直挂起。改用异步 `execFile` 加每次调用的 `timeout` 后正常。

## 跳过或推迟的事项

- CLI 在 Linux `nono run` 里启动：推迟到 T6，用集成测试在 Docker 里复验。macOS 上构建的 `node_modules` 在 Linux 容器里不一定能直接用，到时按第一期的 Linux 复验方式处理。
