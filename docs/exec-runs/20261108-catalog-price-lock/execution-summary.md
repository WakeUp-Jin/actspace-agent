# 模型目录价格锁定与删除运行时刷新 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-catalog-price-lock.md`
- **执行过程**：`docs/exec-runs/20261108-catalog-price-lock/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 实机检查未做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 合并规则 | `packages/util/shared/src/model-catalog-merge.ts` | 已有条目锁定、新条目新增、下架保留、改价清单覆盖 |
| 改价清单 | `packages/util/shared/src/model-catalog-overrides.ts` | 改已有价格的唯一入口，首版为空 |
| 生成脚本 | `scripts/generate-model-catalog.mjs` | 报告、`--offline`、一行一个模型、内容不变不写 |
| 删除运行时刷新 | `apps/desktop/src/main/*`、IPC contract/channel、mock | 随包目录成为唯一价格来源 |
| 重新生成 | `model-catalog.generated.ts` | 只新增 123 个模型 |

## 人工验证指引

### 必须验证

1. **Electron 启动与价格显示**
   - 验证方式：`pnpm dev`，打开 设置 › 模型，查看任一官方连接的模型价格；发一条消息后看回复尾部用量胶囊的花费。
   - 预期结果：启动无报错；价格与改动前一致；花费正常显示。

### 建议验证

1. **离线改价流程**
   - 验证方式：在 `model-catalog-overrides.ts` 里加一行已有模型的价格，运行 `pnpm models:generate --offline`。
   - 预期结果：报告显示“改价清单覆盖 1”，生成文件只改这一行。删掉这一行后再跑，价格不会自动回到旧值（已有条目锁定）；需要手动把清单改回旧价，或从 git 恢复这一行。

## 已知限制

- 改价清单移除后，价格停留在清单最后一次写入的值。这是“已有条目锁定”的直接结果。
- 用户数据目录里旧的 `model-catalog/` 缓存文件不再读取，也没有删除。
