# 执行摘要

- **计划**：`docs/exec-plans/completed/20261021-model-provider-redesign.md`
- **分支**：`feat/model-provider-redesign`（worktree `../actspace-agent-model-provider`），未提交
- **日期**：2026-10-21

## 交付内容

- **shared**：四层数据模型。
  - `model-layers.ts`：有效值按「用户修改 > 服务商 > 目录 > 未知」取值，并记录来源。
  - `model-thinking-profiles.ts`：思考档位表。
  - `model-catalog-match.ts`：目录匹配，含日期后缀近似。
  - `provider-templates.ts`：模板表。
  - `model-connections.ts`：IPC 契约。
  - `resolveModelPricing` 去掉 billingMode 和倍率开关。
- **main**：
  - `ModelConnectionsService` 和 `modelConnections` IPC 域（11 个 channel）。
  - 四层迁移（layersVersion 0 → 1，迁移前写 `settings.v4.pre-model-layers.backup.json`）。
  - `ModelStoreService.getModelSnapshot()` 统一算有效值。
  - 用途表接上运行时：看图、explore 路由、轻量任务与自动审批的思考档位。
- **renderer**：`components/settings/models/` 下的新页面。
  - 用途表 + 连接列表。
  - 添加连接三步：选模板 → 填 Key → 选模型。
  - 连接详情：模型行就地展开、就地添加模型、重新获取、倍率、两步删除。
  - 其他设置页只保留跳到「模型」的入口。
- **删除**：
  - 旧 UI 组件 14 个、`model-selector-groups.ts`、`model-connection.css`。
  - 旧 IPC：providers / models / settings 里的连接、模型、余额、测试类 channel。
  - 多 Key（`additionalCredentials` / `credentialId`）。
  - `billingMode`、`imageInspection.modelKey/credentialId`。
  - `PROVIDER_CATALOG`、OpenRouter 目录服务、`custom-connection-probe`、`custom-connections` facade。

## 自动化证据（2026-10-21）

| 检查 | 结果 |
|---|---|
| `packages/shared`：`tsc -p` + `vitest run` | 20 个文件，179 通过 |
| `apps/desktop`：两个 tsconfig 的 `tsc --noEmit` | 通过 |
| `apps/desktop`：`vitest run src/main` | 512 通过，1 跳过（比 B 阶段的 554 少，是随旧 API 删掉的用例） |
| `apps/desktop`：`vitest run src/renderer` | 163 个文件，1388 通过，6 跳过 |
| `check:ipc-channels` / `test:ipc-channels` | 通过：150 个 channel，12 个测试 |
| `check:renderer-bridge` / `check:frontend-theme` / `check:frontend-tokens` | 通过 |
| 其他包 `tsc --noEmit`：web、runtime、desktop-app、subagent、client 等 | 通过 |

新增测试：
- `model-view.test.ts`：14 个
- `model-settings.test.tsx`：10 个
- `model-connections-service.test.ts`
- `settings-model-layers-migration.test.ts`：6 个

浏览器 mock 截图（vite + mock bridge，浅色、深色、480px）见 `screenshots/`。

## 人工验证指引（Electron + 真实 Key）

先备份 Electron `userData` 目录（dataRoot）下的 `settings.json` 和 `secrets.json`，再在 worktree 根目录用 `pnpm dev` 启动本分支。

1. **迁移**：
   - 打开设置 › 模型，确认原来的连接、启用的模型都在。
   - dataRoot 下应多出 `settings.v4.pre-model-layers.backup.json`。
   - 原来在「通用」选的会话默认 / 轻量任务、「子 Agent」选的探索模型、看图模型，应出现在「用途」里。看图原来选的模型没安装时，显示「跟随会话默认」。
2. **用途**：
   - 把轻量任务改成另一个模型并选思考档位。
   - 新建会话，等标题生成，在用量统计里确认这次调用用的是该模型。
   - 改回「跟随会话默认」后重启，确认保持。
3. **子 Agent 探索**：设一个与会话默认不同的模型，触发一次 explore 子 Agent，在子会话或轨迹里确认模型。
4. **看图**：
   - 会话默认用不能看图的模型（如 DeepSeek），看图设为能看图的模型。
   - 发一张图，确认 inspect_image 走看图模型。
5. **添加官方连接**：
   - 选 Anthropic 或 OpenAI，只填 Key，点「测试并获取模型」。
   - 列表里应有目录认识的模型，勾选后保存，进入详情页。
6. **添加中转**：
   - 选「自定义中转」，填地址、协议和 Key。
   - `/models` 返回的模型里，不认识的标「不在模型目录中」，日期后缀的标「像是 … 的日期版本」。
   - 中转站 `/models` 自带上下文 / 价格的，确认显示的是中转站的值（D9）。
7. **连接详情**：
   - 改名称、协议、地址、Key、代理，以及倍率（填非数字应退回原值）。
   - 点开模型改默认思考，在「更多设置」里改上下文和价格，再「恢复目录值」。
   - 对日期版本点「沿用」。
   - 停用被用途使用的模型，用途应变成跟随。
   - 「重新获取」：新模型默认不启用。
   - 删除连接要点两次。
8. **价格**：
   - 中转倍率设 0.5，发一条消息。
   - 用量里的费用应为目录价 × 0.5；手填过单价的模型不乘倍率。
9. **余额**：DeepSeek / Kimi 连接详情标题副行显示余额；OpenRouter 填管理 Key 后显示。
10. **对话框不变**：composer 的模型选择器、思考档位切换和改动前一致（D8）。

## 边界

- Electron 实机与真实 Provider 未验证，按上面的指引由用户执行。
- 本次删除了多 Key：旧的额外 Key 在 `secrets.json` 里读取时静默丢弃，只保留每个连接的主 Key。
- 原 `billingMode: token` 的连接，迁移后开始按参考价 × 倍率显示费用。
- `models.getPricingCatalog` / `refreshPricingCatalog` 目前没有 renderer 调用方，仍保留，留给使用统计后续使用。
- 浏览器截图的 console 里有 1 条资源 404，没有定位具体是哪个资源，页面渲染不受影响。
