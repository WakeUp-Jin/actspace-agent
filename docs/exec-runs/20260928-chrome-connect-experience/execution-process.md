# Chrome 扩展连接、启动与使用体验闭环 — 执行过程

- 关联计划：`docs/exec-plans/active/20260928-chrome-connect-experience.md`
- 模式：交互
- 开始：2026-09-28
- 状态：进行中

## 基线

- HEAD：`186a18bbeb7d37243daa61c2e3da27e9c9eaa9a3`，detached worktree。
- 开始实施前工作区仅有本轮生成的计划和索引改动；没有改写其他用户文件。
- 2026-09-28 开始前核对源码，发现固定 socket、启动时 ready 快照、每次调用 session.start/end，与计划描述一致。

## 执行时间线

- 2026-09-28：用户授权开始实施。读取计划、仓库规范和相关源码，开始 T1。
- 2026-09-28：实现每个 Native Host 独立 socket、扩展实例 ID、私有实例记录、Chrome 图标点击选择；Browser transport 按 Turn 复用并在结束时清理。
- 2026-09-28：实现随包组件清单与 hash 校验、受管安装、连接意图持久化、固定渲染器 IPC 和 Chrome 连接向导；Runtime 加入空闲重组和失败恢复。
- 2026-09-28：真实 Electron 干净数据目录检查到未连接入口。发现本机已有旧 Native Host 登记，后续安装验证使用独立 manifest 路径，保留用户登记。
- 2026-09-28：针对首轮测试发现的修复重登记、挑战过期、开发态资源路径、重组期间英语学习订阅和签名后 hash 进行修正。
- 2026-09-29：补齐在线 Host 身份核对、Turn ownership 清理、取消本地等待、Runtime 安全重组回归及分层状态合同；最新代码通过 Desktop 全套 842 项和 root test。已生成 unsigned arm64 DMG 与 tar，随包资源验证通过。
- 2026-09-29：准备复查最终 Electron UI 时，Computer Use 返回“Mac is locked and automatic unlock could not unlock it”。未继续界面操作，也未点击本机组件安装或 Chrome 扩展加载；相关操作授权仍待用户回复。
- 2026-09-29：用户确认继续并保持 Mac 常亮。按 A01–A16 验收点、G1–G6 场景分组继续。独立 Electron 测试目录初次点击“开始连接”失败于开发 wrapper 的组件资源路径；修正资源解析、重建后再次点击，原有个人 Native Host 来源保护阻止覆盖。记录原 manifest SHA-256 后暂存，第三次点击成功注册测试 Host。
- 2026-09-29：通过真实 Chrome UI 新建未登录测试资料 A，打开扩展页、启用开发者模式、Load unpacked 选择受管扩展目录；版本 0.2.2 已启用。最初测试版使用隔离 `ABB_SUPPORT_DIR`，Chrome 拉起的 Host 未继承该环境变量，故 ActSpace 保持等待；以与 Chrome 相同的默认 Host 支持目录重启测试版后，ActSpace 自动显示已连接，Host/扩展/Agent 三层完成；只读 tabs probe 返回空数组。独立测试版无 Provider，未进行真实对话。
- 2026-09-29：重启测试版后自动恢复连接；点击断开、再次重启仍保持断开；重新点击连接后自动接入。新建未登录 Chrome 测试资料 B，加载同一扩展，两个实例 ID 不同，A 绑定未被抢占。点击“更换 Chrome 用户资料”后在 B 的扩展菜单点击图标，ActSpace 自动切换目标并重新接入。
- 2026-09-29：双资料下详情中 `local_rpc_socket` 因 CLI 默认 socket 歧义误报 offline；Desktop 以实际选中 socket 的只读 probe 归一化诊断，并补定向断言。两个测试资料扩展均通过 Chrome UI 停用，测试版 Electron 停止，个人 Native Host manifest 按原 SHA-256 恢复。没有改动个人 Chrome 资料或用户页面。
- 2026-09-29：在不重启测试扩展的情况下复开独立 Electron，观察停用扩展后的等待状态；“复制目录”粘贴到能力搜索框得到完整受管路径，清空后恢复；“在 Finder 中显示”使 Finder 选中该 extension 目录。连接页的浅色、深色等待状态截图目视检查，随后恢复测试版原有“跟随系统”主题。个人 manifest 再次核验 SHA-256 不变，实时实例记录为零。
- 2026-09-29：最新代码重新生成 unsigned arm64 DMG/tar 并核验包内 Browser 组件。直接运行源码目录外的 unsigned app 被 macOS 以无可用签名拒绝；改用仓库打包脚本的 `ACTSPACE_MAC_ADHOC_SIGN=true` 构建本机临时签名副本，签名验证和组件核验通过。将 app 复制到 `/tmp` 后独立启动，真实界面正常显示未连接入口且无白屏；未点击安装，个人 Host 登记未变。该结果仅证明本机临时签名包的启动和初始 UI，不等同 Developer ID/公证或包外完整连接。
- 2026-09-29：用户授权在隔离测试版复用既有模型配置与凭据。真实 Electron 对话初次在 Provider 请求前因 `typebox` 导入失败，临时补测试工作区依赖链接后恢复。此链接在验收后删除，发布态依赖解析尚需重新确认。重启时一个失效测试会话曾返回 `SESSION_WRITER_LOCKED`，改为新会话后运行，不把该错误归因于 Chrome。
- 2026-09-29：真实 Agent 首次 `browser_user.open_tabs` 返回隔离资料的标签；批准认领后，读取失败为 CDP `Session with given id not found`。查明 Agent 的 `sessionId` 被透传给扩展 CDP 的同名字段，改为独立 `cdpSessionId`，扩展 primitive contract 先红后绿。重载受控测试扩展后，真实对话按顺序认领、读取 Alpha 短语、截图成功；下一 Turn 再认领、导航 Beta、读取 Beta 短语和截图成功。双资料详情中的已选 socket 诊断也经真实 UI 复查为 `ok`。
- 2026-09-29：停止一次失败 Turn 后，恢复会话曾白屏。开发者工具确认旧泛型工具消息缺少 `toolName` 时直接 `.startsWith()` 抛错，补可选字段防护与先红后绿回归；重载后会话可恢复。两张截图原本只出现在工具结果的 artifact ID 中，于通用 tool preview、会话消息及既有产物面板贯通图片引用。重建后在真实会话点击“Chrome 截图”，右侧面板打开 Beta JPEG，画面与 Beta 页面一致。
- 2026-09-29：默认权限下真实认领和导航分别出现审批卡。认领获准后拒绝导航，工具返回 `user-denied`；独立 Chrome 测试资料 URL 与正文保持 Beta。再以认领→30 秒等待→导航批次验收停止：批准后在等待期间点击“停止 Agent”，工具显示停止及可能已开始副作用的提示，后续导航未执行，Beta 页面不变；界面未白屏。Host crash、service worker 重启、已发往 Chrome API 的终态等仍未执行。
- 2026-09-29：停用测试资料 B 扩展；个人 Native Host manifest 由临时备份恢复并按原 SHA-256 校验，停止测试 Electron 与 fixture server，删除隔离凭据副本和临时依赖链接。检查 4 个隔离 Journal 共 3490 事件，未发现 base64 图片标记、credential 字段或 probe tab 字段。检索范围和模式有限，不冒充完整隐私审计。
- 2026-09-29：截图产物面板在真实界面虽然能打开图像，但行文字仍显示 artifact UUID 且标题误称 `Generated 1 image`。已改为显示“Chrome 截图”与中性图片数量，定向 20 项通过。最新源码再次打包为本机临时签名 arm64 DMG/tar，签名和 Browser 组件校验通过；该新包尚未做源码目录外完整连接。

