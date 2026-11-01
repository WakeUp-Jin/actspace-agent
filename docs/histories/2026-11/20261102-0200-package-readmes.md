## [2026-11-02 02:00] | Task: 包 README 与文档同步（插件结构 S4）

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 S4)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行插件结构 S4：重写 `packages/README.md` 为总地图，给 23 个能力目录各写一份 README，新增 `check-package-readmes` 并接入 `check:docs`，同步现行文档里的旧路径和旧包名；不提交。

### 🛠 Changes Overview

**Scope:** `packages/`（README）、`scripts/`、`docs/`、根目录 `AGENTS.md` / `README.md` / `CONTRIBUTING.md`

**Key Actions:**

- **总地图**: `packages/README.md` 重写：组织规则、23 个能力目录的表、依赖方向、新增插件五步、检查命令。
- **能力目录 README**: 23 份，统一格式（包表、包之间怎么连、入口与测试、怎么扩展）；类别、默认开关、provides / inject 都对照插件清单和 manifest 写，不凭记忆。`sandbox/` 附新增后端的步骤。
- **校验脚本**: `scripts/check-package-readmes.mjs`：地图与目录一一对应、包表与实际包一一对应；有 runtime 构建时核对类别和默认开关。接入 `check-docs.sh`，加 `test:package-readmes`（9 个用例）并串进根 `test`。
- **现行文档**: AGENTS.md 加地图入口；README、ARCHITECTURE、包结构规范、`agent-plugin-runtime/README.md` 指向地图并修正旧写法；CONTRIBUTING 要求改包时同步 README。
- **禁用模式**: `check-current-docs.mjs` 增加旧包名和旧一级包路径两条。
- **修正**: 四个包 README 的相对链接少一层；插件清单里 `llm-pi-ai` 的原因文字改为实际情况（运行时只重新导出）。

### 📝 Notes

- `pnpm check:current-docs` 仍是 363 条已知失败，全部在 `docs/exec-runs/`，没有新增。
- 类别检查需要先构建 runtime；CI 文档步骤没有构建，只做结构检查。
- 依赖方向写在 README 里，脚本不核对；包依赖变化后要手工同步。
