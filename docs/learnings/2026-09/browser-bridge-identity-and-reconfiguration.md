# 浏览器连接不能只凭一个 socket 文件认定可用

本次 Chrome 扩展接入的关键问题是：文件存在、进程在运行、工具已注册，分别只是连接链路的一层证据。任何一层都不能单独推导“Agent 可以操作目标 Chrome”。

## 实例身份与在线验证

两个 Chrome profile 会分别拉起 Native Messaging Host。如果共用固定 socket，后启动者可能删除先启动者的 socket，导致调用路由悄悄改变。每个 Host 因此生成私有 socket，并写当前用户私有的实例记录。记录用于发现候选，不能当授权凭据：Desktop 还要核对 socket 的文件类型、所有者、权限，通过在线 `info` 握手核对扩展实例 ID、Host 启动 ID、版本和协议。仅有一位候选时才自动绑定；多个候选由用户在目标 profile 点击扩展图标完成本次选择。

这套做法可迁移到本机插件、多设备代理和多进程本地服务。**发现记录是目录索引，在线握手才是当前事实**。一旦扩展断开或运行版本变化，先停新调用，再重新验证；不能让旧的 `ready` 布尔值继续放行。

## Runtime 重组的空闲边界

Browser Tools 在 Profile boot 时注册。连接成功后不能只改 UI 状态，也不能在活动 run 中热替换工具。安全重组需要先检查所有会话、子 Agent、尚未开始的 Inbox 消息，再关闭新工作准入；第二次确认空闲后 flush/关闭旧 Profile，并 boot 新 Profile。准入中的 Inbox 写入必须计数，否则一次 `enqueue` 的 await 尚未完成，旧 writer 就可能被关掉。

Host 上层的订阅和开关也属于重组状态。重新 boot 后要恢复 Renderer stream 订阅和英语学习目标；重组失败时只能在旧 Profile 确实关闭后尝试恢复，不能并存两个 Journal writer。

## 断线与取消

一个 Agent Turn 的多次 Browser 工具调用复用同一连接和 ownership。Turn 终结或 transport 被立即销毁时，Host 等待当前 worker 收尾，再通知扩展 `session.end` 释放 ownership，且不关闭用户标签页。若只 detach debugger，扩展仍记住旧 Session 的 tab 归属，后续 Turn 会被误判为“被其他 Session 占用”。

取消可阻止尚未调度的批次动作与本地等待，但无法撤销已进入 Chrome API 的副作用。断线之后返回结果未知，不自动重放写操作；用户先查看页面，再决定是否再次执行。

## 不同层的 Session ID 不能共用一个字段

真实 Chrome 验收中，Agent 成功认领标签页后，随后的 CDP 读取报 `Session with given id not found`。原因是命令已有 Agent Session 的 `sessionId`，CDP primitive 也把目标 debugger session 写成 `sessionId`；转发时前者被误当作后者传给 Chrome。Chrome 不认识 Agent 会话，自然找不到 debugger session。

修复时保留 Agent ownership 的 `sessionId`，将 CDP 路由参数明确命名为 `cdpSessionId`，只在确实需要子 Frame/OOPIF 目标时传递。测试同时断言 Agent identity 仍存在，而 CDP 调用目标不会携带 Agent Session ID。可迁移的原则是：跨协议的同名 ID 即使值都是字符串，也要按所属层命名和验证，不能在转发 DTO 中复用含糊的 `sessionId`。

## 自检

1. 发现记录中有一条 `ready`，为何仍需通过 socket 查询 Host 与扩展的运行身份？
2. Runtime 判断 run 数量为零后，为什么还要查看 Inbox 和已接受但未完成的写入？
3. Browser transport 直接关闭时，哪个进程负责最终释放 tab ownership？
4. Agent Session 和 Chrome debugger session 都叫 `sessionId` 时，哪个边界最容易发生误传？
