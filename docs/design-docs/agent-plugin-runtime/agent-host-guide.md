# 独立 Agent Host（P4 首版）

Host 在服务器持有 Session、任务、审批及 Provider 凭据。Desktop Main 通过 WSS 或系统 SSH 隧道连接；网络断开不取消任务。手机前端尚未实现。完整交付门禁见 [P4 计划](../../exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md)及[过程记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-4-process.md)，P4 首版 T1–T7 已验收，证据见 [第十轮复验](../../exec-runs/20261003-agent-harness-host-refactor/phase-4-cu-round10.md)。本地夹具不代表用户云部署或外部 Provider 已验证。

## 启动

先构建：

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/agent-cli build
node apps/cli/dist/cli.js host init --config /absolute/path/host.json
```

编辑生成的配置，指定已存在的工作区、独立 dataRoot、Provider 地址、模型及凭据环境变量名。相对路径以配置文件目录为基准。凭据由启动进程的环境提供；配置里不写 key，Host 不自动读取仓库 `.env`。

```sh
node apps/cli/dist/cli.js host check --config /absolute/path/host.json
node apps/cli/dist/cli.js host serve --config /absolute/path/host.json
```

默认回环端口 4317。公网直接监听必须配置 TLS cert/key；WSS 地址以 `/rpc` 结尾。也可保持回环监听，通过既有 SSH 配置别名转发。Desktop 不接受未知 SSH 指纹，不忽略证书错误，不转发 SSH agent。

开发测试可在 `serve` 命令显式添加 `--mock`。它仍使用真实 Host、持久化和网络协议，但不证明真实 Provider 可用。

## 配对与管理

另一个服务器终端、同一 OS 用户下运行：

```sh
node apps/cli/dist/cli.js host status --config /absolute/path/host.json
node apps/cli/dist/cli.js host pair --config /absolute/path/host.json
node apps/cli/dist/cli.js host devices --config /absolute/path/host.json
node apps/cli/dist/cli.js host revoke --config /absolute/path/host.json --device DEVICE_ID
```

配对码有效十分钟且只用一次。Desktop 设置的“远端 Host”页填写名称、WSS 地址或 SSH 别名、配对码。token 在 Main 使用 safeStorage 加密保存，不交给 renderer；Host 仅持久保存 hash。移除 Desktop 连接不会停止 Host；要吊销设备权限需执行服务器 revoke。

重复添加已连接的 Host 会在消费配对码前按 HostId 拒绝。连接变化会刷新会话列表与标签；移除后当前已显示会话仍绑定原远端，位置显示“远端 · 未连接”。这些修复的工程证据与交互复验门禁见 [B1–B6 修复记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-4-bug-fixes.md)。

新会话选择运行位置与 Host 发布的工作区、模型；会话创建后归属固定。统一列表显示本地及远端会话，服务器标签用于区分。远端不提供本机 Terminal、Git Review 或本机浏览器转发。Desktop 侧的运行目标、能力表、未就绪原因和远端会话的本地记录见[执行上下文规范](../frontend/front-workspace-git-worktree-context.md)「运行目标（本机与远端）」一节。

## 文件与断线

点击发送后才上传附件。分块及整体 hash 校验通过后接纳任务。Desktop 保存已尝试提交的 submissionId 和附件引用；重试继续使用同一身份。不会把新输入存为后台离线发送队列。单个文件上限 20 MiB、每次最多 10 个文件且合计不超过 50 MiB；明确超限拒绝会保留草稿供修改，不作为未知提交重试。

远端结果按 Session 所有权下载，工作区文件先固定快照。保存到 Mac 需要用户选路径，现有文件不自动覆盖。Agent 模式的“图片与文件”可选择普通文件。图片和有限大小文本可安全预览，其余文件下载；HTML/SVG 不作为活动网页打开。

断线期间保留已显示历史与草稿。发送、停止和审批在离线时禁用，草稿仍可编辑。完整重连、异常上传和大输出场景仍以验收记录为准。

历史分页在预算允许时保留完整轮次；超大单轮可分成片段，没有对应用户消息的片段不显示整轮用量和工作时长。加载更早消息后恢复完整展示。

## 停机

```sh
node apps/cli/dist/cli.js host stop --config /absolute/path/host.json
node apps/cli/dist/cli.js host stop --config /absolute/path/host.json --force
```

普通停机停止接纳和领取新任务，等待现有 Run、子任务、审批和后台 shell 收尾。显式 force 请求取消并设置十五秒进程退出上限。下次启动不恢复 Loop 内存，已有队列保持暂停。不要删除 dataRoot 中的会话、Harness、设备及 artifact 数据来代替停机。

部署可参考 [systemd 示例](actspace-host.service.example)。示例不自动安装；路径、用户、环境文件均需按服务器调整。已在 Linux ARM64 容器内解压的 CLI 产物上验证独立 Host、审批、Shell、文件结果和维护重启；systemd 安装及真实云端部署尚未验证。

## 可运行验证

```sh
pnpm --filter @actspace/agent-host test
pnpm test:agent-host:process
pnpm test:agent-host:protocol
```

协议测试使用独立测试证书和隔离 sshd，不修改系统 SSH 信任。真实 SSH 测试要求 `/usr/sbin/sshd` 可用，日常 Desktop 单测默认跳过，需要专用命令显式启用。

## 架构与验证依据

内部装配、依赖与退出职责见[总体架构](agent-target-overall-architecture.md#独立-host-装配与退出)。P1–P5 与最终收尾已完成批准范围，当前验证结论见[最终结算](../../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)。
