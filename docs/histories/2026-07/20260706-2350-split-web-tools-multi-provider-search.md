## [2026-07-06 23:50] | Task: 拆分 web_fetch/web_search 并接入多供应商搜索

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE

### 📥 User Query

> Kimi 实现网络搜索和 URL 爬取不合理（嵌套一层导致复杂且不可靠），重新实现两个工具：1）web_fetch 根据 URL 获取网页转 Markdown（参考 opencode / claudecode-src / firecrawl 实现思路，firecrawl 付费不采用）；2）web_search 用专业搜索 API，支持智谱 / Tavily / TinyFish / Exa 四家。双通道并行：国内智谱有 key 就执行，国际线 Tavily 优先、耗尽降级 TinyFish、最后 Exa。设置页增加网络搜索供应商 key 填写，Tavily 显示剩余额度。

### 🛠 Changes Overview

**Scope:** `agent-core` + `shared` + `desktop`（main / preload / renderer）+ docs

**Key Actions:**

- **新增 `web_fetch` 工具**：纯本地 HTTP fetch → charset 探测（GBK 老站点）→ HTML 清洗 → Turndown 转 Markdown，不经过任何 LLM。含 https 升级、Cloudflare 403 诚实 UA 重试、5MB/30s/50k 字符限额、15 分钟进程内缓存。
- **重写 `web_search` 工具**：双通道并行编排——国内智谱 search_pro + 国际 Tavily → TinyFish → Exa 优先级降级（401/403/402/432/433/429 抛 `ProviderUnavailableError` 触发 failover）；结果按来源分组、跨通道 URL 去重（国内优先）、部分成功也返回。
- **拆除 Kimi-backed 搜索**：删除 `searchWithKimi`、`KimiService.streamWithBuiltinWebSearch`、`prompt/kimi-assistants/web-search.ts` 及相关测试；Kimi 辅助能力只剩 `analyze_media`（显式 `requiresKey: "kimi"`）。Kimi 主模型的 provider-native `$web_search` 不受影响。
- **key 门控链路**：env 新增 4 个搜索 key；`ToolRuntimeConfig.hasWebSearchKey` 贯通 `create-agent-deps` / `createToolManager` / `kairos-bootstrap`；`web_search` 改为 `requiresKey: "webSearch"` 门控，`web_fetch` 始终注册。
- **设置页网络搜索区块**：`shared` 新增 `SearchProviderId` / `SecretProviderId` / `searchProviders` / `SearchUsageResult` 契约；settings-service 统一管理 6 个 secret provider 的加密落盘与 env 应用，新增 `getSearchUsage()`（Tavily `GET /usage`）+ IPC + preload；设置页「模型」区新增 4 个搜索供应商行与 Tavily 额度显示。
- **前端预览**：bridge 按 toolName 区分 `Web Fetch <url>` / `Web Search <query>`。
- **（追加 2026-07-07）输出以国际线为主参考**：用户反馈中文搜索结果质量普遍不佳，重复内容希望以英文来源为准。国际组排前、URL 去重优先保留国际条目、分组标题附渠道特性说明 + primary/supplementary 标注（双通道有结果时）；讨论后放弃静态供应商数字比重方案（理由见 agent-web-tools.md 决策记录）。
- **测试与文档**：新增/重写 web-fetch、web-search executor/providers 测试与暴露、deps 测试，全仓 typecheck + 1178 个测试全绿；新增 `docs/design-docs/tool-system/agent-web-tools.md` 设计事实来源，同步更新 hybrid-capabilities、module-map、testing、kairos、SECURITY、RELIABILITY、设置页规范等文档。

### 🧠 Design Intent (Why)

Kimi `$web_search` 本质是搜索工具而非爬虫：给定 URL 时经常搜不到原文、页面不可达时会幻觉内容，且嵌套一层 LLM 让质量、token 消耗和时延都不可审计。拆成两个职责单一、不经过 LLM 的工具后：`web_fetch` 结果确定可审计；`web_search` 通过双通道并行兼顾中文覆盖（智谱）与国际内容（Tavily 链），provider 失效时同一次调用内自动降级，搜索能力不再与 Kimi key 耦合。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/web-fetch/`（新增 definition / executor / html-to-markdown）
- `packages/agent-core/src/tools/tools/web-search/`（providers.ts 新增，executor 重写）
- `packages/agent-core/src/env.ts`、`tools/types.ts`、`tools/exposure.ts`、`tools/index.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`、`engine/bridge.ts`
- `packages/agent-core/src/llm/kimi-assistants.ts`、`llm/services/kimi.ts`、`prompt/`（删除 web-search prompt）
- `packages/shared/src/settings.ts`
- `packages/desktop/src/main/settings-service.ts`、`main/index.ts`、`main/kairos-bootstrap.ts`、`preload/index.ts`、`src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- 各包相关测试文件
- `docs/design-docs/tool-system/agent-web-tools.md`（新增）及多份既有文档同步
