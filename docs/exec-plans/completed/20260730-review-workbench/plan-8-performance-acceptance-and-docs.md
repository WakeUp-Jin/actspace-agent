# Plan 8：性能验收、Electron 回归与文档收口

> 状态：进行中；自动化与 capped 核心 Electron 路径已完成，Standard、主题/尺寸与快速切换验收待执行。

## 目标

用可重复 fixture、命令计数、DOM 上限、真实 Electron 操作和日志证明 Review 不再因大变更 fan-out 卡死，并同步正式设计、history、quality 与学习文档。

## 文件范围

- `packages/desktop/src/main/test/review-performance.test.ts`（新增）
- `packages/desktop/src/renderer/test/review-diff-virtualization.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`
- `scripts/fixtures/create-review-performance-repo.mjs`（新增）
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/core-review-large-diff-loading.md`
- `docs/exec-plans/active/20260730-review-workbench/README.md`
- `docs/QUALITY_SCORE.md`
- `docs/histories/2026-07/`
- `docs/learnings/2026-07/` 或实际完成月份目录

## Task 8.1：确定性性能 fixture

脚本生成四类 disposable Git repo：

1. 8 files / 500 changed lines，必须为 Standard。
2. 129 files，必须因 file-count capped。
3. 20 files / 9,001 changed lines，必须因 changed-lines capped。
4. 1 large file / >12 MiB estimated bytes，必须因 changed-bytes capped。

Fixture 只写临时目录，不污染当前 worktree，不依赖网络或真实用户 remote。

## Task 8.2：数据面预算断言

- Standard tracked fixture 使用批量 patch，不出现每文件一条 Git diff。
- capped 首屏只请求 selected file；Expand、Files、Jump menu open 不扩大请求集合。
- Branch fixture 只计算一次 upstream/merge-base/divergence。
- untracked 峰值并发不超过 8，full-content object batch 不超过 4。
- Refresh/scope change 会取消旧 generation，失败 pending cache 可重新请求。
- 日志不再出现由 Review fan-out 触发的 `spawn EBADF`；测试以 command lifecycle 断言为主，不依赖字符串偶然缺失。

## Task 8.3：Renderer 预算与交互回归

- 9,000 行虚拟 fixture 的 live Diff row DOM 不超过 1,000。
- Standard 展示全部文件 section；capped 只挂载当前文件并显示底部说明。
- 文件树在两种模式都展示当前 snapshot 全部文件。
- whitespace toggle 生成新 snapshot；full files off 不请求正文；word wrap/split 不重取 patch。
- Scope、Options、Expand、Jump、Files、Commit menus 仍通过 portal 正常点击。

## Task 8.4：真实 Electron 验收

按 `docs/FRONTEND_VERIFICATION.md` 使用 `pnpm dev:log` 启动：

1. Standard fixture：连续滚动全部 Diff、Jump、Expand/Collapse，聊天区仍可操作。
2. Capped fixture：快速切换至少 20 个文件，确认上一请求不会覆盖当前 selection。
3. capped + Expand：文件树保留全部，中央仍只有一个文件，底部提示稳定。
4. 切换 whitespace、full files、word wrap、word diff、split/unified，确认语义和 loading 状态。
5. 浅色/深色、390px/620px Review 容器截图检查，无遮挡、溢出和点击失效。
6. 检查 `logs/latest-dev.log` 中 Review command count、取消和失败记录，无永久 Loading 或持续 EBADF 风暴。

自动化通过与 Electron 手动验收分开记录；真实 Push/Create PR 仍由用户单独决定是否执行。

2026-07-31 实际进度：通过 worktree 专属 bundle ID 自动操作真实 Electron。capped 模式下 Scope、Options、Files、Jump、Collapse/Expand、Commit 菜单均可点击；文件树保留 183 个文件，中央单文件切换与连续三屏滚动无永久 Loading，底部提示稳定。未执行 mutation 或远端动作。Standard、浅/深主题、390px/620px 与至少 20 个文件快速切换仍待验收。

## Task 8.5：文档与学习沉淀

- 将实现后的准确类型、阈值、命令预算和验证结果回填两份 Review 设计文档。
- README 中 Plan 5–8 全部完成后，才恢复“工程实现完成”状态。
- 按 `docs/HISTORY_GUIDE.md` 记录本轮纠偏，不覆盖原有 Review 功能历史。
- 本轮命中可迁移、有深度、有陷阱和有模式，按 `docs/learnings/WRITING_GUIDE.md` 记录“UI 展开状态不能直接充当后台请求集合”的架构学习。

## 全量验证

```sh
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared test
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build
pnpm check:frontend-theme
pnpm check:docs
git diff --check
```

## 完成条件

- 四类 fixture 的模式、命令数、并发和 DOM 预算全部有自动化证据。
- Electron Standard/capped 核心路径完成真实操作验收并保留截图或日志记录。
- 不存在永久 Loading、后台全文件 fan-out 或 full files off 仍读取正文。
- 文档、history、quality 和 learning 与最终实现一致。

## 回退

若某一层验收失败，只回退对应 Plan 的接线并保留前一层已验证契约；不得恢复旧的 Expand all 逐文件并发路径作为临时发布方案。
