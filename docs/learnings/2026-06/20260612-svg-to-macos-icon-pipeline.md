# 从 SVG 生成 macOS 应用图标的本地管线（含工具选型陷阱）

> 提炼自：`docs/histories/2026-06/20260612-0850-logo-redesign.md`

## 是什么

一条不依赖设计软件的纯命令行管线：单个 SVG 源文件 → 各尺寸透明 PNG → `iconutil` 打包 `.icns`。适用于任何 Electron / 原生 macOS 应用的图标更新。

```text
appicon.svg
  └─ @resvg/resvg-js（按目标宽度渲染，矢量直出，非位图缩放）
       └─ actspace.iconset/icon_{16,32,128,256,512}x*.png（含 @2x，共 10 个）
            └─ iconutil -c icns actspace.iconset -o icon.icns
```

## 核心要点

1. **每个尺寸单独从矢量渲染**，不要渲染一张 1024 再缩放——16px 下的边缘锐度差别明显。resvg 的 `fitTo: { mode: 'width', value: size }` 一行搞定。
2. **iconset 命名是硬约定**：`icon_16x16.png`、`icon_16x16@2x.png`（实际 32px）……缺文件或命名不对，`iconutil` 只报一句 `Invalid Iconset`，不会告诉你差哪个。
3. **图标外围必须透明**：macOS 图标的圆角矩形是画在图里的（本例 `rx=20`，约占画布 84%），系统不会帮你裁剪，Dock 阴影由系统叠加。
4. **SVG mask 做形状相交时注意残边**：用 stroke 形 mask 雕刻相邻图形时，如果被雕图形的边缘恰好落在雕刻带边界上，会留下 1px 残影。解决：让被雕图形收缩到雕刻带内侧，留出余量。

## 工具选型陷阱（macOS 实测）

| 工具 | 结论 |
| --- | --- |
| `qlmanage -t` | 快速预览可用，但**输出强制白底**，做透明图标不可用 |
| `cairosvg` (pip) | 纯 Python 包装，**依赖系统 libcairo**，没有 brew 装 cairo 就直接 `OSError`，不要在干净机器上指望它 |
| `@resvg/resvg-js` (npm) | **首选**。预编译二进制零系统依赖，支持透明、系统字体加载（SVG `<text>` 可用），`npm i` 即用 |
| `sips` | 只能处理位图，不认 SVG，但可用于校验尺寸（`sips -g pixelWidth`） |
| `iconutil` | 系统自带，注意在受限沙箱环境下可能误报 `Invalid Iconset`，本地直跑正常 |

## 自检问题

1. 为什么 16px 图标要从 SVG 直接渲染，而不是缩小 1024px 的 PNG？
2. `icon_16x16@2x.png` 的实际像素是多少？它和 `icon_32x32.png` 有什么区别？（答：都是 32px，但服务于不同 DPI 档位，两个都得有）
3. 如果 `iconutil` 报 `Invalid Iconset`，应该按什么顺序排查？（命名 → 文件齐全 → 运行环境）
