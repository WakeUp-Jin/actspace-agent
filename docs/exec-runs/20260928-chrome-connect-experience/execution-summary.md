# Chrome 扩展连接体验 — 执行摘要

- 计划：`docs/exec-plans/active/20260928-chrome-connect-experience.md`
- 状态：源码实施与自动化验证进行中；首次连接、双 Chrome 资料和真实 Agent 浏览器对话已做界面验证，其余验收未完成，计划保持 active。

## 变更

默认能力入口现提供随包组件的 Chrome 连接向导，源码入口折叠到高级选项。main 持久化连接意图并返回分层状态；Go Host 每扩展实例使用私有 socket，Desktop 核对在线实例身份。Runtime 在安全空闲时重组，Browser transport 在同 Turn 复用；Browser 写操作接入权限模式，取消停止后续批次和本地等待。组件随桌面包构建，安装前验证 hash、架构、扩展身份，失败时回滚受管文件。

## 自动化证据

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 最新 Desktop 全套 Vitest | 117 文件、844 项通过；无并行打包时复跑 | mock/fixture，不证明 Chrome 实机 |
| Browser Tools | 12 项通过 | 含授权、socket 取消和协议 |
| Go CLI race、protocol tests | 通过 | 模拟 Host 和协议 |
| `check:browser`、`typecheck`、主题/token、`check:repo` | 通过 | 静态与程序检查 |
| 组件清单测试 | 通过 | hash、缺文件、错架构 |
| 最新本机临时签名 arm64 打包 | DMG、tar 生成；app 签名及包内组件校验通过 | ad-hoc 签名不等于 Developer ID、公证或最新包外 Chrome 握手 |
| 最新全仓 `pnpm test` | 最终串行重跑通过；Desktop 117 文件、844 项通过 | 早先并发负载下的超时已通过定向时间预算修正；不要与实机验收混同 |
| `check:docs` | 失败：既有站点计划自称完成但留在 active | 未改动无关文件 |

## 按验收点报告

计划中的 G1–G6 是操作路线，下面 A01–A16 才是覆盖范围。2026-09-29 用户确认继续后，在独立数据目录的真实 Electron 和两个新建、未登录的 Chrome 资料中执行 G1 与 G3 的连接路线。首次连接时 UI 安装了随包 Host，Chrome 从受管目录加载 0.2.2 扩展，ActSpace 无刷新自动显示“已连接”；运行时 Host、扩展、Agent 三层为已接入，直接只读 `abb tabs` 探测成功且返回空列表。第二资料加载后原实例仍保持绑定；在 ActSpace 发起更换并点击目标资料扩展图标后，目标实例变化且 Agent 再次自动接入。原有个人 Native Host manifest 已按 SHA-256 核对恢复，两个测试资料的扩展均已停用。

真实界面发现并修正了开发 wrapper 资源路径、双资料 socket 诊断、Agent Session ID 与 CDP Session ID 混用、旧工具消息缺少 `toolName` 导致恢复后白屏，以及截图只有 artifact ID 而没有可点击预览的问题。选中 socket 的诊断已在真实连接详情复查为 `ok`。隔离测试版使用用户已授权复用的既有模型配置与凭据，真实 Agent 对话成功列出标签页、认领、读 Alpha 页面、导航 Beta 并读出短语；Beta 截图在会话右侧面板打开且画面目视核对。默认权限下认领和导航分别出现审批卡；拒绝导航返回 `user-denied`，Chrome 保持 Beta。批准批次后在等待中点击停止，工具报告停止，后续导航未执行。测试扩展已停用，个人 Native Host manifest 按原 SHA-256 恢复，隔离凭据副本已删除。最新源码已再次打入本机临时签名 arm64 DMG/tar；此前移出源码目录的包只验证首次入口，最新包尚未做包外 Chrome 完整连接。

