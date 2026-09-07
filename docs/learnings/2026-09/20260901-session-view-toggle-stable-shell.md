# 会话主视图切换为什么要保持 Shell 稳定

## 是什么

在一个工作台会话里，Chat 和 Trajectory 共享同一个 `ConversationView` 外壳。切换动作只替换中心 viewport 的内容节点，Composer、草稿读写器、右侧对象面板和会话投影上下文继续由同一个 React 树承载。

## 为什么需要

如果把 Trajectory 做成与 Chat 平级的页面并在 WorkbenchLayout 中条件卸载 `ConversationView`，React 会销毁 Composer 与消息滚动容器：未发送草稿可能丢失，滚动状态和正在显示的辅助面板也会被重建。对用户而言，查看轨迹只是观察模式变化，不应被感知为离开当前会话。

## 核心模式

```tsx
<ConversationView activeView={sessionMainView} trajectory={projectedTrajectory} />

// ConversationView 内部
{activeView === "trajectory" ? <TrajectoryView snapshot={trajectory} /> : <ChatViewport />}
<Composer />
```

主状态属于 Workbench，视图渲染属于 ConversationView，数据仍来自 Session Projection。这样 UI 视图可以切换，但会话事实、输入状态和面板上下文不需要迁移。

## 常见陷阱

- 只切换按钮文字而不提供动态 aria label，会让图标按钮对键盘和读屏用户不可理解。
- 把 Trajectory 当成右侧对象 Tab，会把会话运行事实误归类为工作区对象，并使入口在窄屏覆盖层里重复出现。
- 切换会话时复用上一个 session 的视图状态，会导致用户打开 B 会话却看到 A 会话的轨迹；应以 session id 建立轻量状态映射。

## 自检问题

1. 切换到 Trajectory 再返回 Chat，Composer 中未发送文本是否仍在？
2. 右侧 Files / Review 面板打开时查看轨迹，是否仍属于同一个会话而不是新页面？
3. 切换到另一个 Session 后，主视图是否恢复该 Session 上次选择的模式？
