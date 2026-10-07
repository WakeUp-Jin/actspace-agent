## [2026-10-07 23:00] | Task: 清理未推送历史中的验收媒体

### Execution Context

- Agent ID：`/root`
- Base Model：本次会话未提供可核验的精确型号
- Runtime：Codex desktop

### User Query

> 已配置图片忽略规则，但 push 仍因大包传输超时；同意清理历史中的过程图片。

### Changes Overview

- 实时查询远端 main，确认基线为 `241c946f44f60a97997f79f3eda43b94eb54e3a3`，本地有 27 个未推送提交。
- 在仓库外生成并校验完整 main bundle、工作区/暂存区 patch、索引及未跟踪文件备份，保留旧新提交映射。
- 使用独立临时索引，只重写基线之后的 27 个提交，清除 `docs/exec-runs/` 图片与录像，共涉及 676 个媒体路径；保留作者、时间、提交说明和父提交拓扑，保留空提交。
- 逐提交确认树差异只有目标媒体；最终新旧树只差两段录像，因为图片已在末尾提交取消跟踪。
- 通过旧提交比较更新 main，未移动其他分支、未重写已发布基线、未推送或强推。
- 补齐 MOV/MP4/WebM/M4V 忽略规则及媒体回溯边界。

### Validation

- 同样的 thin pack 计算方式下，待推送包从 190.02 MiB 降至 1.93 MiB。
- 切换前后工作区及暂存区 patch 一致；690 个本地媒体文件 SHA-256 一致。
- 新 main 仍是远端基线的后代；未推送提交数仍为 27。
- 旧提交 hash 可能出现在历史文档中；这些历史引用不批量改写，可使用清理前 bundle 与映射追溯。

### Files Modified

- `.gitignore`
- `docs/exec-runs/README.md`
- 本 history；本地 main 的未发布提交历史。

### Learning Assessment

本次为已有 Git 忽略与历史边界的操作维护，不单独新增 learning。
