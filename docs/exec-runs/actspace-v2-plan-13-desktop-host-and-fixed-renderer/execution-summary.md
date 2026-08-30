# ActSpace v2 P13：Desktop Host 与固定 Renderer - 执行摘要

## 结果

Desktop 已具备 v2-only wiring、typed IPC、固定 renderer、allowlisted image renderer、generic Tool fallback 和无丢失初始 replay 协议。Provider settings、Main-only LLM/search/image/额外 credential、价格倍率、OpenRouter 远端模型目录、模型管理、连接/余额/用量、system prompt、appearance、真实 Quick Open、approval、Session-owned attachment/artifact、Inbox、Todo、child Agent、Compaction、Usage/Analysis、Session metadata 和 settings v3 fail-closed migration 已接通；credential IPC 只返回脱敏状态，非法 provider 在 Main 边界拒绝。模型目录由 Main scoped proxy 请求并经过运行时校验、原子 last-good 缓存和坏缓存隔离，固定 Renderer 只消费归一化 DTO。固定桌面壳还重新接通了 Workspace 文件浏览和 worker-isolated Git Review，并恢复左右侧栏 pointer/keyboard resize 和右栏互斥；Terminal 的 main/preload 契约与 shutdown ownership 已恢复，并在 native/UI 依赖缺失时 fail-closed。Desktop 32 个测试、typecheck、production build 和 root build 通过。

P13 的源码接入与本地制品验证已完成。依赖通过用户批准的本机代理恢复，Desktop production build、root build、managed CLI package 和 real development Electron 均已验证；真实 Electron 启动确认使用的是原有固定 Renderer 外壳，而不是临时 Runtime v2 demo workbench。真实 Provider 请求、真实 Chrome 扩展操作和签名发布仍属于人工验收边界，本轮没有自动发起付费模型请求或浏览器动作。

## 安全边界

- Renderer 不接触 Cordis Context、filesystem 或 credential。
- 不接受后端插件 HTML / JS / CSS；前端设置页中的“扩展”仅指 Host Extension，例如 Browser Bridge。
- attachment 先导入 Session-owned artifact store，`inspect_image` 与打开 artifact 都按 Session 授权；Renderer 不接触原始文件路径。
