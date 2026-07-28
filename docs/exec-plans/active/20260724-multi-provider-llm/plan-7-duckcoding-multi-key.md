# Plan 7：DuckCoding、多 Key、本地模型档案与名称变体

状态：实现完成；Codex Responses 与缓存链路已自动化验证，待用户自有 DuckCoding Key 的真实 Agent 工具循环手动验收（2026-07-28）

依赖：Plan 0-5

设计规范：`docs/design-docs/model-context/agent-duckcoding-multi-key-model-catalog.md`

## 目标

接入 OpenAI-compatible 的 DuckCoding provider，并保持“单 Key 零感知、多 Key 才选择”的渐进交互。首版使用仓库内本地模型档案支持 Codex 与 Grok；DuckCoding 的推理强度通过精确模型名变体传递，模型上下文可在添加时覆盖。

## 范围

- 包含：
  - `duckcoding` ProviderId、`DuckCoding` 展示名和默认 Base URL。
  - 默认 Key 与供应商额外 Key、独立连接测试、倍率和删除引用保护。
  - 模型可选 `credentialId`；缺省继续使用默认 Key。
  - shared 本地 DuckCoding 模型档案，首版包含 Codex 与 Grok family。
  - Codex Sol、Terra、Luna 的 Light、Medium、High、Extra High、Ultra 到精确请求模型名的映射。
  - Codex 三个标准模型的本地基础价格，以及 Key 倍率后的 Usage 估算。
  - 手动模型兜底，以及最大上下文、最大输出覆盖。
  - runtime 按强度切换 `apiModel`，DuckCoding 请求不发送 reasoning 属性。
  - Codex 使用 Responses API、session 级缓存键和本地无状态上下文回放；Grok 与未知手动模型默认保留 Chat Completions。
  - IPC、preload、renderer、测试、设计文档和 history 同步。
- 不包含：
  - models.dev/OpenRouter 到 DuckCoding 的运行时自动元数据导入。
  - DuckCoding 远端模型目录、余额或 Management Key。
  - Key 轮询、随机路由、限流切换或失败自动 fallback。
  - 根据字符串规则猜测未确认的 Codex 强度变体。

## 兼容策略

- 现有默认 Key 密文不迁移，仍由 provider secret 槽位管理。
- 额外 Key 继续使用 `<provider>:<credentialId>` 的 `safeStorage` 密文索引。
- `pricingMultiplier` 缺省为 `1`；模型没有 `credentialId` 时动态继承默认 Key。
- 单 Key provider 的现有 UI、runtime 和可用性判断不变。
- 本功能尚未发布，早期实验 id `duckding` 直接纠正为 `duckcoding`，不保留双写和别名。
- 删除 DuckCoding 公共元数据聚合服务，不影响 OpenRouter 自身目录。

## 实施步骤与结果

### 7.1 Provider 与共享契约

- [x] Provider Registry 使用 `duckcoding` / `DuckCoding`。
- [x] `ModelDefinition` 增加可选 `family` 和 `requestModelByReasoningEffort`。
- [x] IPC 的 DuckCoding 添加模型输入支持本地档案 id、上下文和输出覆盖。
- [x] shared 测试锁定裸模型名和名称变体。

### 7.2 本地模型档案

- [x] 新增 `packages/shared/src/duckcoding-model-catalog.ts`。
- [x] Codex 登记 Sol、Terra、Luna 三个模型，并为每个模型登记 low/medium/high/xhigh/ultra 五档映射。
- [x] Grok 首版登记 `grok-4.5`。
- [x] 参考 models.dev 对应 OpenAI 条目，登记 Sol、Terra、Luna 的标准输入、输出、缓存读取和缓存写入价格。
- [x] 已安装但没有持久化价格或仍声明旧协议的 Codex 模型在读取快照时从本地档案补齐价格并升级为 Responses，不改写持久化定义。
- [x] 默认上下文为 255,000，添加时允许覆盖。
- [x] 保留未知精确模型名的手动添加路径。

### 7.3 多 Key 与倍率

- [x] 供应商下支持额外 Key CRUD、独立测试和倍率。
- [x] 模型页仅在存在额外 Key 时显示选择器，且只能选择供应商已有 Key。
- [x] 默认 Key 缺失但额外 Key 存在时仍可管理供应商。
- [x] 被引用 Key 禁止删除，失效引用不静默 fallback。
- [x] runtime 将目标 Key 倍率应用到本次模型价格快照。
- [x] 模型列表使用同一有效价格规则；Sol 选择 `0.2x` Key 时展示输入 `$1`、输出 `$6`。

