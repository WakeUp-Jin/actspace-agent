# 执行摘要

实现完成，未提交或发布。

## 已验证

- Subagent 10 项、Core Loop 14 项、Desktop 相关预览/活动/UI 37 项和工具流 6 项通过；App 子任务消息流/右侧入口定向用例通过。
- Runtime 依赖闭包 build；Subagent/Core Loop typecheck；Desktop typecheck、build:renderer、build:electron；主题检查和文档检查通过。
- 浏览器显式 fixture 使用真实组件，浅色布局可见，四种终态与正文区分清楚。
- 全 Desktop 测试不作为通过门禁：首次 700 通过、15 失败，其中旧子任务文案用例已更新通过；App 文件重跑 29 通过、2 个写入/工作区选择用例失败；其他失败包括模型上传器 mock 缺失。

## 人工验收

1. 启动 renderer 后访问 `/test-fixtures/subagent-activity.html`，切换浅深主题并连续点击“下一条活动”；确认翻页可读、没有正文跳动，卡片可点击。
2. 在最新 Electron 开发构建里对当前正确工作区发起两个只读子任务：确认 Agent / Explore 都只有四个工具，主行显示读取/搜索，点击进入对应子会话。
3. 取消主任务，确认子任务停止且不会被迟到状态重新激活。真实 Provider 的 300 步/30 分钟长任务未实际运行，预算与超时机制由受控测试验证。
4. reduced-motion 下确认不翻转；失败和停止立即展示。

最新 Electron 窗口、深色截图、连续动画观感及真实 Provider 验收尚未完成。没有修改用户 Session Journal、安装或接入外部图标库。
