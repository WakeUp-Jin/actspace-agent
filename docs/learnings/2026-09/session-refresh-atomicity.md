# Session projection refresh 的原子提交

## 背景

Session Journal 是持久化事实源，Renderer 消费的是 snapshot 和多个 revision-bound projection。完成一个 Agent turn 时，live event 往往先到达，随后才异步读取 durable snapshot。若每个 projection 字段分别通知 UI，React 会在同一 revision 上看到多组中间状态。

## 可迁移模式

对外暴露一个小型 `batch()` 事务边界：snapshot、composer、usage、trajectory 等值先写入 store，最后只通知一次订阅者。这样 UI 的一次渲染天然对应一个一致性水位，而不是依赖各组件自行判断字段是否已经齐全。

后台刷新还应区分“首次加载”和“已有内容的增量同步”。已有 ready snapshot 时，刷新期间保持 ready，只替换最终 revision；把后台同步标成 loading 会制造不必要的空档和视觉闪烁。

## 注意事项

- `batch()` 只合并通知，不改变 revision 检查和过期快照拒绝规则。
- 事务结束前仍可多次写同一 Session；结束时使用最新 cell 发出通知。
- 初次打开 Session 仍可使用 loading，不能把 `preserveReady` 用作错误隐藏机制。
