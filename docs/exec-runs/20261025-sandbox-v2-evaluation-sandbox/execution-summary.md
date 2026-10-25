# 沙箱第二期：评估沙箱 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-sandbox-v2-evaluation-sandbox.md`
- **执行过程**：`docs/exec-runs/20261025-sandbox-v2-evaluation-sandbox/execution-process.md`
- **执行模式**：交互
- **执行结果**：T0–T8 完成，分支 `feat/sandbox-refactor`，每个任务一个提交，未推送。第二期没有界面改动；没有任何 Host 装配评估服务，入口留给自进化 V2。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 评估模板与白名单契约 | `packages/sandbox/manager/src/**` | `purpose: evaluation` 模板；`allowlist` 网络（域名、`localPorts`、`upstreamProxy`），规范化与校验；新能力 `network.local-ports`、`network.upstream-proxy`；预留 `network.credentials`、`limits`（后端报告 `unsupported`）；继承模式改读 Host 沙箱端口 `inherited`，插件配置 `mode` 移除；继承模式下拒绝评估 |
| nono `run` 模式 | `packages/sandbox/nono/src/{backend,config}.ts` | 白名单时 `run -s --no-diagnostics --no-audit --no-rollback -p <profile>`，两个平台都用 profile；去掉调用方的代理变量；评估用途排除系统写入组；只有本机端口时写成 `block` 加 `open_port` |
| Seatbelt 能力表 | `packages/sandbox/seatbelt/src/backend.ts` | 新能力都报告 `unsupported` |
| CLI `--sandbox-inherited` | `apps/cli/src/**`、`packages/agent-host/src/node-ports/tool-host-services.ts`、`packages/runtime/src/startup/sandbox-status.ts` | 参数写进 Host 沙箱端口；`--mock` 也提供沙箱端口；诊断文案 |
| CLI `--harness` | `packages/runtime/src/harness/*`、`packages/runtime/src/startup/boot.ts`、`packages/harness-control/src/index.ts`、`apps/cli/src/runtime-v2/*` | 按选择文件启动（`loadArtifact`，不升级内置组合）；挂载不符以 `HARNESS_SELECTION_INVALID` 退出码 3 结束；要求 dataRoot 无选择历史；结果报告实际运行的 Harness |
| `harness-evaluation` 包 | `packages/harness-evaluation/**` | `harness.evaluation` 服务：临时目录、复制产物与工作区、在评估沙箱里跑 CLI 候选、读取并校验结果、删除临时目录；不在默认组合里 |
| Host 评估端口 | `packages/agent-host/src/node-ports/harness-evaluation.ts` | `createNodeHarnessEvaluationHostPort`；模型连接变量推出白名单域名、本机端口与上游代理；`resolveEnvModelProvider` 从 CLI 移来共用 |
| 生成物与文档 | 契约矩阵、沙箱设计、执行安全入口、`packages/README.md`、`docs/RELIABILITY.md`、自进化目录、学习文档 | 登记新包；文档改为当前行为 |

## 人工验证指引

### 必须验证

1. **评估集成测试在你的机器上通过**
   - 验证方式：`pnpm sandbox:fetch-nono`（已有可跳过），`pnpm --filter "@actspace/agent-cli..." build`，然后 `pnpm --filter @actspace/harness-evaluation test`。
   - 预期结果：15 个通过、0 个跳过。跳过 5 个说明没找到 nono 或 CLI 没构建。

2. **决定工具沙箱是否也排除系统写入组**
   - 现状：第一期工具沙箱里的 bash 能写 `/tmp`，macOS 上能写整个 `/private/var/folders`（本用户所有应用的临时目录）。
   - 排除后：bash 只能写工作区、输出目录与 scratch；把临时文件写到 `/tmp` 的工具可能失败。
   - 这会改变第一期行为，Agent 没有擅自修改，等你决定。

### 建议验证

1. **第一期工具沙箱不受影响**
   - 验证方式：按[第一期执行摘要](../20261025-sandbox-v1-tool-sandbox/execution-summary.md)“必须验证 1”在 Desktop 里跑一遍。
   - 预期结果：与第一期相同。第二期只在 `allowlist` 网络与 `evaluation` 用途上改了 nono 后端，工具沙箱的 profile 没变（Agent 已用 Host 端到端脚本复跑确认）。

2. **用真实模型跑一次评估**
   - 验证方式：参考 `packages/harness-evaluation/src/test/integration.test.ts`，把假模型换成真实的 `LLM_PROVIDER` / `<P>_BASE_URL` / `<P>_API_KEY`（需要代理时加 `LLM_PROXY_URL=http://127.0.0.1:7897`）。建议用单独的、设了额度上限的 key。
   - 预期结果：`status: completed`；候选只能连模型服务的域名。

## Agent 已完成的验证

- 全仓：`pnpm check:packages`（65 个包）、`pnpm check:desktop-build-graph`（59 个项目）、`pnpm test:contract-matrix`、`pnpm typecheck`、`pnpm test`（61 个包）通过。
- 包测试：sandbox 30、sandbox-seatbelt 7、sandbox-nono 23（含真实 nono）、harness-evaluation 15、agent-host 61、CLI 16、runtime 84、harness-control 28、shell-tools 109。
- 真实 nono + 真实 CLI 候选 + 本机假模型（macOS）：候选完成，Bash 为 `inherited`，副本可写，原工作区（`EPERM`）、HOME、其他临时目录不可写，白名单外域名不可达，v1 的环境变量没有传入，临时目录已删除；摘要不符以退出码 3 拒绝；产物缺失时不启动；超时后无残留进程。
- Linux（Docker `node:22 --init`，arm64，Landlock V6）：同样的检查 12 项通过，另加 `/tmp` 不可写；T2 的 `run` 模式检查 5 项通过。
- 第一期 Host 端到端（nono）复跑：工作区写入成功，`~` 下写入失败，后台任务停止后没有残留进程。

## 已知风险和遗留事项

- **没有 Host 装配评估服务**：第二期只有包、Host 端口和测试。Desktop 打包版不带 CLI，入口随自进化 V2 一起做（E13）。
- **Desktop 产生的选择在 CLI Host 下评估**：只有 Desktop 才有的条目（如 `browser-tools`）会无法挂载。留给 E13 与自进化 V2。
- **密钥在候选里可读**：通过环境变量传入（E5）。契约已预留 `network.credentials`，以后改由 nono 反向代理注入。建议评估用单独、设了额度上限的 key。
- **资源上限**：nono 做不了内存、CPU 时间上限，报告 `unsupported`；只有 10 分钟超时。
- **工具沙箱的系统写入组**：见“必须验证 2”。
- **Docker 里测 Linux**：virtiofs 挂载与 Landlock 不兼容，要把仓库复制进容器；要加 `--init` 回收僵尸进程。只影响测试环境。
- **nono 升级**：空 `allow_domain`、系统写入组这类默认行为可能变化；升级后重跑 sandbox-nono 与 harness-evaluation 的真实测试。

## 后续建议

- 自进化 V2：用例与打分（在沙箱外）、评估通过才允许 apply、打包版入口、Desktop 选择的 Host 兼容。
- 凭据注入：用 nono 反向代理替代环境变量传 key。
- 第三期：Windows 原生后端。
