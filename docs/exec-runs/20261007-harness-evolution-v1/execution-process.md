# 执行过程

- 2026-10-07：用户批准 V1，创建 codex/harness-evolution-v1；保留前轮设计变更。核对现有固定产物、Control、Run 租约和 Skill 发现。安装锁定依赖以恢复测试环境。
- 完成 official-skills、Plugin Manager、HMR package，扩展 Control 首次分支准备；用随包 TypeScript API 构建固定单文件工具，没有 npm 安装路径。
- 接入真实 Run 身份、Host 初始化/启用审批和会话绑定。检查原工具白名单后，补入 Manager 与已提交 evolved 工具；父 Scope 子任务固定父 generation。
- 集成测试覆盖实际编译、Cordis 加载、工具执行、复制修改、回退原基座、主线/会话隔离、持久恢复。补修构建失败误用旧产物、失效候选状态、审批预算暂停和提交后取消语义。
- Runtime 用受控 LLM adapter 经正常工具链执行 create/build/prepare/apply，并在下一条消息实际调用 custom_echo，重建 Cordis/Runtime 后恢复；明确不等同真实模型自主生成验收。
- Desktop 构建与 typecheck 通过。广域 renderer 回归暴露官方资源 URL 被 Vite 资产转换的问题，改为 Node dirname/join 解析；受影响的 44 项测试复验通过，其余 626 项首轮通过、1 项原有跳过。
- CLI 生产制品打包后，在脱离 checkout 的目录读取资源、编译并执行模板成功。真实 Electron 使用隔离目录与独立端口，按 AGENTS 委派 gpt-6.1-sol 逐项验收；结果另记。
- 补查既有安装：固定选择不会自动获得新工具。增加仅匹配单条可信 bootstrap、无分支且缺少 Manager 的内置升级条件；自定义选择不自动替换。Control 测试覆盖升级保留历史与拒绝覆盖自定义选择。

- 用户要求追加测试与 Computer Use 复验：新增 Manager 拒绝正式启用及丢弃候选的回归用例；六个相关后端包 98 项通过，Desktop main Skill 测试 1 项通过，Manager typecheck 通过。桌面仍使用隔离测试目录，委派 gpt-6.1-sol 补验 Composer 与重启持久化。
- Composer 三个相关测试文件共 70 项通过。本轮重跑总计 169 项（后端 98、Desktop main 1、Composer 70）；未把上轮通过数量相加作为本轮结果。

- 真实模型验收：gpt-6.1-sol 操作 Electron，deepseek-flash 自主开发 ordered_unique_strings；正式审批后 bound，currentRunUnchanged=true，下一用户消息实际返回 [a,b,c]。过程中发现并修复目录/通用工具审批按钮缺失，新增红转绿回归测试，详细证据见 real-model-acceptance.md。
