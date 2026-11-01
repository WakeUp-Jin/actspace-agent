# Prompt domain group

为 Context 提供四个独立来源：系统提示词、AGENTS 规则、Skill、动态运行信息。会话与工具来源由 Context 包提供。Prompt 只贡献内容，Context 负责组织和转换，LLM 服务负责真实请求。

`prompt.runtime` 按 Turn 加载规则与 Skill；Agent/Plan 使用用户及工作区 AGENTS，Chat 保留用户规则与自身工具边界。系统 Prompt 可通过 Host `selectSystem` 按模型选择，默认仍使用现有 Agent/Chat 模板。动态信息作为带标记的消息尾部补充，不写入用户 Surface 气泡。

Host `PromptExtensionRegistry` 支持精确 Session/Agent scope 注册，以及明确限定 main Agent 的 Session 注册。英语学习使用后者，跨 Run 保留目标，取消注册即停止新贡献；未声明 Agent kind 的调用不会获得 Session 注册项。生产不再调用 `system-prompt/assemble`，也不发布 `prompt.assembly`。旧 RequestAssembler/contextFromCandidate 只保留库调用及测试兼容，生产 Factory 直接配置 Context sources。

退役条件：只有在 Agent Loop fallback、测试和英语学习 fixture 都直接消费 Context sources，且动态入口与契约矩阵扫描不再出现 `prompt.assembly` 或 assembler import 后，才能删除兼容表面。
