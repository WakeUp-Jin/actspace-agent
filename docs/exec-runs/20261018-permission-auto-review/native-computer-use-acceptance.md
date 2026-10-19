# 原生桌面 Computer Use 验收

日期：2026-10-19。执行模型：gpt-6.1-sol。

本轮使用 macOS 屏幕截图、CGEvent 鼠标与键盘，根据截图定位真实 Electron 窗口。没有使用 CDP、Playwright、DOM 选择器或内部业务接口驱动界面。屏幕录制与辅助功能权限预检均可用，未更改系统授权。

使用既有隔离应用和本地 synthetic Provider；HTTP fixture 控制与 JSONL 检查仅提供测试条件和补充证据，不代替桌面交互。此前 CDP 结果单独保留，不能计为本轮 Computer Use 通过。

## 验收点

- U1：三个权限模式切换与重载保持。
- U2：跟随会话、指定审批模型的保存、恢复和实际路由。
- U3：首次 ls 会话允许，后续 ls -la 不重复审批。
- U4：自动审批工具结果详情显示模式与原因。
- U5：模型拒绝或不可用回人工，人工处理后结果正确。
- U6：新旧格式历史及 pending 审批重载可读。
- U7：浅深主题和窄窗口中模式菜单、模型选择器可读。

## 操作分组

A：会话模式与设置，覆盖 U1/U2；保存模式菜单、模型设置及重载后的关键状态。

B：新隔离会话连续查询、自动审批与人工回退，覆盖 U3/U4/U5；保存审批前、执行后详情和对应 journal 字段摘要。

C：历史恢复与主题/窗口，覆盖 U6/U7；复用前两组状态，补充旧格式历史、浅深主题和窄窗口截图。

## 结果

U1–U7 代表路线通过。证据位于本机 Git 忽略目录 `artifacts/permission-auto-review-native-20261019/`；逐项操作报告见其中 `report.md`，请求与 JSONL 补充摘要见 `journal-evidence.json`。

| 编号 | 结果 | 原生交互与证据 |
|---|---|---|
| U1 | 通过 | 原生点击三个模式；既有会话重载后保留替我审批。新会话默认普通模式，不声称继承。`u1-auto.png`、`u1-full.png`、`u1-review-reload.png` |
| U2 | 通过 | 设置选择指定模型、跟随模型，分别保存后重载并重新进入设置确认。`u2-specific-restored.png`、`u2-follow-restored.png`。旁路请求32/34主模型alternate、33审批main；35/37主模型alternate、36审批alternate；审批tools均为0 |
| U3 | 通过 | 新会话首次ls点击本会话允许，随后ls -la直接完成。`u3-first-approval.png`、`u3-two-queries.png`。JSONL共1次permission/asked、2次grant-used；cu-39/40结果均completed/session |
| U4 | 通过 | 展开Worked，再展开Ran，并在灰色输出卡片内部滚动到底部，看到自动审批与原因；重载后仍可读。`u4-inner-scrolled-bottom.png`。cu-32/35的tool/result记录auto及reason |
| U5 | 通过 | 模型拒绝回人工后点击拒绝；模型HTTP错误回人工，Cmd+R后pending仍在，点击运行完成。`u5-deny-human.png`、`u5-error-human.png`、`u5-error-pending-reload.png`。cu-42为denied/manual，cu-45为completed/manual，原因保留自动判断失败及人工决定 |
| U6 | 通过 | 新历史与pending重载可恢复；原生打开旧格式历史的轨迹、pwd详情，参数和legacy-workspace结果可读，无自动审批误标。`u6-legacy-details.png`。旧格式使用不含两审批字段的synthetic journal |
| U7 | 通过 | 原生调整到480×800，浅深主题的模式菜单、模型菜单可读，无观察到遮挡截断。`u7-light-narrow-modes.png`、`u7-dark-narrow-modes.png`、`u7-light-narrow-model.png`、`u7-dark-narrow-model.png`。不推定所有尺寸和菜单组合均逐一覆盖 |

## 核查中撤销的误报

最初以为工具详情缺少审批文字。完整检查发现Bash输出区域有独立高度上限和滚动，文字在stdout之后；只滚动外层会话不能看到最后一行。原生滚动卡片内部后确认正常，撤销缺失判断，本轮未修改产品代码。`u4-auto-fields.png`、`u4-reload-visible-details.png`仅为排查中间状态，不能用来证明内容缺失。

## 范围与限制

本轮真实运行Electron、preload、IPC、执行器与会话JSONL，界面操作使用系统截图、鼠标和键盘；本地synthetic Provider只控制允许、拒绝、HTTP错误等可复现场景。未验证商业Provider判断质量、真实30秒超时等待、全部查询命令或全部历史版本。旧格式fixture未提供助手消息，仅验证轨迹读取；不声称旧对话工具卡布局已覆盖。此前CDP验收仍是独立证据。

验收后恢复浅色1200×850窗口、审批模型跟随会话，无pending；fixture恢复allow。`git diff --check`通过；`pnpm check:docs`仍因既有前端重构总计划第4行的失效demo链接失败，未改动该文件。
