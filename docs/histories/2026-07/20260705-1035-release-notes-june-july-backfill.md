# [2026-07-05 10:35] | Task: 回填 2026-06 中旬至 2026-07 的功能发布记录

## 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

## 📥 User Query

> `docs/releases` 是不是可以再度更新啦，更新一下吧，我最近添加不少功能。

## 🛠 Changes Overview

**Scope:** `docs/releases/feature-release-notes.md`

**Key Actions:**

- 以 git log（2026-06-05 之后共 19 个提交）与 `docs/histories/2026-06`、`2026-07` 的 history 记录为来源，回填发布记录。
- 新增 `## 2026-07` 分组，收录 7 条：Bash 沙盒 + 三级命令分级、Kairos 通知中心、Kairos soul 人格插槽、Kairos 主动性提示词重写（含巡检退役与读写授权分离）、fs-watch 插件与 Skills 管理、Bash 后台执行模型、工具/输入细节修复合集。
- `## 2026-06` 分组顶部补 7 条：write_file 截断安全阀 + kimi-k2.7-code、工具输出 raw prefix 压缩 + glob 元数据、Apache-2.0 开源与品牌成型、历史重建顺序 400 修复 + Review 图片预览、Kairos 缓存/thinking/压缩接线、Kimi 备用主模型、Explore 子代理与消息流折叠/会话排序/自动标题。
- 纯内部重构（如 conversation.compress 充血模型改造）按 README 规则未收录。

## 🧠 Design Intent (Why)

- 发布记录上次更新停在 2026-06-05，此后一个月的用户可感知功能（尤其 Bash 执行模型三连和 Kairos 一系列升级）都缺失，需要按「先用户价值、后变更摘要」的既有格式回填。
- 同一天多条 history 若属于同一主题（如 7/3 的三份 bash 后台执行记录），合并成一条发布条目，避免记录变成提交日志。

## 📁 Key Files

- `docs/releases/feature-release-notes.md`
