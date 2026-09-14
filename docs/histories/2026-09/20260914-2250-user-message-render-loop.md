## [2026-09-14 22:50] | Task: 修复纯文本发送后的渲染循环

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6
- Runtime: Codex desktop

### User Query

> 新会话点击发送也会卡死，先采样确认根因，再修改。

### Changes Overview

- `UserMessage` 的缺省附件集合使用稳定引用；没有待加载图片时不启动异步恢复。
- 只有新的预览内容才更新状态，空结果和相同结果保持原引用。
- 增加桌面桥接存在时，缺省附件和空数组两种纯文本消息的有界提交回归测试；保留图片恢复测试。
- 清理 App、Composer 和 main 中本次排障的临时诊断输出，保留已有其他业务变更。

### Design Intent

根因是附件恢复 effect 依赖每次新建的空数组，完成后又无条件创建新的预览状态。首次纯文本消息即可触发循环，与历史大小和模型输出频率无关。纯文本测试缺少桌面桥接，原图片测试又只覆盖非空附件，因而漏检。

### Verification

- 红：修改组件前，新回归测试分别得到 20 次（保护性截停）和 3 次提交，均失败。
- 绿：UserMessage、Composer、工具活动组共 63 项测试通过；发送、流式转持久化、附件传递等定向测试 7 项通过。
- Desktop renderer/main TypeScript 检查通过。
- 修复前真实 Renderer CPU 约 311%，进程采样内存约 1.5GB；修复后恢复历史会话，启动约两分钟时 Renderer CPU 0%，RSS 约 99MiB。这是不同阶段的进程观测，不是统一基准测试。
- `pnpm dev:log` 启动真实 Electron 后，历史消息可恢复、新会话可打开、输入框可填写且发送按钮启用；运行约十分钟时 Renderer CPU 0%、RSS 约 86MiB。发送后的完整实机闭环仍待用户确认。
- Renderer 生产构建、`pnpm check:docs`、`git diff --check` 通过；构建保留既有大 chunk 提示。
- 同类检查：消息组件中的 transcript 空数组只用于 state 初始化，effect 依赖原始属性；产物收集中的空数组只用于有限遍历，未发现相同反馈循环。

### Files Modified

- `apps/desktop/src/renderer/components/messages/UserMessage.tsx`
- `apps/desktop/src/renderer/test/user-message.test.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/main/index.ts`

学习记录：[React 空数组 effect 循环](../../learnings/2026-09/20260914-react-empty-effect-loop.md)。
