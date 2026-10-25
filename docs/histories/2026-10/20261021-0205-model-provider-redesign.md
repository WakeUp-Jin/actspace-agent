## [2026-10-21 02:05] | Task: 设置 › 模型按四层数据模型重做

### Execution Context

- Agent ID: `/root`（C12 后端清理委派给一个 Sonnet 子智能体）
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

按已确认的 Demo 实现设置 › 模型的重做，先写计划再实现。中转站 `/models` 自带的字段优先于模型目录；去掉「测试」「测试连接」按钮；删掉内置连接的多 Key。只改设置，对话框不动。

### 变更与动机

- **四层数据模型**：协议 → 服务商模板 → 连接 → 模型。DeepSeek、Kimi、OpenRouter 不再是特殊 provider，只是模板表里的三行。每个模型字段的有效值 = 用户修改 > 服务商 `/models` > 模型目录 > 未知，并记录来源；在 main 统一算一次，运行时、对话框、设置页读同一份。原来能力判断散在 5 处，设置页显示的值和请求时用的值可能不一致。
- **思考档位**：统一为关 / 低 / 中 / 高 / 超高 / 最高，每个模型声明自己支持哪几档。对话框通过 `effectiveToCapabilities` 映射回原有形状，界面不变。
- **用途表**：会话默认、轻量任务、自动审批、子 Agent 探索、看图合成一张表，每项存「模型 + 思考档位」。子 Agent 探索以前只存不读，现在接上了真实的 `explore` 路由。
- **新页面**：用途表 + 连接列表；添加连接三步（选模板 → 填 Key → 选模型）；连接详情里模型行只有名字和开关，点开看三项关键信息，其余收进「更多设置」；添加模型在列表里就地展开。
- **删除**：旧 provider 页面和 14 个组件、旧 IPC（连接 / 测试 / 余额 / 自定义模型 CRUD）、多 Key、`billingMode`、`PROVIDER_CATALOG`、`model-connection.css`。

### 迁移带来的行为变化

- 迁移只跑一次（layersVersion 0 → 1），迁移前把原文件写进 `settings.v4.pre-model-layers.backup.json`。
- **价格**：统一为参考价 × 连接倍率，手填价不乘倍率。原来 `billingMode: token` 的连接开始显示费用；`manual` 下填过单价的模型转为手填价，没填的走参考价。
- **看图**：原来的白名单模型已安装就迁到「用途 › 看图」，否则改为「跟随会话默认」。
- **多 Key**：每个连接只保留主 Key，额外的 Key 读取时丢弃。
- **模型选择的位置**：「通用」「通用 › 媒体」「子 Agent」「工具 › 看图」不再选模型，只保留跳到「模型」页的入口。

### 关键文件

- `packages/shared/src/model-layers.ts`、`model-thinking-profiles.ts`、`model-catalog-match.ts`、`provider-templates.ts`、`model-connections.ts`
- `apps/desktop/src/main/model-connections-service.ts`、`settings/model-layers-migration.ts`、`model-store-service.ts`、`model-runtime-service.ts`
- `apps/desktop/src/renderer/components/settings/models/`
- `apps/desktop/src/renderer/mock/model-connections-fixture.ts`

### 验证与边界

- **通过的检查**：
  - shared 179；desktop main 512；renderer 1388。
  - 两个 tsconfig 的 typecheck。
  - ipc / bridge / theme / token 检查。
  - 浏览器 mock 截图，浅色、深色、480px 宽都看过。
- **未验证**：Electron 实机和真实 Key，指引在 `docs/exec-runs/20261021-model-provider-redesign/execution-summary.md`。
- 未提交、未推送。
