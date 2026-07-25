# 多供应商 LLM 最终手动验收清单

用途：在用户准备统一验收时，按固定顺序完成 Plan 6 剩余的真实 Electron、供应商网络、主题与键盘路径。本文只记录通过/失败和脱敏备注，禁止写入 API Key、完整代理地址、Authorization、真实 prompt 或 workspace 内容。

## 验收前准备

- [ ] 确认使用专门用于验收的无隐私 workspace。
- [ ] 准备 DeepSeek、Kimi、OpenRouter API Key，只通过设置页输入。
- [ ] 准备本机已有的 HTTP(S) 代理；不要修改系统全局代理。
- [ ] 记录验收前 `settings.json` 与 `secrets.json` 的安全备份位置，但不要复制到仓库。
- [ ] 确认仓库内没有 API Key、代理凭据或验收日志：`pnpm check:secrets`。

启动命令：

```bash
pnpm dev:log
```

固定无隐私探针：

```text
只回复 ACTSPACE_PROVIDER_OK
```

## A. 启动与持久化

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| A1 | 启动 Electron | 窗口正常加载，服务商页与模型页可打开 | [ ] |
| A2 | 检查已迁移的 v2 设置 | 原默认模型、Explore、Kairos、插件和 Skill 设置仍存在；v1 backup 只生成一次 | [ ] |
| A3 | 重启 Electron | provider、installed model、任务模型及 `addedAt` 保持稳定 | [ ] |

## B. DeepSeek 与 Kimi 直连

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| B1 | DeepSeek 保持代理关闭，测试连接 | 显示连接成功 | [ ] |
| B2 | Composer 选择 DeepSeek 模型运行固定探针 | 只返回 `ACTSPACE_PROVIDER_OK` | [ ] |
| B3 | Kimi 保持代理关闭，测试连接 | 显示连接成功 | [ ] |
| B4 | Composer 选择 Kimi 模型运行固定探针 | 只返回 `ACTSPACE_PROVIDER_OK` | [ ] |
| B5 | 查看 Usage、Session Preview | 新记录使用 provider-qualified ModelKey，旧 session 名称仍稳定 | [ ] |

## C. OpenRouter 与供应商级代理

如果当前网络可以直连 OpenRouter，C1 改为启用一个明确不可达的临时 HTTP 代理地址；不要修改系统代理。

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| C1 | OpenRouter 关闭代理测试连接，或启用不可达临时代理 | 失败被分类为 network 或 proxy，错误不包含 Key/完整代理地址 | [ ] |
| C2 | 配置真实代理并测试连接 | OpenRouter 连接成功 | [ ] |
| C3 | 重新加载模型目录 | 出现在线目录、更新时间和可搜索模型 | [ ] |
| C4 | 添加一个 utility 模型与一个 toolUse 可用的 chat 模型 | 两个模型进入已添加列表，默认不会把整个目录灌入 Composer | [ ] |
| C5 | OpenRouter chat 模型运行固定探针 | 只返回 `ACTSPACE_PROVIDER_OK` | [ ] |
| C6 | OpenRouter chat 模型执行一次只读工具调用 | 工具调用正常，session/usage provider 为 OpenRouter | [ ] |
| C7 | 关闭 OpenRouter 代理，再测试 DeepSeek/Kimi | DeepSeek/Kimi 不受影响，证明代理只作用于 OpenRouter | [ ] |
| C8 | 恢复 OpenRouter 真实代理 | OpenRouter 再次可用 | [ ] |

