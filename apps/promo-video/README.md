# ActSpace 产品宣传片

约 100 秒、1920×1080、30 帧的产品宣传片：ActSpace 是什么、核心特点、怎么用。画面全部由这个目录里的网页合成，逐帧渲染成 MP4；中文字幕在画面里，没有旁白，配乐由脚本合成。

成片和中间帧都不入库（`out/`、`.cache/`），需要时在本机重新渲染。

## 怎么跑

需要本机装有 Chrome / Chromium 和 ffmpeg。在仓库根目录执行：

```bash
pnpm install

# 1. 录一遍官网首屏的桌面端演示，存成帧序列（约 2 分钟，只在素材变了才需要重录）
pnpm --filter @actspace/promo-video capture:hero

# 2. 渲染成片到 apps/promo-video/out/actspace-promo.mp4（约 8 分钟）
pnpm --filter @actspace/promo-video render
```

调画面时不用每次都整片渲染：

```bash
pnpm --filter @actspace/promo-video dev                        # http://127.0.0.1:8770/ 预览，可拖动时间轴；?t=40 直接跳到第 40 秒
pnpm --filter @actspace/promo-video render --stills 12.5,40    # 导出这两个时刻的 PNG 到 out/stills/
pnpm --filter @actspace/promo-video render --from 30 --to 40   # 只渲染一段
pnpm --filter @actspace/promo-video render --no-audio          # 不要配乐
pnpm --filter @actspace/promo-video test                       # 镜头计算与配乐合成的单测
```

找不到 Chrome 时用 `CHROME_PATH` 指定可执行文件；在容器里以 root 运行要加 `CHROME_NO_SANDBOX=1`。

## 分镜

顺序在 `src/film.js`，每个分镜一个对象（时长、入场重叠、HTML、镜头），文件在 `src/scenes/`。

| 段落     | 分镜                                                                                                                       | 文件                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 是什么   | 开场问题 → 品牌与一句话定位 → 一次完整任务（官网首屏演示的实录）                                                           | `intro.js`、`work.js`       |
| 核心特点 | 上下文看得见、执行有边界、过程可追溯、结果可交付、成本可控（每项一张真实截图，镜头依次推到三个要点）→ 一切皆插件、本地优先 | `features.js`、`plugins.js` |
| 怎么用   | 克隆并启动 → 连接模型 → 选工作区说出任务                                                                                   | `howto.js`                  |
| 收尾     | 接下来的方向（按官网首页的状态如实标注「已上线 / 进行中」）→ 仓库与官网地址                                                | `outro.js`                  |

改文案或时长只动对应的分镜文件；后面分镜的开始时间会自动顺延，配乐也按新的时间线重新合成。

## 它是怎么做出来的

- **按时刻定位，而不是录屏。** 所有动效都是普通的 CSS 动画，用 `animation-delay` 排先后。`src/timeline.js` 把它们全部暂停，再把每个动画的 `currentTime` 设成「当前时刻减去所在分镜的开始时间」。预览和渲染走同一个 `seek(t)`，所以渲染再慢也不会掉帧，同一时刻永远是同一幅画面。
- **渲染。** `scripts/render.mjs` 用无头 Chrome 打开合成页（`?render=1`），每帧先 `seek` 再截图，PNG 顺序喂给 ffmpeg 编成 H.264 + AAC。Chrome 通过 `scripts/lib/chrome.mjs` 里的一个最小 DevTools 协议客户端驱动，没有引入浏览器自动化依赖。
- **「一次任务」的素材。** `scripts/capture-hero.mjs` 打开本地官网，把首屏演示钉满 16:9 视口，然后在页面里接管时钟：定时器、`requestAnimationFrame` 和所有动画只在被要求「下一帧」时前进 1/30 秒。录出来的帧序列和机器快慢无关，重录结果一致。官网开发服务器没开时脚本会自己起一个，录完关掉。
- **截图镜头。** `src/camera.js` 把一张大截图放进固定取景框，按时间在几个区域之间推拉平移；区域用相对整张图的 `[左, 上, 宽, 高]` 表示，写法和官网 `home-features.ts` 一致。
- **配乐。** `scripts/lib/music.mjs` 用几层正弦波合成（铺底和弦、拨弦、低音、沙锤），每个分镜对应一个强度，分镜开始时敲一声钟。没有外部音频素材，也就没有授权问题；同样的时间线得到逐字节相同的 WAV。
- **字体。** 思源宋体、思源黑体和 JetBrains Mono 随 `@fontsource-variable/*` 打包，不依赖本机字体，换机器渲染字形不变。

## 和官网的耦合

宣传片直接引用官网已公开的素材，不另存一份：

- `apps/site/src/assets/brand/actspace-mark.png`
- `apps/site/src/assets/screenshots/home/{approval,context-panel,trajectory,turn-deliverables,space}.png`
- `apps/site/src/assets/screenshots/docs/{usage,model-connection,workspace-overview}.png`
- 首页首屏演示（`apps/site/src/components/home/Hero.astro` 与 `src/scripts/home-stage.ts`）

官网重拍了这些截图，要同步改 `src/scenes/*.js` 里的 `size` 和 `rect`；首屏演示的节奏变了，要重录并核对 `src/scenes/work.js` 里六条字幕的出现时刻。颜色、字体和色块舞台沿用 `apps/site/DESIGN.md`。

画面里的说法以仓库 README 和官网首页为准：能力状态不超出官网首页「方向」一节的标注，「怎么用」只写从源码运行。
