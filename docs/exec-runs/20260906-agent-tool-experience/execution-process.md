# 执行过程

2026-09-06：用户批准其余体验调整，Todo UI 沿用此前明确排除。确认现有 dirty worktree，按精确补丁推进。参数预览移除部分 JSON 解析与定时器；Thinking 从 Host 到请求两种传输继续追踪。

- P1：补齐 fixed-renderer IPC → DesktopApp → RunController → AgentLoop → LLM options，并规范化模型能力；两种传输都携带 reasoning 设置。发现 DesktopApp 的重复请求类型，改为共享请求的 Omit，避免字段继续丢失。
- P1：参数阶段不累积或解析 partial JSON；prepared 一次补全。默认非 Bash 操作审批移除，参数、能力、路径与 Browser canonical/preflight 检查保留。相对路径仅用于展示。
- P2：轨迹隐藏 composer-zone 并保留组件实例，提供独立 Stop。验证草稿、附件与模型 DOM 保留。Todo UI 不改。
- P3：委派开始记录 childSessionId，补列表 IPC；修正 transcript IPC 原先返回 MessageBlock 而前端期望 SessionEvent 的不一致。右侧列表/详情复用消息组件并轮询更新，清理迟到请求。
- 验证：修正旧测试仍期待 partial 内容和底部 transcript 的断言；Core 审批测试补 Bash 必需 intent。构建验证捕获请求类型和测试 fixture 字段遗漏并修正。
- 浏览器：在独立 5175 renderer 服务中查看浅深色列表、详情、返回、轨迹与 Stop、切回会话；测试数据仅在显式 fixture。Electron 根据日志 app ID 和路径均返回 Invalid app，真实桌面 IPC/Provider 验收仍待人工完成。
- 收尾：Desktop 默认并发两次触发既有 20500 行日志渲染测试的 5 秒超时，单文件复跑通过；限制为两个 worker 后，87 个文件、615 项测试全部通过，未放宽断言或超时时间。根 typecheck/build 通过，最终 Main 选项调整后再次通过 Desktop typecheck/build:electron。计划转入 completed，人工宿主验收保留在摘要。
