# Web / PWA 客户端 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261017-web-pwa-client.md`
- **执行过程**：`docs/exec-runs/20261017-web-pwa-client/execution-process.md`
- **执行模式**：交互
- **执行结果**：A1–D3 完成；2026-10-18 视觉改为 B · 轻玻璃并完成浏览器验收；分支 `feat/web-mobile` 开 PR 合入 `main`，在 main 上与其他功能一起测。D4 真机验收待用户执行。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Host 同源托管页面 | `packages/agent-host/src/static.ts`、`config.ts`、`server.ts` | 配置 `webRoot` 后，Host 在同一端口提供页面；realpath 校验、SPA 回退、CSP 等安全头 |
| 回环 http 来源放行 | `packages/agent-host/src/server.ts`（`isAllowedOrigin`） | 只在不开 TLS 时放行 `http://localhost / 127.0.0.1 / [::1]`，开发不用配证书 |
| host 频道 `activity` 事件 | `packages/agent-host/src/bootstrap.ts`、`packages/shared/src/host-protocol/events.ts` | 列表能显示哪些会话正在运行 |
| 流式折叠抽到 `@actspace/client/live` | `packages/client/src/live/`、desktop 原文件改为重新导出 | 桌面端和 web 共用一份流式逻辑，桌面端行为不变 |
| 新应用 `apps/web` | `apps/web/**`（93 个源文件，23 个测试文件） | 连接配对、会话列表、新建、详情流式、审批、排队、模式 / 模型、设置、PWA |
| 检查脚本覆盖 web | `scripts/check-frontend-design-tokens.mjs`、`check-frontend-theme-colors.mjs`、`check-package-boundaries.mjs` | token / 主题规则同样约束 web；包边界检查跳过隐藏目录、豁免 web 应用 |
| 根脚本 | `package.json` | `pnpm dev:web`、`pnpm build:web`，根 `build` 包含 web |
| 文档 | `docs/ARCHITECTURE.md`、`FRONTEND.md`、`SECURITY.md`、`CICD.md`、设计规范、`apps/web/README.md` | 依赖方向、token 存储、CSP、来源规则、运行方式 |

## 人工验证指引

### 必须验证

1. **D4 手机真机（iPhone + Tailscale）**
   - 验证方式：
     1. Mac 和 iPhone 安装 Tailscale、登录同一账号；管理后台开启 MagicDNS 和 HTTPS Certificates。
     2. 按 `apps/web/README.md` 准备 `dev-host.config.json`，`pnpm --filter @actspace/web build`。
     3. Mac 上 `tailscale serve --bg --https=443 http://127.0.0.1:4317`，把输出的 `https://<机器名>.<tailnet>.ts.net` 写进 `allowedOrigins`，启动 Host（真实模型去掉 `--mock`、设置真实 key）。
     4. iPhone Safari 打开该地址，Mac 上 `host pair --config …` 生成配对码，手机输入；「分享 → 添加到主屏幕」后从主屏幕打开。
     5. 走一遍：新建会话 → 看流式回复 → 让 Agent 执行命令并审批 → 运行中再发一句看排队与撤回 → 停止。
     6. 锁屏 1 分钟再回来；Mac 上 `host revoke --device <id> --config …`。
   - 预期结果：全屏打开没有地址栏；回复逐字出现；输入框不被键盘挡住；锁屏回来几秒内自动恢复「在线」；吊销后页面回到连接页并提示重新配对。

2. **桌面端没有被 A4 改坏（Electron）**
   - 验证方式：`pnpm dev` 打开桌面端，发一条会触发思考、读文件、Bash 审批、写文件的消息。
   - 预期结果：流式显示、工具卡、审批、压缩块与改动前一致。

### 建议验证

1. **真实模型下的长回复和中断**
   - 验证方式：同源预览接真实 key，让模型写一段长文本，中途点停止；再发一条，确认能继续。
   - 预期结果：停止后显示「已停止」，下一条正常。

## Agent 已完成的验证

