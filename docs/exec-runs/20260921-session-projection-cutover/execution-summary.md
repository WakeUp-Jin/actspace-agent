# 执行摘要

状态：实现与自动化验证完成；真实 Electron 验收已尝试，但运行环境缺少 Electron 可执行文件。未提交或推送。

## 完成内容

- SessionReadModel 统一注册并消费 Host facts；Registry 增量、重放、checkpoint/restore 共用 definitions。
- 冷读以可删除 checkpoint 恢复内部状态并读取 Journal 尾部；缓存损坏、删除、版本变化及日志截断可重建。
- Desktop IPC 返回 Host facts 与 raw event window；Client 分别构建 Chat、Trajectory、Tool Card。历史窗口按 10 个完整 Turn 分页，全会话水位与页尾水位分离。
- 删除被替代的 Main 展示投影、revision observer、browse index、Host trajectory/product projections 和旧 cache helpers，清除对应失效生成物。仍用于 Session 恢复与 compaction 的 projection 保留。
- 修复 reducer 原地修改污染、工具 failed 终态、后台 Bash 结构化 task detail、完整复制与大工具延迟读取边界。测试 fixture 经公开 testing 子入口共享，不再深引用其他包的 src/test。
- 同步当前设计、计划、history、学习记录与 Electron 验收脚本。Goal 没有业务事件 producer，本次未制造空壳兼容实现。

## 已执行验证

| 检查 | 结果 |
| --- | --- |
| Runtime 依赖闭包与 Client build | 通过 |
| Desktop renderer / Electron build | 通过；renderer 保留现有大 chunk 提示 |
| Desktop typecheck | 通过 |
| Desktop 全量单测 | 105 files / 750 tests 通过 |
| 最后修改后的 Desktop 定向回归 | 4 files / 47 tests 通过 |
| Session projection / cache / Client | 6 / 1 / 6 tests 通过 |
| Core AgentLoop / Core tools | 16 / 18 tests 通过 |
| 最终 Runtime | 6 files / 11 tests 通过，含大工具分页/完整读取与 failed 状态 |
| check:packages | 35 manifests 通过，深源码引用为零 |
| check:v2-legacy-removal | 通过 |
| check:docs / check:current-docs / git diff --check | 通过 |
| check:package-cutover | 非 strict 扫描结束；3 条官网 `/eval` 路径提示，未宣称全仓 strict gate 通过 |

## 未通过或未执行的外部门禁

隔离 Electron 脚本已尝试运行，失败于加载 Electron：`Electron failed to install correctly`。应用未启动，因此真实 IPC/分页交互/重载/截图不计为通过。脚本已迁移到 beforeSeq 和 journal-update 契约，可在 Electron 安装完整的环境复跑。

真实 Provider、安装包/签名、超大真实 Journal 性能与人工视觉验收未执行。缓存首次重建仍会扫描完整 Journal；本次不宣称首读性能上限。保留用户已有改动与 Session 数据。

## 入口

- [当前设计](../../design-docs/agent-plugin-runtime/agent-target-session-persistence-projection-architecture.md)
- [完成计划](../../exec-plans/completed/20260921-session-projection-cutover.md)
- [学习记录](../../learnings/2026-09/20260921-session-facts-and-views.md)