### 7.4 请求名称变体与 UI

- [x] Composer 继续使用统一 reasoning effort 类型。
- [x] 统一 effort 类型增加 `ultra`；DuckCoding UI 将 `low` 显示为 Light、`xhigh` 显示为 Extra High，并默认 Medium。
- [x] agent runtime 根据模型映射生成本次有效 `apiModel`。
- [x] DuckCoding adapter 不写入 OpenRouter 风格 reasoning 请求字段。
- [x] 添加弹窗展示 Codex/Grok family、精确请求名和强度变体。
- [x] 最大上下文始终可编辑，最大输出可选。
- [x] 自定义模型不自动添加 OpenAI、Azure、xAI 等前缀。

### 7.5 文档与清理

- [x] 删除 DuckCoding 的 models.dev/OpenRouter 聚合目录服务与 IPC。
- [x] 更新多供应商架构、设置页、Security、模块图、计划和 history。
- [x] 更新已有多凭据路由学习文档中的名称和 history 链接。

### 7.6 Codex Responses、缓存与工具循环状态

- [x] `ModelApi` 增加 `openai-responses`，DuckCoding Codex 档案声明 Responses，Grok 声明 Chat Completions。
- [x] 新增 provider-neutral 的 `OpenAIResponsesService` 与独立 Responses 消息、工具和 usage 转换层。
- [x] main Agent 为 Responses 模型注入由 session id 哈希派生的稳定 `prompt_cache_key`；utility / explore 等非 session 主调用不复用该键。
- [x] Responses 请求使用 `store: false` 且不发送 `previous_response_id`，由 ActSpace 回放完整本地上下文。
- [x] 请求包含 `reasoning.encrypted_content`；加密 reasoning item 作为 opaque signature 随 thinking session 事件持久化并在下一工具轮次回放。
- [x] Responses 流式事件支持文本、`call_id` 工具调用、incomplete、错误和 response metadata。
- [x] usage 归一输入、输出、缓存读取、缓存写入和 reasoning tokens，并继续使用模型价格快照计费。
- [x] 缓存归因实测只有 Responses 对照确认命中：`2560 / 3610` input tokens，约 `70.9%`；因此没有把所有 DuckCoding 模型一刀切到 Responses。

### 7.7 Thinking 传输归因

- [x] 确认 Codex 真实 session 中存在 reasoning token 和加密 reasoning item，但最终 `summary` 为空；opaque 协议状态不等于可展示 Thinking。
- [x] 新增独立 `scripts/diagnose-duckcoding-thinking.ts`，对比 Responses 不请求 summary 与 `reasoning.summary=auto`。
- [x] 增加旧参数 `reasoning.generate_summary=auto` 对照，排除 DuckCoding 仅兼容旧 Responses 参数的可能。
- [x] 同一脚本探测 Grok Chat 流中的 `reasoning_content`、`reasoning`、`analysis` 字段，不预设 DuckCoding 的转换来源。
- [x] 默认只输出事件、字段和长度；Codex/Grok Key 从各自环境变量独立读取且不交叉 fallback，正文预览需要显式 `--show-content`。
- [x] 用户使用自有 Key 确认现代 `reasoning.summary=auto` 仍无可读摘要，Grok Chat 仅返回 `role` / `content` delta。
- [x] 用户补测旧 `reasoning.generate_summary=auto`，确认它也不返回可读 summary。
- [x] session selector 隐藏 content 为空的 signature-only Thinking，事件持久化和 Responses 回放保持不变。

## 风险与缓解

