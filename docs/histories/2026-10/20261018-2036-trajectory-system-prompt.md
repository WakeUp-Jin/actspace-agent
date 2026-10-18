# 2026-10-18 20:36 | 轨迹系统提示词 / 工具显示修复

## 用户诉求

轨迹里的系统提示词和工具显示不对，对照 DeepSeek Harness 检查并修复，同时检查其他缺字段的问题；修完后写一份给 Codex GPT-6.1 用 Computer Use 逐条点击验收的合格标准文档。

## 本轮变更

- 根因：历史窗口精简较早的 `request/context` 时丢掉了系统提示词和工具，重开会话后初始系统行为空、多出假的「已更新」行、早期工具 Schema 不可用。
- runtime 历史窗口在第一次请求和变化时保留提示词与工具，其余标 `promptUnchanged`；renderer 沿用上一份，系统行只比较提示词正文和工具，按对比给出四种文字。
- 顺带修：用户行归入所在轮次、上下文行带开始时间、只有思考的助手搜索预览不为空。
- Codex 验收说明 `tmp/codex-acceptance/brief-20261018-trajectory-system.md`；执行记录见 [exec-runs](../../exec-runs/20261018-trajectory-system-prompt/execution-summary.md)。

## 核对结果

- 3 个本机真实会话精简与完整构建对比一致；runtime、Desktop 全量测试、typecheck、前端三项检查通过。
- 未做 Electron 实机验收；未提交、未推送。
