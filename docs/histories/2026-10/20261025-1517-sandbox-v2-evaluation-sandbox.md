## [2026-10-25 15:17] | Task: 沙箱第二期：评估沙箱

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

按[第二期计划](../../exec-plans/completed/20261025-sandbox-v2-evaluation-sandbox.md)实现评估沙箱：自进化产生的候选 Harness 整体放进 nono `run` 里跑，只能写本次评估的临时目录、只能连模型服务；继承模式改由 Host 告知；加一个最小使用方把路径跑通，打分与接入 apply 留给自进化 V2。

### 变更与动机

- **管理器**：`evaluation` 模板与 `allowlist` 网络（域名、本机端口、上游代理），预留凭据注入与资源上限。继承模式从插件配置移到 Host 沙箱端口的 `inherited`：插件配置属于 Harness 组合，候选组合可以带上它，在普通 App 里关掉工具沙箱。
- **nono 后端**：白名单时改用 `nono run`，两个平台都用 profile 模式（Linux 权限清单会静默忽略上游代理）。本机服务要单独放行端口，因为 nono 设置的 `NO_PROXY` 让本机地址直连。
- **CLI**：`--sandbox-inherited` 写进 Host 沙箱端口；`--harness <选择文件>` 按指定选择启动，失败以退出码 3 结束、不回退。`executionDigest` 改为可选，因为它绑定 Host 契约，Desktop 与 CLI 不同。
- **`packages/harness-evaluation`**：`harness.evaluation` 服务准备临时目录、复制产物与工作区，在评估沙箱里启动 CLI 候选，退出后读取并校验结果文件，最后删除临时目录。agent-host 提供 Host 评估端口，模型环境变量解析与 CLI 共用一份。
- **集成测试发现的 nono 默认行为**：profile 默认的系统写入组让候选能写所有临时目录（原工作区也在其中）；空的 `allow_domain` 让网络完全放开。评估沙箱排除系统写入组，只有本机端口时写成 `block` 加 `open_port`。候选的 HOME 保持真实 HOME（只读），因为 nono 拒绝覆盖 `~/.nono` 的可写目录。

### 验证与边界

- `pnpm check:packages`、`check:desktop-build-graph`、`test:contract-matrix`、`typecheck`、`test` 通过；harness-evaluation 15（含真实 nono + 真实 CLI 候选 5 个）、sandbox-nono 真实测试 23、CLI 16、agent-host 61。
- Linux Docker（Landlock V6）复现集成测试 12 项通过；第一期 Host 端到端复跑结果不变。详见[执行摘要](../../exec-runs/20261025-sandbox-v2-evaluation-sandbox/execution-summary.md)。
- 未做：没有任何 Host 装配评估服务；打包版入口、用例与打分、拦住 apply 留给自进化 V2；Desktop 产生的选择在 CLI Host 下评估留给 E13。
- 待用户决定：工具沙箱是否也排除系统写入组（现在 bash 能写 `/tmp`，macOS 上能写整个 `/private/var/folders`）。
- 学习文档：[沙箱的默认值会悄悄放宽边界](../../learnings/2026-10/20261025-sandbox-defaults-widen-silently.md)。
