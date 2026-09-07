# Append-only Session 要把事实、视图与物理文件分开

Agent Session 很容易被做成一份不断覆盖的 `messages.json`。这种格式便于展示，却无法可靠回答：某个工具是否已经开始产生副作用、一次重试使用了哪份请求、崩溃前最后提交到了哪里，以及压缩后哪些原始事实仍然存在。

更稳的建模是三层：

```text
Journal events  ->  Surface / domain projection  ->  Desktop / CLI DTO
     |                         |
     v                         v
journal.jsonl            可删除并重建的 cache
```

## Journal 只接受已经成立的事实

Journal 是只追加的领域事件序列。每个事件有连续 `seq`、类型、版本、时间、来源和 data；写入前先通过 codec 与关系校验。一旦接受就不原位改写。

这不等于文件具备防篡改能力。它表达的是应用语义上的 immutable accepted facts，而不是密码学不可篡改。

工具副作用前必须先过 durability checkpoint。否则崩溃恢复时只能看到“工具调用存在”，却无法区分 body 尚未开始与结果未知。对于文件、网络或 Browser 动作，这个区别直接决定能否安全重试。

## Surface 是模型可见历史，不是第二份真相

模型不需要看见全部运行事件。Surface 从 Journal 投影出 user、assistant 与 tool-result 节点；Compaction 用 replacement 事件让新的摘要遮蔽旧节点，但原始事件仍保留。

因此压缩是一次可追溯的视图替换：

- 原始历史没有被删除；
- 模型输入可以从 Journal 重建；
- replacement 必须携带被遮蔽事件的 provenance；
- projection cache 丢失不会损坏 Session。

## 物理格式不应绑死领域协议

首版可以只用 raw UTF-8 `journal.jsonl`：首行 Header，之后每行一个事件。但逻辑事件版本、Session 格式版本和未来存储 backend 版本必须分开。

这样以后即使增加压缩帧或不同存储，也不需要改变 Turn、Step、Tool、repair 和 compaction 的领域含义。反过来，若把 zstd frame、SQLite row 或 packed chunk 当成领域事件，任何存储迁移都会污染 Agent Core。

## 动态插件必须先注册 Event Codec

插件事件若影响恢复或 Prompt，不能简单标成“未知时忽略”。Runtime 应在加载 Session 前从当前 composition 建立 codec registry：

- required codec 缺失时保留原始文件，并把 Session 降为只读/browse-only；
- ignorable 只适用于不影响恢复和模型历史的信息事件；
- inspect 不应偷偷迁移文件，continue/new write 才能显式执行 migration；
- Header 记录 plugin set 与 codec digest，便于解释为何不能 resume。

## 自检问题

1. 删除所有 projection cache 后，能否只靠 Header 与 Journal 重建模型可见历史？
2. 工具 body 崩溃时，日志能否区分 not-started 与 outcome-unknown？
3. required 插件 codec 缺失时，系统会 fail-closed，还是静默丢掉影响恢复的状态？

来源：`docs/histories/2026-08/20260823-0958-actspace-v2-cutover.md`。
