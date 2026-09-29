# 验收缺陷修复结果

已修复并定向验证，未提交。

| 验收点 | 结果 |
|---|---|
| B01 越界工具拒绝后继续 | 自动化通过：Chat调用被拒绝、执行计数0、结果完整、下一轮成功；混合合法/未知工具整批拒绝。真实模型的新越界调用未强制产生，不将其写成CU通过。 |
| B02 旧孤立工具调用历史 | 自动化通过；CU原失败会话真实模型返回CHAT_RECOVERED_AFTER_FIX。旧Journal不改写，请求投影明确说明无记录结果，不能推定执行成功。 |
| B03 子Agent检查点 | 自动化登记/flush/释放通过；CU调用Explore和agent均完成，各1次read_file，durations 4285/3468ms，见JSON。此次两者均从Agent模式调用，Plan入口未再次单独执行。 |
| B04 子会话恢复 | 自动化已有索引补读与delegation投影通过；旧3个异常会话提示消失；CU重启后打开新子会话内容正常。 |
| B05 字体预览 | CU中英数字/代码样例可读；字号增减可用并恢复；SettingsPage既有测试通过。 |

## 验证命令

- `pnpm --filter @actspace/core-agent-loop test`：23通过。
- `pnpm --filter @actspace/runtime test`：36通过。
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/settings-page.test.tsx`：28通过。
- `pnpm --filter @actspace/subagent test`：10通过。
- Runtime依赖闭包build、Runtime build、Desktop renderer/Electron build通过；Desktop、Runtime、core-agent-loop typecheck通过。
- 新增Chat两例、子活跃登记/读取、旧索引遗漏均观察过修改前失败；不是只运行绿色测试。

原始验收报告是修复前快照，未覆写。启动IPC竞态、图片服务Connection error未证实根因，保持待调查；Chrome及原A01–A25未覆盖项不因本次修复而通过。子会话当前作为New chat出现在列表，沿用现有浏览行为；是否隐藏或提供专用只读入口属于后续产品决策。

## 第二轮：启动屏障与跨会话缓存

用户确认仅修启动竞态和文件缓存跨会话误命中，图片错误与 Chrome 覆盖后置。此前启动问题待调查状态由本节更新。

| 验收点 | 结果与证据 |
|---|---|
| C01 旧产物不能跳过本轮构建 | 通过：真实 dev orchestrator 进程测试先失败退出91，修复后按 build-start → build-done → launch 通过；真实 dev 日志中 build:electron 成功先于 dev-runtime。 |
| C02 构建失败阻断启动 | 通过（自动化）：注入构建退出23，启动器传播23，未启动后续阶段；修复前错误启动。 |
| C03 首次窗口与模式切换 | 通过（CU）：真实 pnpm dev:log 首次打开；Plan 创建并调用成功，已有会话移除 Plan → Chat → 移除 Chat 恢复 Agent。工作区/权限入口随模式隐藏恢复，日志无缺 handler 错误。 |
| C04 跨会话首读与缓存语义 | 通过：CU 两个独立会话分别首次读取同一文件，force=false，各仅1次调用，界面均显示正文；[工具证据](cache-session-verification.json)。同会话缓存命中与 force=true 由自动化验证。 |

验证：dev runner 7通过/1跳过（环境未提供 npm_execpath，既有 pnpm 外层进程测试跳过）；filesystem-read 5通过；filesystem-read 与 desktop typecheck、dev 依赖及 Electron 构建、renderer build 通过。三个新增回归检查均观察过修改前失败。

边界：该启动屏障适用于 pnpm dev/dev:log；内部 dev:electron:run 仍要求调用者先构建。未扩展 main 热重启机制。同会话上下文压缩后的缓存语义未在本轮修改或验证。Chromium 隔离目录磁盘缓存有告警，但本轮启动和读取实际成功。
