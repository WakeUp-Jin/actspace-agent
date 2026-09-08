# ActSpace v2 P13：Desktop Host 与固定 Renderer - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-13-desktop-host-and-fixed-renderer.md`
- **执行模式**：交互
- **开始时间**：2026-08-22
- **当前状态**：v2-only 接入、本地自动化、依赖恢复、制品构建和开发态 Electron 验证完成；真实 Provider/Chrome 仍由用户手动验收

## 已执行

1. 新增 Desktop Runtime v2 loader、Host adapter、credential / approval / workspace / artifact / Browser ports 和每进程 Runtime registry。
2. 新增 namespaced typed IPC/preload；Main 保存 512 条有界 live-event replay，Renderer 使用 subscribe + snapshot + replay + de-duplicate 完成初始握手。
3. 保留原有固定 Renderer 外壳，接入 v2 generic Tool block、diagnostics 投影和 typed IPC；不加载后端插件前端代码，也不引入第二套前端页面。
4. app quit 路径等待 Runtime registry flush/dispose；Desktop 源码入口固定为 v2-only。
5. 接通 provider credential/settings、approval、Session-owned attachment/artifact、Inbox、Todo、child Agent、Compaction、Usage/Analysis 和 Session metadata；API key 不回传 Renderer。
6. Tool renderer hint 由 Runtime allowlist 校验；固定前端只内置 `actspace.image-gallery`，未知、非法或抛错的特化始终回退 generic block。
7. settings 磁盘格式升级到 v3；从完整 v2 迁移前创建原文备份与 SHA-256，冲突、畸形或不支持的设置阻止启动且不覆盖原文件。
8. 新增 `runtime-v2:shell:*` 固定桌面壳契约和 IPC，重新接通 Workspace registry、受根目录约束的文件浏览/预览、Git Review snapshot/diff，并继续用 Review worker 隔离 Git 和 patch 解析。
9. 右侧 Workspace / Review / Terminal 三 Tab 回到固定前端；Terminal main/preload 会话契约和 quiescent shutdown 已接回，依赖缺失时报告结构化 unavailable，不影响 Workspace、Review 或 Agent Runtime 启动。
10. 左侧 Session 栏和右侧 detail panel 恢复 pointer/keyboard 可调宽度；Settings、Analysis 与 Workspace shell 改为严格互斥，避免隐式 grid 列和重叠面板。
11. 新增 `runtime-v2:configure-secret` Main-only credential 通道；固定 Settings 接通搜索与图片生成凭据、已安装模型启停，Renderer 响应只包含 `hasApiKey`，非法 provider 在进入 SettingsService 前拒绝。
12. 接通额外 provider credential、价格倍率、模型别名/credential 绑定/删除、system prompt 正文、三态主题/字体；Quick Open 重新拥有真实 Electron globalShortcut 注册与退出清理。
13. 新增 v2 `ProviderNetworkService`，通过 Runtime scoped proxy pool 执行无 prompt 连接测试、余额和 Tavily 用量；只返回归一化状态，不读取失败响应正文，不泄露 proxy/credential。
14. 接通 OpenRouter 远端模型目录：Main 通过同一 scoped proxy 下载，运行时校验并归一化条目，原子写入 last-good cache；固定 Renderer 支持搜索、刷新和添加，坏缓存隔离且刷新失败继续使用旧目录。

## 已验证

- Desktop 全量 10 个测试文件、32 个测试通过，覆盖 snapshot/replay/gap、approval、artifact 授权、settings v2->v3、Main-only secret redaction、搜索/图片/额外 credential、模型管理、OpenRouter 目录归一化/缓存/隔离/last-good/异常 payload、provider probe/balance 失败归一化、appearance/Quick Open、generic/specialized renderer、attachment DTO、Workspace/Review/Terminal 固定壳、侧栏 resize/右栏互斥和 shell IPC 降级。
- Desktop TypeScript renderer/electron 双配置检查通过；production Vite renderer 与 Electron main/preload build 通过。
- Runtime 全量 36 个测试文件、153 个测试通过，6 个真实 published-package smoke 默认跳过且显式门禁 6/6 通过。
- `createDesktopCoreToolPorts()` 已接入 Session-owned artifact reader、`inspect_image` 授权链和模型解析；缺少 vision model 时保持 fail-closed，不注册可执行 inspector。
- `pnpm check:frontend-theme` 通过；本轮文档更新后重新执行 `pnpm check:docs`、`pnpm check:secrets` 与 `git diff --check`。

## 人工验收边界

- 真实 Provider 请求、真实 Chrome 扩展操作、签名发布和用户侧视觉确认仍需人工完成；本轮没有自动发起付费模型请求或浏览器动作。
- packaged Electron 制品已生成并完成静态内容检查；未宣称签名、 notarization 或用户机器上的安装启动成功。
- Settings 本地等价面已覆盖 credential、provider probe/balance、OpenRouter 模型目录、模型管理、Agent prompt、Skills、Quick Open 和 appearance；真实 Provider 网络结果继续作为人工门禁。
- 通过用户批准的 `127.0.0.1:7897` 代理完成了依赖恢复和 managed/package 构建；临时 `dist-demo/` 已删除，普通 production bundle 不包含 demo facts。
