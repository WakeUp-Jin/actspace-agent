# Browser Locator Runtime 自研重写执行计划

## 目标

在 `plugins/browser-bridge` 内重写一套 ActSpace 自有的页面 Locator Runtime：不复制 Codex bundle、不依赖 Playwright 运行时，通过结构化 Locator、页面内 DOM/ARIA 语义、自动等待与 actionability 检查，为文本模型提供稳定的元素定位和真实 CDP 交互能力。

## 范围

- 包含：
  - 将页面 Runtime 源码拆为可维护的 TypeScript 模块，构建为单一 JavaScript 产物并通过 `go:embed` 进入 Browser Bridge 二进制。
  - 保留既有 CSS `selector` 输入，并增加 `css`、`role`、`text`、`label`、`placeholder`、`test_id` 结构化 Locator。
  - 按 WAI-ARIA/HTML 语义实现隐式 role、accessible name、label 和 placeholder 匹配。
  - 遍历 open Shadow DOM；支持同源 Frame path，并为跨域/OOPIF Frame 建立 Go/CDP execution-context 路由。
  - 实现 strict match、可见、启用、可编辑、稳定、viewport、hit-test/receives-events 检查。
  - 实现页面内轮询和 Go 外层导航/context-destroyed 重试，错误必须返回可诊断的结构化原因。
  - 保留现有 CUA/CDP 真实鼠标、键盘和滚动执行，不使用 DOM `click()` 代替用户输入。
  - Agent 默认 `maxTurns` 从 50 调整为 200；达到上限时返回明确失败终态，不伪装为 completed。
- 不包含：
  - 复制或加载 Codex 私有 Browser Client bundle。
  - 引入 `playwright` / `playwright-core` 作为产品运行时依赖。
  - 向模型暴露任意 `Runtime.evaluate` 或任意 JavaScript 执行能力。
  - 在 Chrome Extension 中重新承载高层 Locator 业务逻辑。
  - 承诺与 Playwright 私有 selector 字符串逐字节兼容；ActSpace 以结构化 Locator AST 为事实契约。

## 背景

- 相关文档：
  - `docs/design-docs/agent-browser-use-index.md`
  - `docs/design-docs/agent-browser-use-integration-design.md`
  - `docs/design-docs/agent-browser-use-command-implementation.md`
  - `docs/RELIABILITY.md`
  - `docs/SECURITY.md`
- 相关代码路径：
  - `plugins/browser-bridge/apps/cli/internal/locator/`
  - `plugins/browser-bridge/apps/cli/internal/commands/`
  - `plugins/browser-bridge/apps/cli/command_router.go`
  - `plugins/browser-bridge/apps/chrome-extension/src/background.js`
  - `packages/agent-core/src/tools/tools/browser/`
  - `packages/agent-core/src/engine/loop.ts`
- 已知约束：
  - Browser Bridge 是独立 Go 模块，发布产物不能要求用户安装 Node。
  - TypeScript 只用于开发构建；生成的 Runtime JavaScript 必须提交并嵌入 Go 二进制。
  - 页面导航、Frame 切换和 execution context 销毁后必须可重新注入。
  - 当前工作区已有未提交 Agent Loop 修改，`maxTurns` 改动必须在其上最小合并，不能覆盖现有变更。

## 风险

- 风险：Accessible Name 规则复杂，早期实现可能与浏览器无障碍树存在边界差异。
  - 缓解方式：以结构化 fixture 覆盖 `aria-labelledby`、`aria-label`、`label[for]`、隐式 label、按钮文本、图片 alt 和隐藏节点，并为未覆盖分支返回诊断信息。
- 风险：页面主世界可能覆盖 Runtime 或 monkey-patch DOM API。
  - 缓解方式：先保持当前注入链路兼容，随后使用 `Page.createIsolatedWorld` 按 Frame 注入，并校验 runtime version/build hash。
- 风险：跨域 iframe/OOPIF 不能通过页面 JS 的 `contentDocument` 访问。
  - 缓解方式：Go 层维护 Frame/execution context，Extension primitive 增加 session-scoped CDP 转发；页面 Runtime 只处理单个 context 内的 DOM。
