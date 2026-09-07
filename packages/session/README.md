# Session domain group

Session 的事实源是 `sessions-v2/<id>/journal.jsonl`。Journal、persistence、raw JSONL backend 和 projection 是独立替换边界，不能复制 mutable conversation state。
