# Desktop 前端重构 S0-3 基线

- 时间：2026-10-06 00:00 左右
- 分支：`refactor/desktop-frontend`，从 `main@241c946f` 拉出
- Node：v22.22.2

| 命令 | 结果 | 与 00 §7 的记录对比 |
| --- | --- | --- |
| `pnpm --filter @actspace/desktop typecheck` | 通过，5.2 秒 | 一致 |
| `pnpm --filter @actspace/desktop test` | 1 个失败；文件 138 通过、1 失败、1 跳过（共 140）；用例 1005 通过、1 失败、2 跳过（共 1008） | 一致 |
| `pnpm check:frontend-tokens` | 通过 | 一致 |
| `pnpm check:current-docs` | 通过（45 truth files，0 处断链） | 一致（00 §7 已更新为 0） |
| `pnpm --filter @actspace/desktop build` | 通过 | — |

唯一的失败：`src/main/test/workspace-git-context-service.test.ts` 的「hides Git controls for a non-repository workspace」，与 00 §7 记录的已知失败相同。

## CDP（S0-4）

- 脚本：`tools/cdp-capture.mjs`，从 00 §8 原样保存。
- 启动：按 00 §8，构建产物加 `--remote-debugging-port=9222`，`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`。
- 实测：
  - `screenshots/s0-baseline.png`：默认窗口，新会话页正常渲染；`--eval` 返回 `actspace | 24`（标题和按钮数）；`--keys Tab` 后焦点在「收起会话侧栏」按钮。
  - `screenshots/s0-narrow-480.png`：`--no-reload --width 480 --height 800`，窄窗布局正常。
  - 控制台：只有 `Electron Security Warning (Insecure Content-Security-Policy)`，属已知警告（11 J1 已定不在本轮处理）；每次 reload 输出一次。
- 结束后用 `pkill -f "dist-electron/main/index.js --remote-debugging-port=9222"` 清理，`pgrep` 确认没有残留。