| 点 | 状态 | 已有证据；仍需检查 |
| --- | --- | --- |
| A01 首次启动 | PASS | 独立开发态与源码目录外的本机临时签名 arm64 包均正常显示首次入口；未点击前个人 Host manifest 不变，无静默登记、源码或 Go 要求 |
| A02 随包安装 | 未覆盖完整 | 真实 UI 点击开始连接并安装 Host；首次开发资源路径失败已修复，安装失败恢复路线未覆盖 |
| A03 Chrome 引导 | 未覆盖完整 | “打开扩展页”真实生效；复制后粘贴得到受管目录，Finder 正确选中该目录；按指引 Load unpacked 成功，忙碌态未逐项检查 |
| A04 自动连接 | PASS | 真实 Chrome 扩展加载后 ActSpace 无手动刷新自动显示已连接；Host/扩展/Agent 接入，空 tabs 只读探测成功 |
| A05 晚加载/忙碌 | 未覆盖完整 | 晚加载在 A04 覆盖；真实后台任务等待空闲未覆盖 |
| A06 再次启动 | 未覆盖完整 | 真实 ActSpace 重启后自动恢复；Chrome 关闭再开未覆盖 |
| A07 多 profile | PASS | 两个未登录测试资料各有不同实例；原绑定不被第二资料抢占；显式选择 B 后目标变化并接入 |
| A08 对话使用 | PASS | 真实 Provider 对话列 tabs、认领、读 Alpha、导航 Beta、读 Beta、截图；两次 Session artifact 均有按钮，Beta 截图在右侧真实打开并与页面一致 |
| A09 授权 | 未覆盖完整 | default 下认领与导航分别批准；拒绝导航得 `user-denied`，Chrome URL/正文仍为 Beta；批次停止未执行后续导航。批次参数/目标变化与 full-access 语义未实机验收 |
| A10 停止断线 | 未覆盖完整 | 批次等待中点击停止，工具给出停止与副作用可能已发生的提示，后续导航没有执行，恢复后未白屏；Host crash、Chrome 关闭、service worker 重启和已进入 Chrome API 的终态未验收 |
| A11 分层恢复 | 未覆盖完整 | Host 来源冲突的真实保护错误出现；停用扩展并重启 Electron 后 UI 显示“等待 Chrome 扩展连接”；双资料已选 socket 诊断在真实 UI 为 `ok`；其余故障尚未执行 |
| A12 主动断开 | 未覆盖完整 | 真实 UI 断开后显示未连接，重启仍断开，重新连接自动恢复；新调用阻断及页面保留未查 |
| A13 更新回滚 | 未覆盖 | 文件回滚 fixture；旧新版真实 Chrome 未验证 |
| A14 高级入口 | 未覆盖完整 | 真实界面展开高级入口可见“选择源码扩展”及仅显式点击才从源码编译的说明；源码构建和异常路径未查 |
| A15 UI | 未覆盖完整 | 初始、等待、多目标、已连接与断开状态已观察；浅色与深色等待页截图已目视检查并恢复跟随系统；重启后截图产物文字与预览再次检查；窄窗和键盘未查 |
| A16 制品隐私 | 未覆盖完整 | 最新本机临时签名 arm64 包生成并校验组件；此前版本移出源码目录启动并显示入口。隔离验收的 4 个 Journal 共 3490 事件，未检出 `data:image/`、base64 JPEG、credential 字段或 probe tab 字段；此扫描不证明所有敏感数据路径安全。最新包外 Chrome 连接与正式签名公证未查 |

## 接下来的实机路线

G1 的首次连接、Host/扩展/Agent 接入、空 tabs probe 和真实 Provider 对话已完成。G2 继续验证忙碌任务与 Chrome 重启；G3 已完成第二 profile 的显式选择，故障恢复矩阵仍需执行；G4 还需目标变化、full-access 和断线矩阵；G5 测更新/高级来源；G6 补窄窗、键盘和最新制品隐私证据。根测试与 typecheck 已分别串行通过。按 A01–A16 保留中间状态证据，源码和 mock 结果不得标为 UI PASS。

## 边界

本机已有个人 Chrome Host 登记，独立测试版用临时 manifest 保护它；临时路径不是 Chrome 真实握手证据。Chrome API 已开始的副作用无法通过取消撤销。当前无 Apple 签名/公证验收；前一组件版本的兼容窗口尚无旧新版实机证明。
