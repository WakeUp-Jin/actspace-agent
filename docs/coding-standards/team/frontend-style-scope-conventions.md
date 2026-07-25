# 前端样式作用域约定

当前 renderer 的 Tailwind 页面切片迁移已完成收口，旧根部 `styles.css` 与 `legacy-*` 分区已经下线。`packages/desktop/src/renderer/styles/index.css` 是唯一全局样式入口，当前导入顺序是：

```css
@layer theme, base, chrome, components, utilities;

@import "./tokens.css";
@import "./tailwind.css";
@import "./base.css" layer(base);
@import "./electron.css" layer(chrome);
@import "./markdown.css" layer(components);
@import "./diff.css" layer(components);
```

这意味着全局 CSS 只保留 token、base、Electron chrome、Markdown 和 diff 这几个明确边界。基础 reset 必须显式进入 `base` layer，避免后加载的 `font: inherit` 等规则压过组件里的 `text-*` / `font-*` utility。样式 bug 仍然不能只看 JSX 里的 `className`，还要看最终 computed style 和 matched rules。

## 样式所有权

- 新增或已迁移的 Tailwind 页面，页面布局、按钮、卡片、弹窗和状态样式应由组件文件内的 utility / 局部 class 常量负责。
- `styles/base.css` 只放低风险的浏览器级基础默认值，例如 box sizing、字体继承、focus outline、滚动条、body 背景；导入时必须使用 `layer(base)`。不要在 base 里给 `button`、`input`、`a` 这类元素设置视觉身份属性。
- `styles/electron.css` 只服务 Electron chrome、drag / no-drag 和 native-window hit-test 边界；不要把普通页面布局或组件视觉放进去。
- `styles/markdown.css`、`styles/diff.css` 只服务模型输出、代码和 diff 内容边界；普通 message shell、tool preview、Composer、RightPanel 等样式不应回流到这些文件。
- 旧区域需要 reset 时，必须挂在明确的、尚未迁移的局部容器下。不要新增裸的 `button {}` / `input {}` / `a {}`，也不要用 `.split-view button` 这类覆盖整个工作台的宽泛选择器。

## 禁止新增的写法

```css
button {
  border: 0;
  background: none;
  color: inherit;
}

.split-view button {
  background: none;
}
```

这类规则会跨页面污染 Tailwind 组件。即使组件里已经写了 `bg-*`、`text-*`、`border-*`，只要旧 CSS 后加载且没有隔离作用域，就可能把最终样式覆盖掉。

## 推荐写法

```css
.unmigrated-panel button,
.electron-chrome-scope button {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
}
```

如果某个样式只属于一个 Tailwind 页面，优先写在该页面组件的 class 常量里：

```tsx
const primaryButtonClass =
  "inline-flex h-8 items-center rounded-act-md bg-action px-3 text-on-action transition hover:bg-action-hover";
```

颜色职责应使用 `action`、`operational`、`warning`、`danger` 等主题感知语义 token；不要在组件示例中重新引入固定色值或笼统的品牌色。

## 排查流程

遇到“class 写对了，但页面没显示”的样式问题时，按这个顺序排查：

1. 在浏览器 DevTools / in-app browser 里查看目标元素的 `className`，确认 utility 是否真的挂到了元素上。
2. 用 `getComputedStyle(element)` 查看 `backgroundColor`、`borderColor`、`color`、`boxShadow` 等最终值。
3. 在 Styles / Matched Rules 里看是谁覆盖了目标属性，重点关注 `base`、`chrome`、`components` layer 里的全局边界文件，以及是否有未分层的基础规则。
4. 用 `rg` 搜索宽泛选择器：

```sh
rg -n "button \{|input \{|textarea \{|select \{|a \{|\.split-view button" packages/desktop/src/renderer
```

5. 优先收窄污染源选择器。不要为了抢优先级先加 inline style、`!important` 或重复 utility，除非它本身就是数据驱动的一次性样式。

## 验收要求

- 新 Tailwind 页面验收时，至少抽查一个主按钮和一个卡片类元素的 computed style；按钮还要看 `fontSize` / `fontWeight`，防止基础 reset 吞掉 typography utility。
- 如果按钮、卡片、输入框出现“边框/背景/文字颜色不符合 className”的现象，先怀疑全局 CSS 覆盖。
- 视觉问题在真实 Electron / Retina 屏上复验；浏览器截图和缩放视图可能会把 1px 浅边框显示得比实际更清楚。
