# 工具输出引用与失败反馈修复

状态：实现与自动化验证完成；已安装应用更新、真实 Provider 与 Electron 安装态验收未执行。

## 目标与契约

Bash 超过内联阈值仍是成功的工具执行。保留当前 8,000 字符头部与有界落盘机制，完整文本通过 Session-owned artifact 保存；模型获得明确可读取路径和 read_file/grep 引导。历史只保存带 MIME 的引用，普通文件不得转换为图片；图片仅在 Provider 请求边界读取字节。

## 步骤与验证

1. 补复现测试：真实 Agent Loop 的文本 artifact 下一步、图片工具结果、失败 Journal。先运行并确认失败。
2. 修复输出引用：Core 按 MIME 归一化，Host 按 Session 解析稳定文件路径；读取和搜索仅额外允许本 Session artifact，支持旧 Journal 回放，无需迁移。Desktop 与 CLI 同步。
3. 修复图片 wire：OpenAI 路线保留所有 tool results 后追加视觉观察，Anthropic 保留 tool_result 内图片；普通文件不展开、text-only 模型保留明确元信息。
4. 修复错误：turn/end 保存脱敏 failure，live 和 durable projection 消费同一失败事实，旧 failed 事件显示明确兜底。
5. 验证相关 package 测试、依赖闭包 build、Desktop/CLI 类型、文档门禁。以合成大输出和离线 Provider fixture 证明完整链路；实际已安装版本未被替换，真实 Provider/Electron 为单独验收边界。

## 范围

涉及 core/agent-loop、tools/runtime 与 core-tools、llm/pi-ai、Desktop/CLI Host、固定 renderer projection、对应测试与文档。不修改已有用户会话、不重跑其命令、不提交或更新安装包。保留现有无关工作区变更。

必读：REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、Tool Runtime ABI、Session/Context 设计、历史 Bash 输出设计、FRONTEND_VERIFICATION、HISTORY_GUIDE。操作记录见 exec-runs/20260912-tool-output-references。

## 回退

按本次精确文件 diff 回退。新增字段兼容旧 Journal；不重写已落盘记录，不引入第二套存储。

## 完成证据

- Core 红灯：2 个新增回归在修改前失败；修复后通过，另补缺失历史文件回归。
- Core Agent Loop 13、LLM pi-ai 29、Tool Runtime 18、Core Tools 17、CLI 13、Desktop 670 项测试通过。
- Runtime 依赖闭包构建、Desktop/CLI 类型检查、renderer/Electron/CLI 构建、文档门禁与 diff 检查通过。
- 真实 Bash 3,000 行输出贯穿文件落盘、下一次请求、末尾分页读取和 grep；跨会话读取失败。大于 1 MiB 的受管输出也可搜索。
- 完整执行摘要见 ../../exec-runs/20260912-tool-output-references/execution-summary.md。
