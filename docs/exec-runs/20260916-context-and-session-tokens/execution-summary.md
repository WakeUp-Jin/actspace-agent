# 验收摘要

实现与自动化验证已完成；真实 Electron 窗口仍需在 macOS 解锁后人工验收。

自动化证据：Desktop 7 个相关测试文件、145 assertions；Runtime browse 6 tests；Session projection 2 tests；shared/session-projection/runtime typecheck、renderer build、Electron build 均通过。Desktop 全量 typecheck 仍被并行修改的其他测试文件三处既有类型错误阻断。

## 人工验收路径

1. 打开有长工具调用的会话，比较输入框百分比、Context 弹窗和右侧分项；应一致，标题保持「上下文」。
2. 顶部会话详情只显示一行「累计 Token：xxx」，没有下拉、说明和上下文进度条。
3. 对可压缩的测试会话执行压缩：上下文占用下降，累计已报告用量不下降。
4. 再发送一句“仅回复收到”：上下文更新为本次请求的统计；摘要只计算一次。
5. 加载更早历史、切换会话和重启，统计不应因 UI 分页变化。
