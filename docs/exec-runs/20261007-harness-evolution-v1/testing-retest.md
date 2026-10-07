# V1 追加测试记录

用户要求补写测试并重新运行，委派 gpt-6.1-sol 完成真实 Electron 复验。

## 新增代码

`packages/plugin-manager/src/test/lifecycle.test.ts` 新增一个完整失败路径用例：

1. 创建、构建并准备候选。
2. 拒绝正式启用，断言会话绑定与 main 修订保持不变，旧租约仍无新工具。
3. 丢弃候选，断言候选已释放，再次应用与原工作区重建均被拒绝。

未为本轮测试改动产品实现。

## 本轮实际运行

| 范围 | 通过数 |
| --- | ---: |
| Plugin Manager | 6 |
| HMR | 3 |
| Harness Control | 26 |
| Runtime | 53 |
| 官方 Skill 资源 | 1 |
| Prompt / Skill 发现 | 9 |
| Desktop main Skill 列表 | 1 |
| Composer、slash commands、focus request | 70 |
| 合计 | 169 |

后端命令：`pnpm --filter @actspace/plugin-manager --filter @actspace/harness-hmr --filter @actspace/harness-control --filter @actspace/runtime --filter @actspace/official-skills --filter @actspace/prompt test`。

桌面命令：`pnpm --filter @actspace/desktop exec vitest run src/main/test/fixed-renderer-skills.test.ts`；以及相同入口下三个 `src/renderer/test/composer*.test` 文件。

Manager typecheck、文档检查与 diff 空白检查通过。上述是本轮实际重跑数，其他包上轮记录仍保留，未重复相加。

Runtime 集成测试使用受控 LLM adapter，实际经过正常工具调度、审批、编译、Cordis、会话绑定与恢复；它不证明远端真实模型自主生成代码的成功率。真实桌面验收单独记录。

## 真实 Electron 复验

gpt-6.1-sol 已通过官方 Skill 来源与不可卸载入口检查、Composer 启用后选择、禁用设置在完整进程重启后保持，并恢复启用。未发现明确 GUI Bug。未连接模型，真实模型工具闭环未覆盖。逐项证据见 [Computer Use 复验](computer-use-retest.md)。