| 风险 | 缓解方式 |
| --- | --- |
| 上游模型名与 DuckCoding 路由名不同 | 本地档案单独保存 `apiModel`，不拼 provider 前缀 |
| 推理强度被错误作为请求属性发送 | DuckCoding adapter 保持请求体不变；runtime 只切换 `apiModel` |
| 未确认系列被按命名规律猜错 | 只登记确认过的精确名称，新增系列必须显式扩展本地档案 |
| 255k 路由限制被上游 1M 信息覆盖 | 添加模型时允许并默认使用 DuckCoding 上下文值，进入真实预算逻辑 |
| 多 Key 发生静默账户切换 | 缺失或不可用 credential 明确失败，不回退默认 Key |
| 倍率修改影响历史费用 | 仅对调用时 resolved pricing snapshot 生效，不重算历史 Usage |
| 公共目录价格被误认为 DuckCoding 官方价 | 只在维护时人工同步标准基础价，UI 标为估算，真实账单作为最终事实来源 |
| 旧安装模型一直显示价格未知 | 读取模型快照时按精确 `apiModel` 补齐当前本地档案价格，不覆盖用户持久化配置 |
| Responses 使用 `store: false` 后工具循环缺少推理状态 | 请求加密 reasoning content，将 opaque reasoning item 持久化为 provider signature 并按原顺序回放 |
| 原始 session id 被外部缓存键暴露 | 只发送固定前缀加 SHA-256 截断结果，不发送原始 session id |
| 把缓存键误当成会话状态 | 缓存键只优化稳定前缀；完整消息、工具结果和 reasoning item 仍由本地上下文管理 |

## 验证命令

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:frontend-theme
pnpm check:docs
pnpm check:secrets
```

## 验证结果

- [x] shared 全套测试和类型检查通过。
- [x] desktop 全套 505 项测试和类型检查通过，包含旧模型价格补齐与 `0.2x` 有效价格展示。
- [x] agent-core 新增 DuckCoding 定向用例通过。
- [x] Responses 转换、流式服务、factory、session 缓存键、加密 reasoning item 持久化和跨协议隔离定向用例通过，共 69 项。
- [x] desktop 模型协议兼容升级、运行配置和连接默认值定向用例通过，共 50 项。
- [x] production build、前端主题约束、文档骨架、secrets 扫描与 `git diff --check` 通过。
- [ ] agent-core 全套无红项：当前仍有仓库既有的权限文案断言差异，以及受沙箱限制的 Unix Socket `listen EPERM`。
- [x] 用户执行缓存归因探针，确认 Responses 路线能返回非零 `cached_tokens`，Chat 对照没有可确认缓存字段。
- [ ] 用户自有 DuckCoding Key 的真实 Agent 工具循环、Grok Chat 调用和倍率账单验收。
- [x] Thinking 四场景协议归因完成；DuckCoding 当前不返回可读推理，空 signature-only Thinking 已从展示层隐藏。
- [ ] Electron 设置页浅色、深色、跟随系统的真实窗口手动验收。

## 决策记录

- 2026-07-27：默认 Key 不迁移；额外 Key 只能在供应商页添加，模型页只选择。
- 2026-07-27：倍率与 Key 绑定，缺省 `1x`，Usage 使用调用时价格快照。
- 2026-07-28：服务商名称纠正为 DuckCoding，内部 id 纠正为 `duckcoding`。
- 2026-07-28：DuckCoding 不走公共模型元数据聚合；首版改为仓库内 Codex/Grok 本地档案和手动兜底。
- 2026-07-28：DuckCoding 推理强度通过精确请求模型名传递，不发送 reasoning effort 属性。
- 2026-07-28：Codex 目录扩展为 5.6 Sol、5.6 Terra、5.6 Luna；三者统一支持 Light、Medium、High、Extra High、Ultra 五档名称变体。
- 2026-07-28：参考 models.dev 的对应 OpenAI 条目，将 Sol、Terra、Luna 标准基础价固化进本地档案；应用不运行时联网获取，也不把它声明为 DuckCoding 官方价。
- 2026-07-28：旧安装 Codex 模型在读取快照时按精确模型名补齐基础价，持久化定义保持不变；Grok 4.5 暂时继续显示价格未知。
- 2026-07-28：缓存归因探针只在 Responses 对照中确认缓存命中，因此 Codex 档案切换到 `openai-responses`，Grok 与未知手动模型默认继续使用 `openai-completions`。
- 2026-07-28：Responses 使用 `store: false` 和本地完整上下文；session 级缓存键由原始 session id 哈希派生，不使用 `previous_response_id`。
- 2026-07-28：工具循环必须回放供应商返回的加密 reasoning item；它作为 opaque provider signature 持久化，不当作可读思考展示。
- 2026-07-28：Thinking 缺失先用独立对照探针归因；不以 `reasoning_tokens > 0` 推断网关一定返回可读 reasoning，也不在证据前扩展 Chat 字段兼容。
