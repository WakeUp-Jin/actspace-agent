# 消息流排版与工具摘要：执行过程

## 基本信息
- 关联计划：`docs/exec-plans/completed/20260916-tool-stream-typography.md`
- 执行模式：交互，用户已授权开始。
- 开始日期：2026-09-16。

## 执行时间线

### 启动与基线
- 复核计划、当前组件、工具投影和脏工作区；保留已有改动，不提交。
- 已在临时目录保存涉及生产文件的起始副本，回退以本次局部 diff 为界。
- 先建立真实组件 fixture，测量旧布局，再实施排版与摘要。

### 排版与摘要切片
- 实测旧组件：Thinking 14/20、500；带结果 Read 16/23.2，普通 Read 14/19.88；Bash 14/19.88、500。
- 修改后浏览器实测：Thinking、Read 两分支、Bash、Write 均为 14px/22px，折叠过程行之间 5px，过程与正文之间 14px。
- 间距由 message flow 分类负责，移除负 margin；复用 transcript 的容器使用一致过程间距。
- 保留 DeferredToolMessage 按需加载分支；未改分页/事件/审批。
- Bash 状态动作与命令分开，旧标题和完整原因进入详情；常规沙盒标签进入详情，真实环境/未执行提示保留。
- 发现 v2 Bash 的部分环境和退出码仅存在自由文本，按计划不反解析；保留原文。shared selector 补齐已有 intent 的透传。
- 107 项定向测试、76 项 shared 测试、desktop typecheck、renderer/Electron build、主题检查通过。构建只有既有的大 chunk 提示。

### 扩大回归范围
- desktop 全量测试首次 705/726 通过。Read 摘要拆成语义节点后，更新依赖单一文本节点的测试查询为文件名或可访问按钮名，保留行为断言。
- 另有与本轮无关的失败：自定义模型 mock 缺少 DeepSeekFileUploader 导出、写工具仍期待已退役的 is-streaming 容器、工作区选择仍期待 title: New chat。未修改这些产品行为或模型测试。
- 新的状态回归中，共享 selector 原本丢掉 Bash intent，已仅补这一已有字段；未改类型或 Journal。
- 定向追加测试：Worked/Explore/App 共 38 通过、2 范围外失败（旧写入进度断言、工作区创建参数）。

### 收尾
- 浅色桌面 Worked 完成态与深色 375px 窄列经过实际截图查看；窄列 scrollWidth 为 375。
- Computer Use 枚举没有当前 ActSpace 运行窗口；真实 Electron 和 system 双主题列为未完成人工门禁。
- 最终 typecheck、renderer build 与 docs 检查通过；清理本轮空行问题。计划按实现完成归档，未把人工门禁标成通过。
