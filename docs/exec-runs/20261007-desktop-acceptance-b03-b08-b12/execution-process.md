# B03 / B08 / B12 — 执行过程

- 关联计划：[修复计划](../../exec-plans/active/20261007-desktop-acceptance-b03-b08-b12.md)
- 执行模式：交互；用户已批准三项方案。
- 初始基线：main d7eb0431；已有未提交内容均为上一阶段验收产物，保留。

## 2026-10-07：实施准备

- B03：renderer订阅`reviewChanged`，主进程转发coordinator通知，但当前生产入口没有文件监听调用`scheduleInvalidation`。
- B08：Desktop搜索端口创建时读取一次`searchCredentials`；后续搜索闭包复用该对象，与同会话断开后仍有provider的实测相符。将以实际fetch请求回归确认。
- B12：`runLocation`仅进入Composer展示；`ensureSession`、`createSessionForInput`和main建会话请求未传递工作树意图。既有`prepareExecutionContext`已提供真实Git创建与回滚能力，优先复用。
- 尚未改产品代码，接下来先建立失败回归。
