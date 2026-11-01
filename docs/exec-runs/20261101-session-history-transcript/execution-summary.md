# 会话记录 Markdown — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261101-session-history-transcript.md`
- **执行过程**：`docs/exec-runs/20261101-session-history-transcript/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成（代码、测试、文档完成；Electron 未验证）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 新插件包 | `packages/session/transcript/` | 每轮结束写 `sessions-v2/<id>/transcript.md`；主会话注入 `<session-history>` 提示词 |
| 读路径放行 | `packages/tools/runtime/src/permission/engine.ts`、`prepared-execution.ts`、`packages/runtime/src/harness/agent-factory-plugin.ts` | 读 transcript 不弹工作区外审批；`sessions-v2` 目录不放行 |
| 默认组合 | `packages/runtime/cordis.yml`、`src/profiles/composition.ts`、三个 `package.json`、`tsconfig.build.json`、契约矩阵 | 插件进入默认 Harness |
| 文档 | 设计文档、计划、存储 / 权限 / 包 README、索引、历史 | 同步当前事实 |

## 人工验证指引

### 必须验证

1. **transcript 生成**
   - 验证方式：Electron 新建会话发一轮，打开 userData 下 `sessions-v2/<id>/transcript.md`。
   - 预期结果：有标题、会话信息、用户和助手正文、工具一行结果；没有 reasoning。
2. **按 ID 读取不弹审批**
   - 验证方式：另开会话说“看看会话 <id> 聊了什么”。
   - 预期结果：Agent 用读文件工具读 transcript，没有审批卡；回答注明会话和 `[#N]`。
3. **按描述查找**
   - 验证方式：说“上次聊 xxx 的那个会话”。
   - 预期结果：Agent 在 `sessions-v2` 里搜 `transcript.md`，弹一次工作区外审批，批准后找到会话。
4. **子 Agent、侧边对话、压缩**
   - 验证方式：各触发一次后看父子 transcript。
   - 预期结果：父会话有子会话 / 侧边对话的链接行；压缩处有分隔线和摘要。
5. **Journal 仍受保护**
   - 验证方式：让 Agent 读同目录 `journal.jsonl`。
   - 预期结果：弹工作区外审批。