- 命令（2026-10-17 晚，同一工作区）：
  - `pnpm --filter @actspace/agent-host test`：20 文件 55 条通过。
  - `pnpm --filter @actspace/client build && pnpm --filter @actspace/client test`：7 文件 26 条通过。
  - `pnpm --filter @actspace/web typecheck && test && build`：23 文件 85 条通过；构建无警告（主块 325 kB / gzip 64 kB）。
  - `pnpm check:packages`、`check:frontend-tokens`、`check:frontend-theme`、`node --test scripts/test/frontend-design-tokens.test.mjs`、`scripts/test/package-boundaries.test.mjs`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm --filter @actspace/desktop test`：237 文件 1924 条通过（与开工前基线相同）。第一次全量跑出现过一次已知的 turn-tail 未处理错误，重跑通过，见「已知风险」。
- 浏览器验收（真实 Host + OpenAI 兼容假模型，Host 同源托管 `http://127.0.0.1:4317`，Chrome 无头）：截图在 `screenshots/`。

| 截图 | 内容 |
|---|---|
| `narrow-01-connect.png` | 连接页，地址默认为当前页面 |
| `narrow-02-list.png` | 会话列表；有一条会话带「等待审批 · bash · 执行命令」提示 |
| `narrow-03-new-session.png` | 新建面板：工作区、服务器状态、第一句话 |
| `narrow-04-streaming.png` | 流式回复：思考折叠、Markdown、「运行中 · 1s」、停止按钮 |
| `narrow-05-queued.png` | 运行中再发一句：排队气泡「本轮结束后发送 · 撤回」 |
| `narrow-06-approval.png` | 审批卡「等待你审批 · 运行命令」：运行 / 拒绝并说明 |
| `narrow-07-after-approval.png` | 允许后命令执行完成，Agent 继续回复 |
| `narrow-08-mode-sheet.png` | 模式面板：Agent / Plan / Chat |
| `narrow-09-model-sheet.png` | 模型面板（按服务商分组） |
| `narrow-10-settings.png` | 设置页：服务器信息、外观、版本 |
| `narrow-11-disconnected.png` | Host 被强制停止：「已断开，正在重连…」，输入框禁用，工作区名保留 |
| `narrow-12-reconnected.png` | Host 重启后自动重连，继续发送成功 |
| `narrow-13-forget-confirm.png` | 「断开并移除」确认 |
| `narrow-14-after-forget.png` | 移除后回到连接页，本机保存的 Host 已清空 |
| `narrow-dark-list.png`、`narrow-dark-detail.png` | 深色窄屏 |
| `wide-light-detail.png`、`wide-dark-detail.png` | 1440×900 两栏，浅色 / 深色 |

另外在开发方式（Vite 5174 + Host 4317）下验证过：拒绝审批后输入框聚焦并提示「告诉 Agent 应该怎么做…」、撤回排队消息、停止、读文件的「已探索 1 个文件」分组、写文件 diff 卡「还有 8 行」。

## 2026-10-18 视觉重做：B · 轻玻璃

用户觉得首版样式不好看，在 `docs/design-docs/frontend/mobile-web-v2-demo.html` 里对比后选定 B · 轻玻璃（iOS 原生感，手机优先），并确认：空输入发送钮浅灰 34px、保留「拒绝后告诉 Agent 怎么做」、工具动作用英文（与桌面端一致）、只改样式和交互不改数据与连接逻辑、不做假数据。

