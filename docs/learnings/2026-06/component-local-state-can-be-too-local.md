# 组件本地状态可能太本地

关联 history：`docs/histories/2026-06/20260604-1933-composer-model-selection.md`

## 是什么

React 组件本地状态适合保存只属于这个组件生命周期的 UI 细节，例如菜单是否打开、输入框草稿、hover/focus 状态。但当一个值代表产品语义，例如"下一次请求要使用哪个模型"，它往往不应该被藏在一个可能切换、卸载、重建的组件里。

这次问题就是：空会话渲染 initial Composer，发送后渲染 follow-up Composer。模型下拉看起来属于 Composer，但它的语义其实属于"当前聊天要用的模型"。把它放在 Composer 内部，就会在两个 Composer 表面切换时丢失。

## 判断方式

问三个问题：

- 这个值是否会影响组件外部的业务动作？
- 这个值是否需要跨同类组件实例保持一致？
- 这个组件是否会因为布局、状态流、路由或空态切换而卸载？

如果答案有两个是肯定的，状态通常应该提升到更稳定的父级，组件只负责展示和发出变更事件。

## 实现模式

```txt
Stable owner state
  -> pass selected value to replaceable components
  -> components emit onChange
  -> submit action reads the selected value
```

在这次修复里：

- `App` 持有 `selectedChatModelId`。
- `WorkbenchLayout` 和 `ConversationView` 只透传。
- initial Composer 和 follow-up Composer 都接收同一个 `selectedModelId`。
- 用户选模型时通过 `onSelectedModelChange` 写回 `App`。
- 发送时 `RunTurnInput.model` 使用共享选择，而不是重新初始化后的默认值。

## 常见陷阱

- 被 UI 外观误导：控件长在 Composer 里，不代表状态就应该归 Composer 所有。
- 只测第一次提交：很多这类 bug 出现在首次提交后的表面切换、路由切换、空态切换。
- 把所有状态都提升：菜单开关、hover、临时附件拖拽状态仍然适合留在组件内部。提升的是业务选择，不是所有 UI 细节。
- 默认值异步到达后覆盖用户选择：如果设置从 bridge 异步加载，需要记录用户是否已经手动选择过，避免晚到的默认值把用户选择冲掉。

## 自检问题

- 这个 state 的拥有者会不会在用户完成同一工作流前被卸载？
- 如果页面上同时出现两个同类控件，它们是否应该展示同一个值？
- 异步默认值返回时，是否可能覆盖用户已经做出的选择？
