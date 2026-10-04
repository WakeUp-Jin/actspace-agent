# P5 验收问题修复与复核

2026-10-04：用户授权修复第二轮 CU 报告的问题。B1/B2 已完成代码修复和自动化；B3 复核为夹具误报，已撤回。**后续 Sol R1–R3 定向复验通过，P5 计划范围已签收，见 [第三轮报告](phase-5-cu-round3.md)。** 未 commit/push。

## 根因与修改

| 编号 | 根因与证据 | 本轮处理 |
| --- | --- | --- |
| B1 | `HostCredentials` 的本机加密不可用错误，经 IPC 到 `HostConnectionsSettings.connectionError` 后没有匹配分支，落入网络失败提示；加密/解密异常同样如此。组件回归在原代码上复现。 | 增加本机凭据存储错误识别，提示检查钥匙串/密钥环解锁与访问权限；配对码已消费时提示重新生成。设备授权撤销仍走原独立提示，不降低加密保护。 |
| B2 | `App` 消息读取 catch 直接展示 `error.message`，包含 Electron IPC 方法名、内部错误类和不适用于读取的 mutation 文案。原错误文本注入组件可稳定复现。 | 会话读取统一转换断线错误为用户提示，未知 IPC 错误使用对应加载失败文案；当前消息、历史分页和列表加载三个入口同步处理。保留重试与重连刷新行为。 |
| B3 | 两台隔离 Host 的 `workspaces` 都是 id=main、name=P5 Remote、相同路径，defaultModel 都是 fixture/p5-test；blocked 的 `host.describe` 仍返回自己的配置。截图显示的是正确配置，原报告把工作区名称误当成 Host 身份。 | 撤回误报，不修改切换逻辑。新增不同工作区/模型的真实组件切换测试，证明 ready→blocked 后显示目标 Host 自身信息、草稿保留且不可提交。 |

产品改动仅 `apps/desktop/src/renderer/App.tsx`、`apps/desktop/src/renderer/components/settings/HostConnectionsSettings.tsx`；新增回归 `apps/desktop/src/renderer/test/host-feedback.test.tsx`（8 项）。未更改协议、Host 生命周期、设置格式、主题或布局。

## 验证

- 红测：原代码定向运行 6 项，4 项失败（3 种本机存储错误、1 种 IPC 断线），授权失效提示与不同 Host 数据切换通过。
- 绿测：扩展到 8 项，另覆盖离线错误、未知 IPC 错误、重试恢复、blocked 草稿和点击拒绝提交。
- Desktop 全套：139 文件通过、1 文件跳过；1008 项通过、2 项跳过。
- Desktop renderer/main 类型检查通过；renderer production build 通过，只有已有大 chunk 提示。
- `pnpm check:docs` 与 `git diff --check` 通过；计划入口已同步为等待定向复验。
- 同类检查：三个会话读取错误入口均已处理；连接设置的列表/添加/重连/移除共用同一错误转换。工具执行结果的领域错误不是会话读取，不在本次范围内。
- 本轮未做 Computer Use；此前的截图只证明原问题，不能当修复后验证。测试日志在临时目录，关键结果已写入本文。

## Sol 定向复验

先核对本轮构建，按 `pnpm dev:log` 屏障重启隔离 Desktop。保留用户真实数据。

1. **R1 本机存储失败提示**：在隔离环境复现系统凭据加密不可用，检查配对错误明确指向本机钥匙串/密钥环；地址、草稿可保留。不得通过修改用户钥匙串或降低加密来造故障。若环境不可安全复现，明确仅自动化覆盖。
2. **R2 强停断线提示**：远端运行中 force 停 Host，检查消息区显示可理解的断线文字，无 IPC handler、内部错误类或 mutation 提示；Stopped 与禁发保持。Host 重启后错误自动清除，结果/终态可恢复，手动重试仍可用。
3. **R3 误报校准**：如重复 Host 切换路线，先使两台测试 Host 发布不同工作区名称/路径与模型，核对各自 `host.describe`。不能沿用同名夹具再判断“旧状态残留”；本轮组件回归已覆盖切换与 blocked 禁发。

按 R1–R3 分别标记真实 CU、协议辅助或未覆盖。操作可复用设置→远端会话→维护→重连路线；不能把自动化通过改写成真实界面通过。通过后再更新 P5 签收状态。

## 复验结论

R1 自然本机加密不可用、R2 自然强停与代理辅助读取断线/重试恢复、R3 不同配置切换均通过；具体证据和边界以第三轮报告为准。本节之后无待执行修复。
