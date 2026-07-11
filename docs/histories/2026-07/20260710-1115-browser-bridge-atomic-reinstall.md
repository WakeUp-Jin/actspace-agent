# Browser Bridge 原子重装与探测收敛

| key | value |
|-----|-------|
| date | 2026-07-10 |
| scope | packages/desktop, plugins/browser-bridge, docs |
| status | done |

## 用户诉求

修复 Browser Bridge 点击“重新编译”后持续显示 `abb help` 探测失败、命令超时，并不断产生残留 `abb doctor` 进程的问题。

后续继续修复 Chrome 扩展已启用但始终无法连接的问题：unpacked extension 的实际 ID 与 Native Host `allowed_origins` 中硬编码的旧 ID 不一致。

## 变更

- `BrowserBridgeService` 不再直接覆盖正式 `abb`，改为唯一临时文件校验成功后原子替换。
- 替换探测失败时保留上一版安装文件，并透传真实的 stderr、退出信号或 timeout 信息。
- 同一仓库路径的并发状态查询复用同一个探测 Promise，错误结果短暂缓存退避。
- Browser Bridge renderer 轮询改为上一轮完成后再调度，错误状态降低轮询频率。
- 增加原子 inode 切换、失败保留旧版本、并发去重和错误退避测试。
- 同步 Browser Use 设计文档、可靠性约束和可迁移学习记录。
- 为 Chrome extension manifest 增加固定公开 key，将 unpacked extension ID 稳定为 `eneeikpgpieikinaimmgmdiafbgbanei`。
- Go CLI 默认注册同一个 extension ID；`doctor` 会明确报告 Native Host origin mismatch。
- 增加 manifest key 与 Go 默认 ID 一致性、默认 allowlist 和 mismatch 诊断测试。

## 设计动机

Chrome Native Messaging host 可能长期持有正式二进制。直接复制到同一路径会修改正在执行的 inode，后续进程可能卡入不可中断退出状态。原子 rename 让运行中的旧 host 保持旧 inode，新启动进程读取新 inode；single-flight 与串行轮询则限制故障放大范围。

Chrome 对 Native Messaging 使用扩展 ID 做 allowlist。未固定 key 的 unpacked extension 会因加载路径变化产生不同 ID，因此不能把某次本机加载得到的 ID永久硬编码进 Go。manifest key 固定身份，测试负责防止 key、Go 常量和注册结果再次漂移。

## 关键文件

- `packages/desktop/src/main/plugins/browser-bridge-service.ts`
- `packages/desktop/src/main/test/browser-bridge-service.test.ts`
- `packages/desktop/src/renderer/components/settings/fs-watch-shared.ts`
- `plugins/browser-bridge/apps/chrome-extension/manifest.json`
- `plugins/browser-bridge/apps/cli/main.go`
- `plugins/browser-bridge/apps/cli/main_test.go`
- `docs/design-docs/agent-browser-use-integration-design.md`
- `docs/RELIABILITY.md`
