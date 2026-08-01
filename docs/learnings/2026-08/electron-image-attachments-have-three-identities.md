# Electron 图片附件有三种身份，不能混成一个 URL

## 问题本质

桌面聊天输入框里的“一张图片”看似只是一个附件对象，实际上同时承担三种不同职责：

1. **UI 预览身份**：renderer 需要一个浏览器可加载的 `data:` 或 `blob:` URL。
2. **本地文件身份**：文件工具或图片分析工具需要一个受控、可校验的真实路径。
3. **模型输入身份**：原生视觉模型最终需要内存中的 Base64 / image content，文本模型则只需要路径元数据并按需调用视觉工具。

如果直接把绝对路径变成 `file://` 给 renderer，Vite 开发页通常会被 Electron 拒绝加载；如果反过来把 Base64 当成附件路径，文件工具无法执行安全路径校验；如果把预览 Base64 原样写进 session，又会让 JSONL、日志和上下文迅速膨胀。

## 推荐边界

```text
File picker / clipboard / drop
        |
        v
Electron main validates or materializes the file
        |-- real local path ----------> runtime tool allowlist
        |-- bounded data URL ---------> renderer preview only
        |
        v
send boundary strips previewUrl
        |
        |-- native vision model ------> temporary image content
        `-- text-only model ----------> metadata + inspect_image(path)

later session:get
        |
        `-- trusted persisted path ---> bounded data URL for renderer only
```

关键点是：预览 URL 是 renderer 状态，不是持久化数据；本地路径是 runtime capability，不是网页资源；模型图片内容是单次调用材料，不是 session schema。

## 剪贴板为什么更特殊

文件选择和拖放通常能得到原始路径，但系统截图粘贴往往只有一个内存 `File`。要让后端工具读取它，必须由 main 进程先完成：

- 校验字节长度和文件签名，而不是只信 MIME 或扩展名。
- 写入应用自己的临时附件目录，生成真实路径。
- 返回有界预览数据，避免 renderer 再读取任意绝对路径。
- 把临时路径注册为当前轮允许读取的附件，而不是开放整个临时目录。

## 常见陷阱

- **测试只断言缩略图容器存在**：CSS 占位仍会让测试通过，必须断言实际 preview URL 或在 Electron 中看真实像素。
- **用模型 capability 控制发送按钮**：有工具委托后，“主模型不原生支持图片”不等于“本轮不能发送图片”。UI 应允许提交，runtime 再按能力分流。
- **previewUrl 进入持久化事件**：data URL 体积大且可能包含敏感像素；在 renderer 到 runtime 的边界剥离，而不是依赖后续日志脱敏补救。
- **发送后只依赖 Composer 内存中的预览**：Agent Run 结束后通常会用 `session:get` 替换 renderer 状态；如果读取边界不从受信路径重建预览，附件元数据仍在，但缩略图会退化成空白占位。重建应只丰富 IPC 返回值，不能回写 session。
- **移除附件时忘记释放 blob URL**：blob URL 应在移除、发送结束或组件卸载时回收，避免长会话持续占用内存。

## 自检

- renderer 当前拿到的是网页可加载的预览，还是本地文件路径？
- runtime 当前允许读取的是用户明确选择的单个文件，还是过宽的目录？
- session 事件中是否意外包含 `data:image/...;base64,...`？
- session 回读是否能在不修改持久化文件的前提下恢复真实缩略图？

关联变更：`docs/histories/2026-08/20260801-2152-fix-composer-image-attachments.md`
