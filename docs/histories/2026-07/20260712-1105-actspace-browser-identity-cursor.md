# ActSpace Browser 品牌与连续光标改造

| key | value |
|-----|-------|
| date | 2026-07-12 |
| scope | plugins/browser-bridge, docs/design-docs |
| status | completed |

## 用户诉求

Browser Extension 已具备完整功能，但默认图标、`Agent` 标签组和蓝色圆点光标缺少 ActSpace 品牌感。希望生成正式插件 Logo，把标签组改为 ActSpace，并让虚拟光标像 Codex/Cursor 一样从已有位置平滑移动到目标后再点击。

## 主要变更

- 生成 6 个 ActSpace Browser SVG Logo 方向和离线对比页，选择 `Pointer Relay` 作为首版工具栏图标。
- 导出并接入 Chrome 16/32/48/128 PNG 图标，扩展显示名称改为 `ActSpace Browser`。
- Extension 版本升级到 `0.2.2`，便于 reload 后从运行态确认视觉版本已生效。
- 默认 Tab Group 标题从 `Agent` 改为 `ActSpace`，技术协议与 `abb` CLI 名称保持不变。
- 将蓝色圆点替换为黑色实心、细白描边和克制 ActSpace 蓝投影的 Cursor 风格光标；首版白色主体经真实页面反馈后改为黑色，以提升浅色页面中的视觉重量和品牌质感。
- 第二轮真实截图对比进一步把传统长尾箭头收敛为 `20×24` 的短尾宽主体：白边降为半透明 `1.4px`，黑色接近纯黑，并使用更均匀的柔和蓝色光晕，避免贴纸感。
- 第三轮保持外框尺寸不变，扩大箭头肩部和尾杆的黑色面积，并把白边降到半透明 `1.2px`，修复真实页面中主体显瘦的问题。
- 在先预览、后替换的四方案评审中，用户最终选择 C「圆润短尾」：生产光标改用连续曲线轮廓与 `1.15px` 半透明描边，其他运动和热点契约保持不变。
- cursor runtime 升级为 version 2：首次从 viewport 中心出现，之后从上次位置沿平滑曲线移动。
- Extension 使用 `Runtime.evaluate(awaitPromise=true)` 等待光标到达，随后 Go CUA 才发送真实 CDP 输入事件。
- drag path 的可视光标与每个 CDP 路径点同步，click 在箭头尖端提供短促反馈。
- 新增 cursor runtime fixture，验证首次起点、中间动画帧、位置记忆、最终坐标与点击反馈。

## 设计意图

可视光标不是装饰层，而是用户理解 Agent 即将作用于哪里的安全反馈。动画必须与真实输入事件共享顺序契约：先到达，再执行；否则即使画面看起来有过渡，真实点击仍可能早于光标到达。

## 主要文件

- `plugins/browser-bridge/apps/chrome-extension/assets/logo-showcase.html`
- `plugins/browser-bridge/apps/chrome-extension/assets/logo-variants/`
- `plugins/browser-bridge/apps/chrome-extension/manifest.json`
- `plugins/browser-bridge/apps/chrome-extension/src/cursor-overlay.js`
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`
- `plugins/browser-bridge/apps/cli/internal/cua/engine.go`
- `scripts/test-browser-cursor-runtime.mjs`