- 风险：自动等待掩盖真实 selector 错误或产生长时间空转。
  - 缓解方式：统一 deadline、100ms 级页面轮询、Go context 取消，并在超时错误中返回最后一次 match/actionability 状态。
- 风险：生成产物与 TypeScript 源码漂移。
  - 缓解方式：新增确定性构建脚本和 `--check` 模式，纳入 `pnpm check:browser`。

## 里程碑

1. 建立 TypeScript Runtime 构建、嵌入、版本/hash 校验和现有 CSS 行为回归测试。
2. 实现结构化 Locator、accessible name、role/label/placeholder/text/test-id、open Shadow DOM 和自动等待/actionability。
3. 扩展 Go command schema/router、Agent Core schema，并实现 Frame/execution-context 路由与跨导航重试。
4. 调整 `maxTurns=200` 和 exhaustion 终态，补充 Agent Loop 回归测试。
5. 完成 jsdom、Go、registry、Agent Core、真实 Chrome acceptance 分层验证，更新设计文档、history 和 learning。

## 验证方式

- 命令：
  - `node scripts/build-browser-locator-runtime.mjs --check`
  - `node scripts/test-browser-locator-runtime.mjs`
  - `cd plugins/browser-bridge/apps/cli && GOCACHE=/private/tmp/abb-go-cache go test ./...`
  - `node scripts/check-browser-command-registry.mjs`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm typecheck`
  - `pnpm check:browser`
- 手工检查：
  - fixture 中按 role/name 点击“创建”按钮，确认只命中唯一可操作元素。
  - 覆盖 `aria-labelledby`、显式/隐式 label、placeholder、open Shadow DOM 和同源 iframe。
  - 页面刷新后确认 Runtime 自动重新注入；元素延迟出现时自动等待成功。
- 观测检查：
  - Locator 超时必须包含 target、最后 match 数量和最后 actionability 原因。
  - 达到 Agent turn 上限时必须记录 exhaustion 错误，最终状态为 failed。

## 进度记录

- [x] 核对现有 Go/CDP/Extension/Injected Runtime 调用链和用户确认的分层方向。
- [x] 建立 TypeScript Runtime 源码与确定性生成链路。
- [x] 完成结构化语义 Locator 和页面内自动等待/actionability。
- [x] 完成 Go/Agent Core 契约与 Frame 路由，包括跨域/OOPIF execution context、isolated world 和 flat child session 转发。
- [x] 完成 `maxTurns=200` 与 exhaustion 终态。
- [ ] 完成分层验证、文档、history 和 learning。

## 决策记录

- 2026-07-17：选择“插件内 Go 宿主 + 自研 TypeScript 页面 Runtime + CDP 原语”架构；不复制 Codex、不依赖 Playwright 运行时。
- 2026-07-17：结构化 Locator AST 是事实契约，CSS selector 保持兼容；Playwright 风格字符串只可作为未来输入适配层。
- 2026-07-17：Extension 保持 primitive backend，高层 selector、等待和 actionability 不回迁 Extension。
- 2026-07-17：跨域/OOPIF 使用 Chrome flat CDP session；Go 以 frameId 选择 execution context，页面 Runtime 始终只处理当前单一 Frame context。

## 验收记录

- `pnpm check:browser`：通过，包含 Runtime TS 类型检查、确定性生成校验、jsdom fixture、registry parity 和 Extension primitive contract。
- `GOCACHE=/private/tmp/abb-go-cache go test ./...`：通过。
- `pnpm --filter @actspace/agent-core typecheck`：通过。
- agent-core 全量测试（沙箱外）：810/811 通过；唯一失败为已有 `subprocess.test.ts` 超时子进程输出断言，与本次 Browser/Loop 改动无关。
- 真实 Chrome smoke 首次执行命中了 reload 前仍存活的旧 native-host schema，报错为结构化 target 缺少旧版必填 `selector`；需 reload unpacked extension 使 Chrome 重启已原子替换的新 host 后重跑。
