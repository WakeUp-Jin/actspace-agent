# 平台数据根不是单个 Host 的实现细节

CLI 和 Electron 都需要 Session、artifact、设置与运行时文件。如果 CLI 使用 `~/.actspace`，Electron 使用 `appData/actspace`，两边虽然共享同一套 Runtime ABI，却无法发现或恢复对方创建的 Session。这类问题不是路径格式问题，而是跨 Host 数据契约漂移。

## 设计模式

把数据根解析定义为一个独立的 Node-only 公共契约：

```text
显式 data-dir
  → ACTSPACE_DATA_DIR
  → 平台默认 ActSpace root
```

Desktop 将 Electron `userData` 指向同一 canonical root，CLI 复用同一解析逻辑。这样 `sessions-v2/<id>/journal.jsonl` 的所有权、writer lease 和恢复语义保持一致。

## 常见陷阱

- 不要把 Electron `appData` 和 CLI 的 home 下隐藏目录分别当作“自然默认值”；它们在同一平台上也可能不一致。
- 不要因为目录改名就自动合并或删除 lowercase 旧目录。旧目录可能包含可恢复 Session、凭据或历史配置，迁移必须是显式、可审计、可回滚的操作。
- Node-only 的路径模块不能从共享给 renderer 的浏览器入口导出；应使用独立 subpath，避免 Vite 把 `node:os` / `node:path` 带入 renderer bundle。
