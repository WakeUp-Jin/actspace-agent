# 不可信生成媒体应该先跨过 Artifact 边界

外部图片生成接口常返回 Base64 或短期签名 URL。看起来最省事的实现，是把它们直接塞进工具结果或 renderer；但这会把传输格式、持久化格式和展示格式绑在一起，也会放大内存、隐私与恢复风险。

更稳的模式是把 provider 输出视为不可信的临时输入：先校验协议、目标地址、大小和真实文件签名，再原子写入应用控制的会话 artifact 目录。后续 session、日志、模型上下文和 UI 只传递轻量引用。

```text
provider url/base64
  -> validate transport and size
  -> decode/download
  -> sniff actual image type
  -> atomic local write
  -> ToolArtifact { path, mimeType, name }
```

## 为什么值得这样做

- Base64 会把二进制体积再放大约三分之一，并复制到 JSON、内存、日志和上下文的多个位置。
- 签名 URL 可能很快失效，也可能包含不应长期保存的查询参数。
- provider 返回的 URL 可以成为 SSRF 跳板；不能因为来源是“模型服务”就默认可信。
- renderer 直接依赖远程结果，会让重启恢复、离线查看和部分成功变得不可靠。
- 即使已经落到本地，renderer 直接拼 `file://` 也不是稳定展示通道：开发态 HTTP origin 会被 Electron 的资源安全策略拒绝，放宽 `webSecurity` 又会把局部预览问题扩大成整个应用的权限问题。

## 关键约束

1. API Key 和 Authorization 只存在于请求边界，不能进入 artifact 元数据。
2. URL 下载至少拒绝凭据、非 HTTPS、本机、loopback、link-local 和私网地址。
3. 不只信任 `Content-Type` 或文件后缀，要检查实际魔数。
4. 同时设置单文件上限和整批上限，避免 `n` 增大后绕过总量控制。
5. 写盘使用临时文件加 rename；只有 rename 成功后才发布 artifact 引用。
6. 至少一项成功时可以返回 partial，不能因为单张失败丢弃已完成产物。
7. renderer 只拿 artifact 引用；用户点击后由 main 校验 session 边界、realpath、大小和魔数，再按需返回单个 data URL 或受控自定义协议 URL。

## 执行事实与产物浏览也要分层

生成媒体工具同时包含两种不同信息：工具是否正在执行，以及最终产生了哪些可打开对象。把两者塞进同一张大卡片，会让过程日志异常笨重，也会迫使聊天区预加载大图片。

更可迁移的界面模式是：

```text
tool lifecycle -> compact one-line log
completed artifacts -> turn-level output shelf
user click -> privileged loader -> right-side viewer
```

这样折叠工具过程不会隐藏最终产物，图片也只在用户真正查看时进入 renderer 内存。文件、图片、PDF 或其它生成物都可以复用同一输出栏，而不必让每种工具发明一张新的大型消息卡。

## 桌面操作也要重新绑定权限边界

展示一个完整路径只是文本呈现，但“打开文件”、“复制内容”、“在 Finder 中显示”都是真实的本机能力。不能因为界面上已经有一个绝对路径，就让 renderer 把它原样传给 main 执行。

更稳的方式是让 renderer 只传递受限身份：

```text
session artifact -> sessionId + artifactPath
workspace output -> workspaceRoot + relativePath
main -> resolve + realpath + boundary check -> native action
```

每次右键都要重新解析并校验，而不是信任列表创建时留下的路径。这能同时防住 `..` 越界、symlink 逃逸，以及 renderer 被篡改后提交任意路径。原生右键菜单的所有 action 应复用同一个已校验 target，不要为 Open、Copy 和 Reveal 各写一套边界判断。

## 常见陷阱

- 只限制 HTTP 响应 JSON 大小，却忘记 URL 下载的整批大小。
- 自动重试整个生成请求；上游可能已经接受并计费，重试会重复消费。
- 把远程 URL 放进 session 作为“兜底”，最终既泄露参数又无法长期恢复。
- 为了让 `file://` 能显示而关闭 Electron `webSecurity`；这会破坏整个 renderer 的来源隔离，应该增加窄权限 IPC 或受控协议。
- 让 renderer 直接传绝对路径给 `shell.openPath` 或 `showItemInFolder`；桌面 action 与读文件一样需要 main 侧边界校验。
- 用 clamp 修正批量数量，让模型以为生成 10 张、实际只生成 4 张，费用与语义都不透明。

## 自检问题

- provider 返回十个 20 MB URL 时，单文件限制之外是否还有总量限制？
- 应用重启且签名 URL 已过期后，历史消息还能否显示图片？
- 工具失败日志里是否可能出现 Authorization、Base64 或完整签名 URL？

来源任务：`docs/histories/2026-07/20260727-2245-image-generation-tool.md`。
