# Browser Locator Runtime 需要三层分离

## 核心问题

浏览器 Agent 的“点击按钮”看起来只是一个动作，实际包含三类完全不同的责任：

1. **页面语义**：哪个元素是 role=button、accessible name 是什么、label 指向谁、元素是否可见和稳定。
2. **浏览器路由**：目标位于哪个 tab、frame、execution context 或 OOPIF child session。
3. **真实输入**：最终通过 CDP 发送鼠标、键盘、滚动，而不是调用页面元素的 `click()`。

把三类责任全部写进 Extension 或 Go，都会让实现变得僵硬。更稳的结构是：

```text
Go command engine
  -> 解析结构化 target、等待策略、frame 路由
  -> 注入 TypeScript 构建出的页面 Runtime
       -> DOM/ARIA 语义、Shadow DOM、actionability
  -> Extension primitive
       -> chrome.debugger、flat CDP session、真实输入
```

## 为什么页面语义适合 TypeScript

role、accessible name、label、placeholder、Shadow DOM 和 hit-test 都依赖浏览器页面对象。若在 Go 中实现，就必须频繁把 DOM 树序列化回宿主，再人工重建浏览器语义；这既慢，也会丢失 live DOM、样式和事件状态。

页面 Runtime 用 TypeScript 开发，不等于产品运行时依赖 Node。构建阶段将模块打包为单个 JavaScript 文件，Go 再通过 `go:embed` 打入二进制。用户执行时只有 Go 二进制、Extension 和浏览器页面：

```text
runtime-src/*.ts
  -> build
generated/runtime.js
  -> go:embed
abb native host binary
  -> Runtime.evaluate
isolated world in target frame
```

这是一种“源码语言”和“部署形态”分离：TypeScript 提供可维护性，单二进制提供部署稳定性。

## 为什么跨域 Frame 不能只靠 injected JS

同源 iframe 可以从父页面读取 `contentDocument`；跨域 iframe 受同源策略限制，OOPIF 甚至运行在不同 renderer process。页面 Runtime 无法靠递归 DOM 穿透解决。

正确边界是：

1. 页面 Runtime 在父 Frame 定位 iframe element，并返回 element handle 与坐标。
2. Go 用 `DOM.describeNode` 从 handle 得到 frameId。
3. Extension 通过 `Target.setAutoAttach({ flatten: true })` 跟踪 OOPIF child session，并维护 frameId 到 sessionId 的映射。
4. Go 在目标 frame 上调用 `Page.createIsolatedWorld`，把同一份 Runtime 注入目标 execution context。
5. 子 Frame 返回的局部点击坐标逐层加上 iframe offset，最终交给顶层 viewport 的真实输入原语。

关键不变量是：**页面 Runtime 永远只处理当前 execution context；跨 Frame 路由由宿主完成。**

## 容易踩的坑

### 把结构化 Locator 重新压成 selector 字符串

`getByRole`、`getByLabel` 的语义不是 CSS。若宿主先把 target 拼成自定义字符串，再由页面解析，会重新发明一套易出错的 selector grammar。结构化 AST 更适合作为协议事实源，CSS selector 仅保留兼容入口。

### 把 DOM `element.click()` 当成用户点击

DOM click 可以绕过遮挡、viewport、pointer hit-test 和部分事件序列，测试容易“假绿”。页面 Runtime 应只返回可操作点与诊断信息，真实动作仍由 CDP `Input.dispatchMouseEvent` 执行。

### 只更新磁盘上的 native host

Chrome Native Messaging host 是长生命周期进程。原子替换二进制不会更新已经运行的进程；Extension reload 或重连之前，Socket 仍可能暴露旧 schema。验收时要区分“新文件已安装”和“Chrome 已重启新进程”。

### 在主世界注入并信任页面全局

页面脚本可以覆盖全局变量和 DOM API。按 Frame 创建 isolated world，并校验 runtime version/build hash，可以降低冲突和漂移风险。

## 自检问题

- accessible name 的计算发生在 live DOM 所在页面，还是发生在序列化后的宿主快照？
- 跨域 iframe 的定位是页面 JS 在穿透同源策略，还是宿主在切换 CDP execution context？
- Locator 找到元素后，最终动作是 DOM 方法还是浏览器输入原语？
- TypeScript 源码变化后，生成产物、嵌入二进制和正在运行的 native host 是否都已更新？

关联变更：`docs/histories/2026-07/20260717-2257-rewrite-browser-locator-runtime.md`。
