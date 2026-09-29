# 剩余问题诊断（2026-09-29）

本轮仅诊断，没有新增产品代码修改。Chrome 完整覆盖按用户意见后置，A17–A24 仍保留原覆盖状态，不能据通用工具可用推定浏览器工具已通过。

后续状态：用户随后授权修复第1、3项，已完成并验证，见[第二轮验收摘要](execution-summary.md#第二轮启动屏障与跨会话缓存)。下文保留修复前诊断事实；图片问题继续后置。

## 1. dev 启动竞态：就绪门槛缺陷已复现

- `scripts/desktop-dev.mjs` 并发启动 Electron 编译和运行；`apps/desktop/scripts/dev-electron-run.mjs` 只等待 renderer TCP 端口和 main/preload 文件存在，不等待本轮编译成功。
- `logs/dev-20260929-152954.log` 第54行出现 Electron launcher，第64行才出现 main 首轮编译成功；第103行模式切换报 IPC handler 未注册。
- 临时目录实验：写入旧 main/preload，开启本地 TCP 端口，使用相同 wait-on 条件；756ms 后门槛放行，文件仍是 old-main，本轮编译没有完成。
- 已确认存在加载旧产物窗口；这是首次缺 handler、重启恢复的强解释，但当时实际加载模块没有哈希证据，不能把全部历史故障都归因于此。
- 建议：明确首轮 main/preload 成功构建屏障后再启动；编译失败不得启动。不要用固定延时替代屏障。

## 2. 图片 Connection error：错误分类与信息丢失已复现

- 验收配置为 OpenRouter 图片模型，启用本地代理；两次 inspect_image 均记录 IMAGE_INSPECTION_FAILED / Connection error / retryable=false。
- 无真实请求实验：实际 OpenAI SDK + LegacyProxyWireEngine + 注入必定抛 ECONNREFUSED 的代理 fetch。结果为 kind=unknown、message=Connection error.、retryable=false。
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts` 仅识别外层 ProviderProxyError，未识别 SDK 包装后的 cause；网络正则也不匹配 Connection error。
- `packages/tools/image-inspection/src/node-ports.ts` 又将结构化 failure 转为普通 Error，最终重试属性只取 signal.aborted，导致非取消传输失败不能保留原分类和重试属性。
- 当前无认证公共模型目录 GET 的直连和代理探测都返回200；只说明当前 GET 可达，不证明历史请求、带图 POST、鉴权和模型执行正常。
- 建议：先保留并脱敏传输失败类别、cause 和 retryability，再用同一验收图片复验。尚不能断言历史失败一定由代理、模型或图片本身引起。

## 3. 新确认：read_file 缓存跨会话误命中

- `packages/tools/filesystem-read/src/node-ports.ts` 的缓存属于 ports 实例，键只有绝对路径、offset、limit；插件注册的 handler 复用该实例。
- 临时文件实验：同一 ports，session-A 首读返回编号正文；session-B 首读同一范围却返回 File unchanged / Reuse the earlier numbered lines。
- B 的历史没有 A 的正文，因此该优化会让新会话或子任务缺少输入。force=true 可绕过，不能视为正常行为。
- 建议：至少隔离会话缓存；同时明确上下文压缩后何时允许省略正文，避免把磁盘未变化误当成模型仍有正文。需要会话间首次读取及同会话缓存回归验证。

## 其他观察与边界

- 原验收已观察到失败轮次没有清楚错误说明；属于错误呈现问题，尚未完成当前修复后的独立故障注入复验和根因定位。
- 子会话显示为 New chat、可进入普通会话界面：身份与可操作性需要明确，当前只确认历史可读，没有验证继续发送行为，不列为已确认执行故障。
- Grant/full-access、附件/无工作区、旧 Todo 样本、完整主题矩阵、包隐私 canary 等仍是验收缺口，不等价于新增 bug。
- 下一轮建议顺序：read_file 会话隔离与启动屏障优先，随后图片错误链路及真实复验，再单独验证错误 UI 与子会话可操作性。产品代码修改前应先确认具体方案。
