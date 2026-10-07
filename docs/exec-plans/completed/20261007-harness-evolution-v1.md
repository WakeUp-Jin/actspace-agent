# Harness 自进化 V1 实施计划

状态：实施完成，自动化与构建通过；真实模型验收未覆盖，真实桌面覆盖见执行摘要。用户已批准 V1 并要求创建分支实施；分支 `codex/harness-evolution-v1`。执行模式：交互模式，按本轮批准范围连续实施。

## 目标与范围

用户在 Agent 模式提出新增/修改工具，生成固定产物，提交会话局部分支；当前 Run 保持旧租约，下一条消息使用新版本。交付官方插件开发 Skill、Manager、HMR 与恢复。不实现自动续跑、失败自动触发、评估沙箱和 Actor 身份。

必读：仓库 AGENTS、REPO_COLLAB_GUIDE、ARCHITECTURE、CODING_BEHAVIOR、agent-testing、自进化设计 05–09。执行证据见 ../../exec-runs/20261007-harness-evolution-v1/。

## 具体契约与顺序

1. **官方资源**：新增 `packages/official-skills`，交付 `actspace-plugin-development/SKILL.md`、单文件 TypeScript 工具模板与契约。扩展 `packages/prompt/src/skills/discovery.ts`、host-context，以及桌面 fixed-renderer-skills；官方来源最后扫描，沿用已有禁用设置，以 id 判断遮蔽；资源使用 package files 发布，正文按需加载。
2. **版本底座**：扩展 `packages/harness-control/src/service.ts` 的 prepareBranch，来源必须匹配确定的 revision/digest，目标为空分支；activate 时重新检查来源。补齐仅针对未定制 bootstrap 的内置升级，保留历史；扩展 `packages/boot/src/harness-generations.ts` 允许在仍有租约时取得指定 generation，用于父 Run 的子任务。
3. **HMR**：新增 `packages/harness-hmr`，Host 生命周期实例，按会话串行提交；持久意图→Control 选择→绑定，文件通过临时文件、sync、rename 发布。会话 identity 使用摘要映射文件名，绑定含 branch/revision/digest；恢复未提交意图保持旧绑定，已提交意图补齐绑定。新 Run acquire 与提交共用会话闸门。授权通过 Host 可信回调，模型不能自报授权。
4. **Manager**：新增 `packages/plugin-manager`，提供 inspect、create、build、prepare、apply、status、discard、rollback。工作区绑定调用 session、来源 Run 和基线，源码固定快照后以 TypeScript 编译 API 构建（随依赖交付，无外部安装脚本）。V1 首个模板是单个 JSON 输入/输出工具，元数据 tool.json 与 implementation.ts 分离，固定 wrapper 托管注册与释放。支持新增、修改本模块生成的工具；未交付源码的内置插件明确不可编辑。注册工具固定经过 process 执行能力与权限链，不能靠模型填写 effects 降低权限。
5. **Runtime 接入**：默认 Harness 增加 Manager 工具代理条目，Host 在 agent runtime 中持有 Manager/HMR。`managed-runs.ts` 按 session 在每次 acquire 解析绑定；普通执行、compact、能力查询及子任务使用正确会话/父 Run generation。`agent-factory-plugin.ts` 传递真实 Run 身份，管理接口通过运行上下文确定 session；初始化与启用分别核验 Host 执行许可，不改生产默认为无条件授权。
6. **交付与验证**：更新默认 Harness 构建、workspace 依赖、桌面资源/构建图及必要协议。现有通用工具结果展示准确的 build/ready/bound 状态，无需新创造模式。同步现行设计、history、执行记录及学习文档。

## 验证

- Control：首次分支不改 main、来源竞争、旧租约不变、恢复和回退。
- HMR：选择提交后绑定写入故障恢复、重复请求/冲突、取消、会话隔离、损坏时拒绝准入。
- Manager：真实构建/挂载/执行，复制修改、不可变产物、源码丢失拒绝、语法/schema 错误、越权 session、准备前许可与激活授权、清理。
- Runtime：同会话旧 Run/新 Run、会话隔离、子任务版本、停止，无自动任务生成。
- Skills：无 checkout、官方资源读取、同 ID 遮蔽、禁用、安装版资源保留。
- 命令：`pnpm --filter @actspace/runtime... build`；改动包定向 vitest；Desktop typecheck/build；`pnpm check:docs`、`pnpm check:packages`、`pnpm check:desktop-build-graph`、`git diff --check`。
- 真实 Electron 交互依仓库规则委派 gpt-6.1-sol，逐项报告 Skill 发现、管理工具回执、新消息使用和停止；模型或应用入口不可用如实记录，不以静态检查代替。

## 风险与回退

同进程候选不是沙箱，必须有初始化执行许可；V2 独立评估不混入 V1。旧安装版缺少资源时明确失败。关闭管理入口保留已发布产物和选择，回退走 Control；不清理用户数据。不引入新外部账号或密钥，真实模型验证沿用现有配置。

## 进度

- [x] 创建分支并核对已批准范围。
- [x] 官方 Skill 与资源发现。
- [x] Control / HMR 版本与绑定。
- [x] Manager 构建和工具面。
- [x] Runtime、桌面与制品接线。
- [x] 定向测试、回归、文档与交付；真实模型未覆盖单列。
