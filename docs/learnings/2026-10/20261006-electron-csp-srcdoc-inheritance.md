# Electron 主文档 CSP：先查 srcdoc 继承，再谈策略

想给 Electron 的主文档加一条严格 CSP（`script-src 'self'; style-src 'self'`），通常的担心是「React 的内联样式会不会被拦」。实测下来，这个担心不成立，真正会被打坏的是另一类东西：**由主文档派生出来的 srcdoc iframe**。

2026-10-06 在 Electron 39 上做了两组实验（独立小程序 + 真实应用临时加 meta，结论记录在 `docs/exec-runs/20261005-desktop-fe-11-security-ipc/execution-process.md` 的 T9）。

## 三个反直觉的结论

1. **srcdoc iframe 继承父文档的 CSP，而且放不宽。**
   - `<iframe srcdoc>` 没有自己的来源，浏览器把父文档的策略原样带进去。
   - iframe 里再写一条宽松的 `<meta http-equiv="Content-Security-Policy">` 也没用：多条策略同时生效，结果只会更严。
   - 加 `sandbox="allow-scripts"` 也不改变继承。`frame-src` 管的是要加载的 URL，srcdoc 不经过它。
   - 结果：HTML 预览里的内联脚本、`<style>`、`style="…"` 和预览自己注入的桥脚本全部失效。
2. **React 的 `style` prop 不受 `style-src` 限制。**
   - React 通过 CSSOM（`element.style.color = …`）写样式，CSP 只拦「解析 HTML 时遇到的 `style` 属性」和 `<style>` 元素。
   - 真实应用加严格策略后启动，63 个带 style 的元素没有一条违规。
   - 但 `innerHTML` / `dangerouslySetInnerHTML` 插进来的 `style="…"` 和 `<style>` 会被拦。mermaid 渲染出的 SVG 自带 `<style>`，所以会失去样式。
3. **file:// 页面也能用响应头注入 CSP。**
   - `session.webRequest.onHeadersReceived` 对 file:// 的主文档和子资源都会触发，给 `mainFrame` 加 `Content-Security-Policy` 头，效果和 meta 完全一样。
   - 所以 CSP 不必写死在 `index.html`，可以由 main 按 dev / 生产分别注入。

另外：`script-src 'self'` 在 file:// 下放行同目录的脚本，Vite 产物的 `<script type="module" crossorigin>` 能正常加载。

## 实验怎么做才不被干扰

- 每个变体单独起一个 Electron 进程。同一进程里连续 `loadFile`、换 partition，会偶发 `ERR_FAILED`，看起来像 CSP 的问题，其实不是。
- 违规用 `webContents.on("console-message")` 收集；被拦的效果用 `getComputedStyle` 和脚本是否改了 DOM 来判断，不要只看控制台。
- 在 Claude Code 的 Bash 沙箱里直接起 Electron 会因为 Mach port 查找被拒而立刻退出（`bootstrap_look_up … Permission denied`），要在沙箱外运行。

## 对上 CSP 的顺序

1. 先列出所有「用父文档身份渲染外部内容」的地方：srcdoc iframe、`innerHTML` 插入的 SVG / HTML。
2. 把它们挪到不继承主文档策略的载体上（自定义协议、独立 origin），或者给它们的样式找到 nonce / hash。
3. 最后再由 main 注入严格 CSP。

## 自检

1. HTML 预览的 iframe 已经带了自己的严格 CSP，主文档再加一条严格 CSP，预览里的脚本还能跑吗？
2. 组件里大量使用 `style={{ … }}`，是否必须在 `style-src` 中放行 `'unsafe-inline'`？
3. 应用从 file:// 加载，能否不改 `index.html` 就加上 CSP？
