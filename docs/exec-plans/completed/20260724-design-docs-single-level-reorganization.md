# Design Docs 单层专题目录重组执行计划

## 目标

把 `docs/design-docs/` 从按前缀平铺和多级资产目录并存的状态，重组为最多一层专题目录：设计文档要么位于 `docs/design-docs/` 根层，要么位于一个强关联专题目录中；任何专题目录内都不再创建子目录，同时保持现有文档内容、仓库链接和检查脚本可用。

## 范围

- 包含：
  - 创建 `agent-runtime/`、`model-context/`、`tool-system/`、`execution-safety/`、`browser/`、`collaboration/`、`kairos/`、`evaluation/`、`frontend/`、`lab/` 十个单层专题目录。
  - 将现有 Markdown、HTML 和 PNG 资产直接移动到对应专题目录。
  - 合并 `front-前端设计文档.md`、`lab-ui-experience.md`、`lab-rust-cli/message.md` 中仍有价值的内容并退役重复文件。
  - 更新设计索引、架构导航、仓库内引用和路径检查脚本。
  - 记录迁移 history，并验证不存在二级嵌套和失效旧路径。
- 不包含：
  - 不修改产品运行时代码、前端实现或设计 token。
  - 不重写根目录 `DESIGN.md` 的视觉设计内容。
  - 不回退或覆盖当前工作区内正在进行的多模型、Bash 权限和其他用户改动。
  - 不在任何专题目录内创建 `assets/`、`mockups/`、`public/` 等二级目录。

## 背景

- 相关文档：
  - `docs/design-docs/index.md`
  - `docs/design-docs/agent-index.md`
  - `docs/ARCHITECTURE.md`
  - `docs/FRONTEND.md`
  - `docs/PLANS_GUIDE.md`
- 相关脚本：
  - `scripts/check-docs.sh`
  - `scripts/check-browser-command-registry.mjs`
- 已知约束：
  - `docs/design-docs/` 下最多一层专题目录。
  - 只有强关联文档进入同一目录，跨专题入口和独立文档保留在根层。
  - 当前仓库存在未提交改动，迁移必须保留文件内容和 Git 状态。
  - 仓库内存在大量 `docs/design-docs/*` 硬编码路径，移动必须原子更新引用。

## 风险

- 风险：移动已修改或未跟踪文件时丢失用户内容。
  - 缓解方式：移动前记录 `git status`，只使用文件移动和定向补丁，不执行 reset、checkout 或覆盖式复制。
- 风险：Markdown、HTML、脚本或历史记录仍引用旧路径。
  - 缓解方式：建立旧路径到新路径的一对一映射，完成后对旧路径和旧资产目录做全仓扫描。
- 风险：前端图片和 HTML 原型移动后相对链接失效。
  - 缓解方式：资产与所属文档放在同一专题目录，逐专题修正相对路径并运行文档检查。
- 风险：目录规则再次退化为多层结构。
  - 缓解方式：在 `docs/design-docs/index.md` 写入单层硬约束，并在验证阶段用 `find` 检查目录深度。

## 里程碑

1. 建立单层目录和完整迁移映射。
2. 移动文档与资产，合并三份重复或原始讨论文档。
3. 更新全部入口、引用与检查脚本。
4. 执行文档、Browser 和仓库级检查，记录 history 后归档本计划。

## 验证方式

- 命令：
  - `find docs/design-docs -mindepth 2 -type d`
  - `rg 'docs/design-docs/(agent|front|lab|core)-[^/]+\\.md'`
  - `pnpm check:docs`
  - `pnpm check:browser`
  - `pnpm check:repo`
  - `git diff --check`
- 手工检查：
  - 根索引、Agent 索引、Frontend README、Lab README 和 Browser 专题入口的链接与描述一致。
  - 所有 HTML/PNG 资产直接位于对应一级专题目录。
  - 当前工作区原有未提交内容仍保留在迁移后的文件中。
- 观测检查：
  - 全仓不再出现指向已退役路径的活跃引用。
  - `docs/design-docs/` 下不存在专题目录内的子目录。

## 进度记录

- [x] 确认最多一层专题目录的范围和约束。
- [x] 创建专题目录并移动文档与资产。
- [x] 合并重复文档并更新索引。
- [x] 更新全仓引用和检查脚本。
- [x] 完成验证、history、学习沉淀判断和计划归档。

## 决策记录

- 2026-07-24：采用“根层入口或独立文档 + 一级强关联专题目录”的结构，不使用 `agent/tools/browser`、`frontend/assets` 等二级嵌套。
- 2026-07-24：迁移阶段保留现有 `agent-`、`front-`、`lab-` 文件名前缀，避免目录调整和全面重命名同时扩大变更面。
- 2026-07-24：原型和截图直接平铺到所属专题目录，通过清晰文件名表达用途，不保留通用 `public/`、`mockups/`、`previews/` 目录。
- 2026-07-24：验证通过 `pnpm check:docs`、`pnpm check:browser`、`pnpm check:repo` 和 `git diff --check`；设计目录内不存在二级目录，Markdown 相对链接检查为零断链。