## D. 轻量任务、Explore 与 Kairos

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| D1 | 轻量任务模型选择 OpenRouter utility 模型，新建会话 | 首轮标题成功生成，usage provider 为 OpenRouter | [ ] |
| D2 | 触发长工具输出摘要 | 摘要成功，usage provider 为 OpenRouter | [ ] |
| D3 | 执行 `/compact` | 压缩成功，usage provider 为 OpenRouter | [ ] |
| D4 | 断开 OpenRouter 后再次 compact | 回退当前主模型；轻量任务配置值保留，不被偷偷改写 | [ ] |
| D5 | Explore 选择 OpenRouter chat 模型并运行只读探索 | 正常使用 OpenRouter；断开后回退主模型并显示脱敏原因 | [ ] |
| D6 | Kairos 选择 OpenRouter chat 模型 | 连接时可运行；断开后进入 unavailable/blocked，不静默换供应商 | [ ] |
| D7 | 重新连接 OpenRouter | Kairos 可以恢复，不需要删除原模型配置 | [ ] |

## E. 模型状态与恢复

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| E1 | 停用当前 Composer 模型 | 模型立即离开新选择候选，UI 要求选择可用模型 | [ ] |
| E2 | 重新启用模型 | 模型重新进入能力匹配的候选 | [ ] |
| E3 | 删除正在被 utility/Explore/Kairos 引用的目录模型 | 删除被阻止，并显示引用位置 | [ ] |
| E4 | 清除引用后删除目录模型 | 删除成功；历史 session 与 usage 仍可读取原模型名称/标识 | [ ] |
| E5 | 重启 Electron | provider、模型启用状态和任务模型配置恢复 | [ ] |

## F. 主题、键盘与焦点

服务商页、模型页、OpenRouter 目录和 Composer 均执行以下检查。

| ID | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| F1 | 浅色主题 | 文字、边框、状态、错误和 disabled 状态可读 | [ ] |
| F2 | 深色主题 | 不出现硬编码白底/黑字，状态含义不只依赖颜色 | [ ] |
| F3 | 跟随系统并切换 macOS 外观 | 页面随系统切换，无需重启 | [ ] |
| F4 | 只用键盘添加服务、测试连接 | Tab 顺序连续，Enter/Space 可操作，焦点清晰 | [ ] |
| F5 | 只用键盘打开目录、搜索、添加模型 | 焦点被限制在弹窗内，Escape 关闭后回到触发按钮 | [ ] |
| F6 | 只用键盘选择默认/轻量/Explore 模型 | 每个控件有可读 label，选择后状态立即同步 | [ ] |

## G. 安全与日志

验收后只检查，不把日志提交到仓库。

| ID | 检查 | 预期 | 结果 |
| --- | --- | --- | --- |
| G1 | `settings.json` | 不含任何 API Key；只保存非敏感 provider/model 配置 | [ ] |
| G2 | `secrets.json` | 不含可直接阅读的明文 Key | [ ] |
| G3 | `logs/latest-dev.log` 与本次 agent-run JSONL | 不含 API Key、Authorization、完整代理地址、上游原始错误正文 | [ ] |
| G4 | 连接测试记录 | 只包含 provider、状态、errorKind、status code、耗时等脱敏字段 | [ ] |
| G5 | `pnpm check:secrets` | 通过 | [ ] |

可先用只输出文件名的方式定位可疑日志，避免把命中正文复制到终端记录：

```bash
rg -l -i 'authorization|bearer[[:space:]]+[a-z0-9_-]{12,}|sk-[a-z0-9_-]{8,}' logs
```

命中时在本机直接检查并删除敏感日志；不要把命中行粘贴到 issue、history 或聊天中。

## H. 收尾

- [ ] 退出 Electron，并停止 `pnpm dev:log`。
- [ ] 确认没有遗留 ActSpace Electron、Vite 或开发服务进程。
- [ ] 删除仅用于验收的临时代理配置和临时 userData/fixture。
- [ ] 把失败项记录为脱敏说明，并在修复后重跑该项及其上游依赖项。
- [ ] 全部通过后，将 Plan 6 标记完成，把本 execution plan 目录移动到 `docs/exec-plans/completed/20260724-multi-provider-llm/`。
- [ ] 同步设计文档状态、history 与最终发布记录，然后运行 `pnpm check:docs && pnpm check:secrets && pnpm check:repo`。

## 最终结论

- 验收日期：`待填写`
- 验收人：`待填写`
- 结论：`待验收`
- 脱敏备注：`无`
