# 执行摘要

状态：实现、定向自动化、真实 Electron/CDP 及原生桌面 Computer Use 代表路线验收完成；真实商业模型调用未覆盖。分支：`codex/permission-approval-experience`，未提交或推送。

## 交付内容

- 常见 Bash 查询支持会话授权，包括 ls/pwd、文件内容查询、rg/grep、Git 查询和解释器版本查询；显式路径与 git -C 做工作区 realpath 校验。不识别的选项与复合命令保持单次审批。
- 新增「替我审批」模式和独立 `@actspace/auto-review` 插件。插件只返回 approved 与可空 reason，不调用工具。Runtime 保留硬规则、30 秒超时、取消与执行前复验；模型不允许或不可用时回到人工。
- 设置可选择已连接模型，默认跟随当前会话模型；显式指定的模型不可用时不偷偷切换模型。Desktop 已接入模型路由；其他 Host 未提供该路由时回人工。
- 仅在既有 tool/result 增加可选 approvalMode / approvalReason；实际自动、人工、会话授权路径与失败结果保留审计。旧事件仍可读取，不增加事件类型。

## 自动化证据

| 检查 | 结果 |
|---|---|
| shell-tools / tools-runtime / auto-review / journal / projection / agent-loop / runtime / client | 330 项测试通过 |
| Desktop 模型路由、设置迁移与保存、模式控件 | 4 个文件、68 项测试通过 |
| Runtime / Client 依赖闭包构建，Runtime 最终重建 | 通过 |
| Desktop typecheck、renderer 与 Electron 构建 | 通过；renderer 保留 bundle 体积提示 |
| packages、Desktop build graph、frontend-theme、frontend-tokens | 通过 |
| git diff --check | 通过 |
| check:docs | 未通过：既有前端重构总计划引用不存在的 demo/ 目录；该文件不在本次修改范围 |

文档失败位置：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/00-总执行计划.md:4`。不以局部测试代表全仓测试或真实 Provider 成功。

## 真实 Electron 交互验收（2026-10-18）

按 AGENTS 委派 gpt-6.1-sol；无原生 Computer Use 工具，改用 Playwright/CDP 操作真实 Electron，系统窗口大小由 macOS System Events 调整。正式 renderer、preload、IPC、Session JSONL 与本地 synthetic HTTP Provider 均实际运行，未使用浏览器 mock；模型判断质量不属于本轮证据。

| 编号 | 验收点 | 结果与证据 |
|---|---|---|
| U1 | 三个模式显示与切换 | 通过；点击普通/完全权限/替我审批，重载后模式保持；u1-menu.png |
| U2 | 跟随会话 / 指定模型，保存后恢复 | 通过；设置保存和重载，修复后请求23/25主模型 alternate、review24 main；请求26/28主 alternate、review27 alternate。所有review tools=0；u2-specified-reloaded.png |
| U3 | 查询首次会话允许后免重复审批 | 通过；首次ls点击会话允许，ls -la无重复审批；1 asked、2 grant-used、两结果session；u3-first-approval.png |
| U4 | 自动允许结果显示模式与原因 | 通过；展开活动，再展开Ran，显示自动审批与原因；JSONL记录auto及reason；u4-auto-audit-expanded.png |
| U5 | 自动拒绝或不可用回人工，结果记录正确 | 通过；synthetic deny回人工后拒绝；HTTP400回人工、重载pending仍可运行，结果manual与人工允许原因；u5-deny-human.png、u5-unavailable-human.png |
| U6 | 重载新旧历史会话 | 通过；新历史和pending重载；独立seed不含审批字段的旧格式journal，在轨迹读取pwd参数/结果，无auto误标；u6-legacy-history.png |
| U7 | 浅深主题与窄窗口可读性 | 通过；真实480×800窗口，模型和模式菜单浅深主题可读，无横向溢出；u7-light-narrow-modes.png、u7-dark-narrow-model.png |

本机证据目录：`artifacts/permission-auto-review-20261018/`（Git忽略），包含逐项报告、截图、synthetic请求日志及脱敏字段摘要 journal-evidence.json。应用保留隔离数据目录供复看；没有读取或改写用户原设置/凭据。U6使用synthetic旧格式事件，不代表所有历史版本迁移均已验证。

### 验收发现与修复

发现主对话会跟着审批模型变化。根因是 `createMainAgent` 使用排序后第一条路由，新增auto-review使它排在default前面；`completeText` 有同类逻辑。两处均改为优先default、排除专用辅助路由，保留自定义主路由回退；补Harness集成断言和文本完成回归。Runtime 63项、DesktopApp 13项测试和Desktop typecheck通过；重启真实Electron后以上差异模型请求确认修复。

最初怀疑U4缺少审计展示，进一步展开二级Ran详情后确认已显示，未修改UI。未执行真实商业Provider、30秒超时等待和全部查询命令的界面矩阵；这些不能由本轮代表场景推定通过，异常解析/超时仍以自动化证据为准。

## 原生桌面 Computer Use 验收（2026-10-19）

2026-10-19按用户要求追加原生桌面Computer Use，由gpt-6.1-sol通过macOS截图、CGEvent鼠标键盘操作真实Electron，不使用CDP、DOM或内部业务接口驱动界面。U1–U7代表路线通过，逐项结果、操作分组与截图见[原生验收记录](native-computer-use-acceptance.md)。指定模型与跟随模型的请求路由、会话授权复用及人工兜底同时得到JSONL补充印证。本轮未修改产品代码。

审批详情曾因输出卡片内部滚动而误判缺失，滚动到底部后确认模式与原因正常，撤销该误报。原生关键证据为`artifacts/permission-auto-review-native-20261019/u4-inner-scrolled-bottom.png`；此前CDP报告不代替本轮原生验收。商业模型判断质量、全部命令矩阵等未覆盖边界仍保持。

## 边界

本次不增强沙箱，不把模型判断当作执行隔离。上下文使用有来源的原始对话与近期工具参数/状态，不输入普通工具正文和隐藏推理；超过完整输入上限回人工。自动允许只用于当前调用，审计字段不能恢复成新授权。切回普通模式即可停止自动判断。
