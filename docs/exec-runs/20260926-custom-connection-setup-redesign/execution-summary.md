# 自定义服务与 Anthropic 连接流程重做 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260926-custom-connection-setup-redesign.md`
- **执行过程**：`docs/exec-runs/20260926-custom-connection-setup-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：阶段 A–C 和 T17 已完成，自动化验证通过；T18（Electron 真机验收、真实中转站测试）等待用户进行。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 列表状态、删除确认、文案 | `ProviderSettings.tsx`、`ConfirmDialog.tsx`、`CustomConnectionModels.tsx` | 状态显示为未测试 / 可用 / 连接异常；删除连接和删除模型都要确认 |
| 地址规范化 | `packages/shared/src/custom-connection-address.ts`、`settings-service.ts` | 去掉接口后缀并推断协议；`/v1` 不再报错 |
| 契约与目录 | `settings.ts`、`provider-config.ts`、`custom-model-input.ts`、两套 IPC | 新字段 `authMode / resolvedAuth / billingMode`、探测、批量创建模型、`custom` 入口 |
| 探测与测试 | `provider-network-service.ts`、`custom-connection-probe.ts` | 拉取模型列表；认证方式为「自动」时回退到 Bearer；中文错误信息，不含 Key |
| 运行时 Bearer | `credential-resolver.ts`、`legacy-llm-adapter.ts`、`legacy-proxy-wire-engine.ts` | 只发一种认证头；SDK 固定 `authToken: null` |
| 计费 | `model-pricing.ts`、`model-runtime-service.ts`、`model-port.ts` | reference / token / manual；reference 模式下手填单价不乘倍率 |
| 新界面 | `CustomConnectionWizard.tsx`、`AnthropicKeySetup.tsx`、`ConnectionModelPicker.tsx`、`CustomConnectionDetail.tsx`、`CustomModelForm.tsx`、`ModelPricingFields.tsx`、`custom-connection-shared.tsx` | 对应 demo 的「新方案」 |
| fixture 与截图 | `test/fixtures/model-settings-preview.tsx`、`screenshots/` | 四种场景，浅色和深色 |

## 人工验证指引

### 必须验证（Electron，`pnpm dev`）

1. **旧连接**：升级前已有的自定义连接仍在列表里，状态如实显示；进入详情页能测试，能正常对话。旧连接缺省是 x-api-key 认证、按「逐个填写单价」计费，都和升级前一样。
2. **添加连接**：目录没有三条「自定义服务（协议）」旧入口，底部有「没有找到？ · 自定义服务」。
3. **自定义服务向导**：
   - 粘贴 `…/v1/chat/completions`，协议自动切到 OpenAI Chat；粘贴 `…/v1`（Anthropic），显示「已去掉 /v1」；
   - 测试成功后进入第 2 步；保存后打开详情页；
   - 跳过测试的话，保存后自动测一次。
4. **官方 Anthropic**：只填 Key → 测试连接 → 选模型 → 保存；详情页不显示地址、名称、认证方式，计费显示「按官方价格」。
5. **详情页**：改名不重测；改地址或换 Key 后自动重测；「刷新」发现的新模型默认不启用；默认模型不能停用或删除；删除连接要确认。
6. **浅色和深色主题**各看一遍。

### 真实中转站（需要用户同意，会产生少量费用）

找一个只认 Bearer 的 Anthropic 中转站：认证选「自动」测试，应显示「已自动改用 Bearer 认证」；保存后发一条最短消息，用量页能看到按官方价 × 倍率计算的金额。

## Agent 已完成的验证

- `pnpm --filter @actspace/shared test`：97/97。
- `pnpm --filter @actspace/llm-pi-ai test`：51/51，包括用真实 SDK 检查 Bearer / x-api-key 请求头。
- `pnpm --filter @actspace/desktop test`：831/832。唯一的失败是基线已知的 `workspace-git-context-service`「hides Git controls for a non-repository workspace」，是本机 Git 环境问题，和本次改动无关。
- `provider-model-settings.test.tsx`：41/41，覆盖：
  - 目录分组与搜索；
  - 向导完整流程（Bearer、预选 3 个模型、键盘勾选、倍率、保存参数）；
  - 没有模型列表、协议自动切换、测试失败停在第 1 步、换 Key 后测试作废；
  - 官方 Anthropic；
  - 详情页改名、改地址后重测、官方连接隐藏的行、切换计费方式；
  - 模型的删除、添加、刷新和编辑。
- `pnpm typecheck`、`pnpm check:frontend-theme`、`pnpm check:frontend-tokens`、`pnpm test:contract-matrix`、`pnpm --filter @actspace/desktop build`：全部通过。
- 浏览器 fixture 截图（headless Chrome，960 宽，浅色和深色）：
  - 添加目录；
  - 向导第 1 步：空白、失败、通过；
  - 向导第 2 步：有列表、无列表；
  - 官方 Anthropic；
  - 连接详情；
  - 模型编辑页。

  逐张和 demo 对照过，布局和文案一致。

## 已知风险和遗留事项

- 与 demo 的差异：
  - 详情页 API Key 只显示「已设置」（SECURITY.md 规定 renderer 拿不到 Key 片段）；
  - 连接测试不显示延迟；
  - 服务不提供模型列表时，显示「已连通」而不是「连接成功」；
  - 推理能力沿用 `CustomModelReasoningFields`。
- 一些中转站的 `/v1/models` 返回 401，但 messages 接口可用。这时向导会显示认证失败，用户可以「跳过测试」，保存后的 1 Token 测试才是最终判断。
- 兼容预设（Z.AI、火山方舟等）仍走旧的单页表单，按计划不在本次范围内。
- 新连接的 `providerId` 仍回退为 `"openrouter"`，按计划单独立项。

## 后续建议

- 兼容预设也可以复用向导的第 2 步（探测模型列表），去掉手填「第一个模型」。
- 连接测试可以返回耗时，详情页补上延迟显示。