- 改动：`apps/web/src/styles/*`（玻璃描边与投影、inset 分组、胶囊按钮、时间线间距、审批卡 / 改动卡 / 排队托盘 / 上下文环）；新组件 `PageHeader`、`PillButton`、`SendButton`、`ComposerBox`、`PlusSheet`、`QueueTray`、`TurnView`、`UsageSheet`、`blocks/ToolLine`；新纯函数 `sessions/turn-model.ts`（按轮拆分、Worked for、改动合并、本轮用量）、`sessions/usage-format.ts`、`session-row-model.ts` 的时间分组。删除 `ModeSheet`、`WorkspaceSheet`、`PickerSheets`、`QueuedBubble`、`WorkspaceTile`。
- 不做假数据：统计胶囊（TTFT / TPS）、Host 版本、检查更新、审批提醒、列表「失败」状态、重新生成、↳ 引导都没有数据或功能来源，不显示；用量胶囊只来自 `assistant.usage`，上下文环只在有 `contextSnapshot` 时显示，改动卡只来自本轮成功的 diff 块。
- 验证：`pnpm --filter @actspace/web typecheck && test && build`（25 文件 95 条）；`pnpm check:frontend-tokens`、`check:frontend-theme`、`check:packages`、根 `pnpm typecheck` 通过。真实 Host + 假模型浏览器验收，截图在 `screenshots-b/`：

| 截图 | 内容 |
|---|---|
| `n01-connect.png`、`n02-list.png`、`n18-list-attention.png` | 连接页；按时间分组的列表；有会话等审批时「需要处理 1」置顶 |
| `n03-new-session.png` | 新会话弹层：工作区芯片 + 两层输入框 |
| `n04-streaming.png`、`n05-queued.png` | 流式回复（思考过程、运行中计时、停止）；排队托盘 |
| `n07-approval.png`、`n08-after-approval.png` | 桌面式审批卡（等待确认、`$` 命令、拒绝 / 运行）；完成后「Worked for 2s」折叠、尾栏复制 / 时间 / 用量 |
| `n09-usage-sheet.png` | 本轮用量弹层 |
| `n10-plus-sheet.png`、`n11-plan-mode.png`、`n12-model-sheet.png` | ＋ 弹层（模式 + 附件占位）；Plan 芯片与两层输入框；模型弹层 |
| `n13-denied.png` | 拒绝后输入框「告诉 Agent 应该怎么做…」 |
| `n15-worked-open.png` | 展开 Worked for、写入行、改动卡 |
| `n17-settings.png` | inset 分组设置页 |
| `n-dark-list.png`、`n-dark-detail.png`、`w-light-detail.png`、`w-dark-detail.png` | 深色窄屏；宽屏两栏浅色 / 深色 |

改动卡里的 `notes.md +0 -0` 是真实数据：工作区里已有同内容文件，重复写入没有行变化。

## 已知风险和遗留事项

- **没有在真实 Safari / iOS 上跑过**：键盘避让（`visualViewport`）、安全区、添加到主屏幕、Service Worker 更新提示，只在 Chrome 移动模拟里看过，D4 要重点看。
- **Tailscale 部署未实测**：本机没有装 Tailscale。CSP 已按 `X-Forwarded-Host` 放行页面 host 的 `wss://`，来源校验有单元测试，但 `tailscale serve` 实际转发的头没有抓包确认。如果手机上配对失败、提示「连不上 …：请确认 Host 在运行、地址是 HTTPS，且这个页面的地址已写入 allowedOrigins」，先检查 `allowedOrigins` 是否和地址栏完全一致（https、无结尾斜杠）。
- **「本会话允许 `<前缀>`」按钮**只在 Host 给出 `command_prefix` 授权建议时出现，浏览器验收没有触发到，只有单元测试。
- **desktop 测试偶发失败**：已知的 turn-tail 未处理错误，和本次改动无关，重跑通过。
- **`check:current-docs`** 在本 worktree 有约 314 条历史 exec-runs 截图缺失（图片不在仓库里），开工前就存在。
- 技术债（web 产物打进 agent-cli、token 共享包、懒加载、Run 开始时间、Host 侧合并 `sessions-changed`）见 `docs/exec-plans/tech-debt-tracker.md`「Web / PWA 客户端遗留」。

## 后续建议

- D4 通过后：计划移到 `completed/`，同步 `docs/exec-plans/README.md` 和设计规范状态。
- 正式给别人用之前，先做「web 产物打进 agent-cli 包并默认托管」，否则服务器部署要先在仓库里构建。
