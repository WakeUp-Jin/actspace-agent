# Browser 输出保真 V1 执行计划

## 目标

修复 Browser Use 读取结果在进入模型上下文前被通用截断或摘要的问题：让 `browser_dom.snapshot` 在 50,000 字符预算内逐节点保真，让 `browser_help` 的精确 action schema 在 20,000 字符内完整保留，为 `locator.all_text_contents` / `locator.read_all` 增加分页，并让 `browser_run` 把每一步真实结果按同一输出策略返回给模型。

## 范围

- 包含：
  - `browser_dom.snapshot` 默认返回最多 500 个可见交互节点，硬上限 1000；输出补充 href、节点计数和显式截断信息。
  - DOM snapshot 使用紧凑逐节点文本，50,000 字符内不进入 flash 摘要，超限时只在完整节点边界停止。
  - `browser_help(category, action)` 最多保留 20,000 字符，不进入通用 flash 摘要。
  - `locator.all_text_contents` / `locator.read_all` 支持 `offset` 与 `limit`，默认 limit 200，并返回 total/offset/returned/has_more。
  - `browser_run` 返回每个 action 的真实模型可读结果，并复用 DOM、分页列表、tabs 与短状态结果的格式化策略。
  - 对应 Go/TypeScript 测试、Browser Use 文档和 history。
- 不包含：
  - hover、selector 到 bounding box、scroll API、截图模型路由。
  - 其他 Browser action 的阈值调整。
  - 全局 `toolTruncateThreshold` / `readTruncateThreshold` 调整。
  - Browser 持久化脱敏策略调整。

## 背景

- 相关文档：
  - `docs/design-docs/browser/agent-browser-use-command-surface.md`
  - `docs/design-docs/browser/agent-browser-use-command-implementation.md`
  - `docs/design-docs/model-context/agent-context-compression.md`
- 相关代码路径：
  - `plugins/browser-bridge/apps/cli/internal/locator/runtime.js`
  - `plugins/browser-bridge/apps/cli/internal/commands/registry.go`
  - `plugins/browser-bridge/apps/cli/command_router.go`
  - `packages/agent-core/src/tools/tools/browser/{definition,executor,types}.ts`
  - `packages/agent-core/src/{internal-tools.ts,tools/scheduler.ts}`
- 已知约束：
  - 工作区已有 Browser Session 授权与 cursor 相关未提交修改，重叠文件只做外科手术式增量。
  - Browser 页面输出继续 `redactInPersistence`，当前模型调用可见真实结果，但持久化仍使用占位文本。
  - DOM 与列表结果不能交给通用摘要模型决定删除哪些节点或 item。

## 风险

- 风险：50,000 字符 DOM 输出增加单次模型输入。
- 缓解方式：默认最多 500 节点、单节点文本最多 500 字符、紧凑行格式、只在完整节点边界截断并显式报告。
- 风险：分页改变 `all_text_contents` / `read_all` 返回形状。
- 缓解方式：保留 `values` 字段，新增分页元数据；默认首 200 项，测试覆盖既有调用和分页调用。
- 风险：`browser_run` 返回真实结果后输出变大。
- 缓解方式：逐 action 复用相同格式化与上限策略，不展开截图 base64，不扩大敏感剪贴板结果。

## 里程碑

1. 建立 DOM、help、分页列表和 browser_run 的模型输出契约及复现测试。
2. 修改 Browser Bridge runtime/registry/router，完成节点上限与列表分页。
3. 修改 Agent Core Browser executor 与调度输出策略，完成 50K/20K 保真和 batch 结果转发。
4. 运行 Go、Agent Core 定向测试与 typecheck，更新文档、history 并归档计划。

## 验证方式

- 命令：
  - `go test ./apps/cli/...`（工作目录 `plugins/browser-bridge`）
  - `pnpm --filter @actspace/agent-core exec vitest run src/tools/tools/browser/test/browser-tools.test.ts`
  - `pnpm --filter @actspace/agent-core exec vitest run src/tools/test/output-truncator.test.ts`
  - `pnpm run typecheck`
- 手工检查：
  - 45K DOM 输出完整保留；60K 输出带显式截断元数据且不截断半个节点。
  - browser_help describe 输出不含 `[已压缩摘要]`。
  - read_all/all_text_contents 默认 200 项，offset/limit 可翻页。
  - browser_run 的模型文本包含每一步读取结果，而不只是 action 名称。
- 观测检查：
  - 普通 Browser mutation/status 输出仍保持短小。
  - session/run log 仍遵守 Browser 输出持久化脱敏边界。

## 进度记录

- [x] 确认用户批准范围与 50,000 字符 DOM 上限。
- [x] 完成 Browser Bridge 节点与分页契约。
- [x] 完成 Agent Core 专属输出策略与 batch 转发。
- [x] 完成定向验证、文档和 history。

## 决策记录

- 2026-07-12：DOM snapshot 上限从原提案 100,000 调整为 50,000 字符，避免单次读取过度占用上下文。
- 2026-07-12：不提高全局工具阈值；只为已确认需要保真的 Browser 读取 action 设置专属策略。
- 2026-07-12：列表型结果采用 offset/limit 分页，不用无限提高字符上限。
- 2026-07-12：验证完成；Agent Core 98 个测试文件 798 个测试、Browser Bridge CLI Go tests、Browser registry/extension checks 与 workspace typecheck 全部通过。
