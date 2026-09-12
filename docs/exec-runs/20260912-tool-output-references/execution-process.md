# 执行过程

- 用户批准大输出回读、artifact 类型、图片协议和错误展示修复。
- 基线：已安装构建离线复现 text/plain artifact 被转换为 tool image，在 SDK stream 前被 DeepSeek 校验拒绝；没有网络请求。
- 在 Core 添加两条回归并运行，确认修改前为红灯：文本被误当图片、turn/end 缺少 failure。
- Core 按 MIME 分流文件/图片；通过 Host resolver 恢复文件路径，并将实际归一化消息纳入 request snapshot。Desktop 与 CLI 接通 resolver 和读取权限。
- pi-ai/legacy wire 共用图片角色归一化；并行 tool results 完整后才追加视觉观察，Anthropic 保留结果内图片。
- turn/end 保存脱敏失败；实时适配器与恢复投影显示同一原因，旧失败记录提供兜底。
- 红灯转绿；真实 Bash 文件回读链路、图片协议、跨 Session 拒绝、丢失引用与大文件搜索验证通过。
- Desktop 全量及相关 package 测试通过。Runtime 闭包、Desktop/CLI 类型、renderer/Electron/CLI 构建通过。Vite 保留既有大 bundle 提示，不是构建失败。
- 未修改已有用户 Journal、凭据或安装包。工作区原有前端与 workspace 修复保留。