## 验证记录

- `go test ./...`：CLI、protocol 各自模块通过；Go workspace 根目录不是可运行的 module 前缀。
- `pnpm check:browser`：通过，含扩展 primitive contract。
- `pnpm --filter @actspace/tools-browser-tools test`：3 个文件、12 项通过。
- Desktop 全套：117 个文件、842 项通过。
- `node --test scripts/test/browser-components.test.mjs`：hash、架构、缺失文件检查通过。
- `pnpm --filter @actspace/runtime... build`、`pnpm typecheck`、`pnpm test`、最终小修后的 unsigned arm64 `pnpm package:desktop`：通过，DMG 与 tar 均重新生成且随包组件校验通过。
- `pnpm check:frontend-theme`、`pnpm check:frontend-tokens`、`pnpm check:repo`、`git diff --check`：通过。
- `pnpm check:docs`：被原有站点计划已完成却留在 active 的状态不一致阻挡，本轮未改动该无关文件。
- 真实 Electron：G1 初始未连接入口已观察；其余点尚未按实机完成，不算通过。
- 真实 Electron + Chrome：A01、A04、A07、A08 通过；A02–A03、A05–A06、A09–A12、A14–A16 局部覆盖；A13 未覆盖，详见按验收点摘要。
- 新增诊断修正后，Desktop `typecheck`、定向 BrowserBridgeService 8 项和 `git diff --check` 通过。首次定向测试被正在运行的真实 Native Host 实例干扰，另一次因人为设置 `ABB_SUPPORT_DIR` 与既有默认路径断言冲突；停用测试扩展、恢复环境后原命令 8 项通过。修正后的详情文案尚未重新做真实 UI 复查。
- 最新源码重新执行 `pnpm package:desktop`（unsigned）与 `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop`（本机临时签名）均通过，DMG/tar 生成，包内 Browser 组件验证通过。临时签名包已做源码目录外启动与首次入口界面检查；正式 Developer ID 签名、公证和包外连接仍未验证。
- 当前增量验证：扩展 primitive contract 通过（包含 Agent/CDP Session ID 隔离断言）；Go protocol 全套通过；Go CLI 全套在停用测试 Host 后通过；Client 9 项通过；Desktop 截图、可选 `toolName` 和审批定向 30 项通过；Desktop renderer build/typecheck 通过。最新跨层修复发生在上次包构建之后，不能把此前包视为最新代码制品。
- 第二次最新代码 `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop` 通过，生成 arm64 DMG/tar；制品 `signature: ad-hoc`、`notarized: false`。`pnpm check:repo`、`pnpm check:browser`、`git diff --check` 通过，`pnpm check:docs` 仍被无关的站点计划 active/completed 状态矛盾阻挡。并行打包时全仓 `pnpm test` 为 843 通过、1 失败；失败项在长文件渲染测试，随后单独重跑该文件 9 项通过。未确认失败是否由资源争用引起，全套不得记通过。
- 不再并行打包后，Desktop 全套 Vitest 117 文件、844 项通过；这确认当前 Desktop 测试通过，但并行那次根 `pnpm test` 的退出码仍为 1，不能倒写成根命令通过。组件清单测试与最新包内清单校验再次通过；签名用打包脚本规定的 `codesign --verify --no-strict` 校验通过，`--strict` 因 Electron framework 的 bundle 格式报告歧义，不属于本机临时签名承诺。
- 随后根 `pnpm test` 的一次失败发生在 Sidebar 测试：fixture 对四条会话分别取 `new Date()`，跨毫秒后排序不稳定，断言却假定固定首项。将 fixture 时间固定，Sidebar 单文件 39 项通过。另一根测试复跑中 CLI 三次 run/resume 用例实测约 6 秒，超过原定 5 秒预算；单独 20 秒预算通过，因此把该用例预算改为 20 秒并复验。该轮根测试仍因 CLI 旧预算退出 1。
- 第三次根 `pnpm test` 的 CLI 已通过，但并行 Desktop suite 中长文件渲染和两个轨迹 UI 用例触发 5 秒超时，最终 841 通过、3 失败。三个文件单独合计 20 项全部通过（长文件用例 4.6 秒，接近原阈值）。根命令仍不通过，可能与并行负载有关但未证明。随后最新 Electron 重启恢复旧对话，“Chrome 截图”行与右侧 Beta 图片均正常；扩展停用显示“等待 Chrome 扩展连接”，高级入口文案可见。窄窗拖动未成功改变窗口大小，不计为覆盖。验收 Electron 已停止。
- 仅对长文件渲染与两项轨迹高负载 UI 用例提高时间预算后，Desktop 全套 117 文件、844 项通过。下一次根测试与 `pnpm typecheck` 被误并行执行，后者先清理 shared dist，前者在清理窗口报告找不到 `@actspace/shared`；根命令退出 1，typecheck 通过。最后只运行 `pnpm test`，根命令退出 0，Desktop 仍为 117 文件、844 项通过。该结果为最新自动化基线。
