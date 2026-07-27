## [2026-07-27 23:21] | Task: 接入 DuckDing 多 Key 与公共模型目录

### 🤖 Execution Context

- Agent ID: Codex
- Base Model: GPT-5
- Runtime: Codex Desktop

### 📥 User Query

> 新增 DuckDing 服务商；默认保持一家供应商一把 Key，存在额外 Key 时模型才能从供应商已有 Key 中选择。Key 绑定独立价格倍率，模型能力和基础价格可从 models.dev / OpenRouter 公共目录选择。

### Changes Overview

- Scope: `shared`、`agent-core`、`desktop main/preload/renderer`、设计与安全文档。
- 新增 DuckDing Provider Registry 配置并复用 OpenAI-compatible runtime。
- provider 默认 Key 保持现有安全存储；额外 Key 增加加密 CRUD、独立测试状态、倍率和模型引用删除保护。
- 模型增加可选 `credentialId`，runtime 按绑定选择密钥，缺失或不可用时明确失败，不静默回退。
- 新增 models.dev 主源、OpenRouter 补充源的公共模型元数据服务，支持匿名双源抓取、归一化、搜索、原子缓存与离线保留。
- DuckDing 手动模型保留用户输入的 API 模型名，并可保存能力、上下文和基础价格快照；调用时生成“基础价格 × Key 倍率”的有效价格快照。
- 模型页只有存在额外 Key 时显示 Key 选择器；供应商页管理 Key，模型页不能输入密钥。
- Usage 成本增加 cache-write 独立单价计算，并补齐 main、runtime、catalog 与 renderer 回归测试。

### Design Notes

凭据秘密、模型引用和计费策略是三种生命周期不同的数据。默认 Key 不迁移可以维持兼容；额外 Key 用稳定 id 间接引用可阻止秘密进入模型设置；倍率绑定 Key、在调用时生成价格快照，既允许后续调整倍率，也不会重算已经落盘的历史成本。

### Files

- `packages/shared/src/provider-config.ts`
- `packages/shared/src/settings.ts`
- `packages/shared/src/model-resolver.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/model-metadata-catalog-service.ts`
- `packages/desktop/src/main/model-store-service.ts`
- `packages/desktop/src/main/model-runtime-service.ts`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/DuckDingModelDialog.tsx`
- `docs/design-docs/model-context/agent-duckding-multi-key-model-catalog.md`

### Verification

- `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop` typecheck 通过。
- shared 定向测试 22 项、agent-core Usage 定向测试 1 项、desktop main/renderer 定向测试 64 项通过。
- desktop 全量测试 504 项通过；根目录 `pnpm build`、主题颜色检查、文档骨架检查、密钥泄露扫描和 `git diff --check` 通过。
- `pnpm dev:log` 在沙箱外成功启动 Vite、Electron main、preload 与 renderer；Computer Use 因 macOS 锁屏无法继续完成窗口点击验收。
- agent-core 全量测试有 11 项非本次改动失败：10 项为沙箱内 Unix socket `listen EPERM`，1 项为既有 ToolManager 权限错误文案断言不一致；本次新增费用测试通过。
- 直接读取 2026-07-27 的 models.dev 与 OpenRouter 公共模型 JSON，确认字段形状和价格单位与归一化逻辑一致；长上下文阶梯价暂不纳入首版估算。

### Remaining Manual Acceptance

- 使用用户自己的 DuckDing Key 验证默认 Key、额外 Key 和模型绑定的真实连接与 `chat.completions`。
- 对照 DuckDing 实际账单确认公共目录基础价乘 Key 倍率后的 Usage 估算。
- 在浅色、深色和跟随系统主题下检查额外 Key 列表、模型 Key 下拉、错误提示与键盘焦点。
