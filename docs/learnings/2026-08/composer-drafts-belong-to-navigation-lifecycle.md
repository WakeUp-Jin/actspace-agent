# Composer 草稿应该属于导航生命周期

来源：[`20260805-2208-composer-drafts-and-input-history.md`](../../histories/2026-08/20260805-2208-composer-drafts-and-input-history.md)

## 问题本质

输入框里的文字通常先写进组件本地 state。只要页面切换会卸载组件，这份 state 就会一起消失；即使 URL 或当前会话没有改变，设置页整页接管、空会话切到消息流等结构变化也可能触发同样的问题。

因此，草稿状态的所有者应满足：

```text
draft owner lifetime >= navigation flow lifetime > composer mount lifetime
```

草稿不必直接进入业务持久化。未发送文字与正式消息的语义不同，把它写入会话事件会污染更新时间、排序和上下文重放。对于只要求应用内导航恢复的场景，按会话 key 保存的内存缓存已经足够。

## 性能取舍

把输入值提升成页面顶层受控 state 虽然直观，却会让长消息列表在每次敲键时参与重渲染。更轻的方式是：

- Composer 继续持有即时输入 state，保证输入延迟稳定。
- 更长生命周期的父层只持有一个稀疏 `Map<sessionId, text>`。
- Composer 每次变化同步写缓存；挂载或会话 key 改变时再读取。
- 空字符串直接删除 key，避免缓存无意义条目。

## 方向键陷阱

终端式输入历史不能直接覆盖 textarea 的 `ArrowUp` / `ArrowDown`：多行文本需要它们移动光标，输入法候选和 Slash 菜单也可能占用方向键。

安全边界是只在普通输入为空或已经进入历史浏览时接管，并按优先级处理：

```text
IME / Slash menu -> native textarea movement -> input history
```

历史内容也只应恢复文字。附件、模型或工具模式可能已经失效，静默恢复并重新发送会带来更大的意外行为。
