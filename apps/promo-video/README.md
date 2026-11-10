# ActSpace 产品宣传片

同一套引擎剪出来的三个版本，都是 1920×1080、30 帧，中文字幕在画面里，没有旁白，配乐由脚本合成。画面全部由这个目录里的网页合成，逐帧渲染成 MP4。

| 版本（`--film`） | 时长 | 讲法 |
| --- | --- | --- |
| `real`（默认） | 38 秒 | **真实界面，一条任务讲到底。** 一个产品窗口从头留到尾：说一句话 → 它读代码改文件 → 要跑命令先问你 → 改了什么 → 上下文花在哪 → 每一步的轨迹，最后三步上手。想说的只有一句：敢放手，因为看得见、管得住 |
| `motion` | 46 秒 | **动效图形。** 界面按视频尺寸重画，一个分镜讲一件事：每个问题都有它的空间 → 说一句话它来动手 → 上下文自己会管 → 要动手先问你 → 能力按需开关 → 三步上手 |
| `short` | 12 秒 | **品牌短片。** 踩着拍点的六个整屏色块，落成一句话和去哪里找 |

成片、截图和配乐都不入库（`out/`、`.cache/`），需要时在本机重新生成。

## 怎么跑

需要本机装有 Chrome / Chromium 和 ffmpeg。在仓库根目录执行：

```bash
pnpm install

# 1. 截取产品画面（只有 real 版需要；约半分钟，界面改版后重跑）
pnpm --filter @actspace/promo-video capture:ui

# 2. 渲染成片到 apps/promo-video/out/actspace-<版本>.mp4（real 约 3 分钟）
pnpm --filter @actspace/promo-video render                  # real
pnpm --filter @actspace/promo-video render --film motion
pnpm --filter @actspace/promo-video render --film short
```

调画面时不用每次都整片渲染：

```bash
pnpm --filter @actspace/promo-video dev                                     # http://127.0.0.1:8770/?film=motion&t=20 预览，可拖动时间轴
pnpm --filter @actspace/promo-video render --film real --stills 8.2,13      # 导出这两个时刻的 PNG 到 out/stills/real/
pnpm --filter @actspace/promo-video render --from 10 --to 16                # 只渲染一段
pnpm --filter @actspace/promo-video render --no-audio                       # 不要配乐
pnpm --filter @actspace/promo-video test                                    # 镜头、数字滚动与配乐合成的单测
```

找不到 Chrome 时用 `CHROME_PATH` 指定可执行文件；在容器里以 root 运行要加 `CHROME_NO_SANDBOX=1`。

## 版本和分镜

版本列表在 `src/films/index.js`，每个版本只是一份分镜列表。分镜是一个对象（`duration`、入场转场、HTML、镜头、配乐强度），文件在 `src/scenes/`：

| 文件 | 分镜 | 用在 |
| --- | --- | --- |
| `workbench.js` | 一个真实窗口里的整条任务：整幅画面按时刻切换，镜头在几个区域之间推拉，指针按截图时量出的按钮位置移动 | `real` |
| `intro.js` | 开场问题与品牌亮相 | `motion` |
| `demo.js` | 说一句话，它来动手 | `motion` |
| `motion.js` | 上下文用量、审批、插件开关 | `motion` |
| `short.js` | 一拍一个的整屏色块 | `short` |
| `outro.js` | 三步上手、收尾（每个版本换自己的那句话） | 全部 |

改文案或时长只动对应的分镜文件；后面分镜的开始时间会自动顺延，配乐也按新的时间线重新合成。配乐是 120 BPM，一小节 2 秒，分镜时长取 2 秒的整数倍，切换才落在小节线上。

## 剪法上守的几条

`real` 版是照着这几条重剪的，改片子时别退回去：

- **一条片子只说一句话。** 其余的都是这句话的证据，不逐项罗列功能。
- **开头先给痛点和真实产品**，不放黑底口号页。
- **跟一条具体任务走到底。** 同一个窗口一直留在画面里，不每讲一点就清屏换图。
- **三级接力：** 完整窗口 → 窗口里的真实点击 → 结果特写，特写停一秒以上再拉回来。
- **窗口外只留一行短标题。** 镜头在动的时候，窗口里的东西不同时做别的动画。

## 它是怎么做出来的

- **按时刻定位，而不是录屏。** 所有动效都是普通的 CSS 动画，用 `animation-delay` 排先后。`src/timeline.js` 把它们全部暂停，再把每个动画的 `currentTime` 设成「当前时刻减去所在分镜的开始时间」。预览和渲染走同一个 `seek(t)`，所以渲染再慢也不会掉帧，同一时刻永远是同一幅画面。打字、数字滚动、镜头和画面切换不是 CSS 动画，由同一个文件里的几个小驱动按时刻直接算。
- **渲染。** `scripts/render.mjs` 用无头 Chrome 打开合成页（`?render=1&film=<版本>`），每帧先 `seek` 再截图，PNG 顺序喂给 ffmpeg 编成 H.264 + AAC。Chrome 通过 `scripts/lib/chrome.mjs` 里的一个最小 DevTools 协议客户端驱动，没有引入浏览器自动化依赖。
- **真实界面的素材。** `scripts/capture-ui.mjs` 打开桌面端 renderer 的浏览器 mock 模式（`?mock=promo-draft`、`?mock=promo-demo`，场景在 `apps/desktop/src/renderer/mock/scenarios/promo-demo.ts`），按片子里的顺序真的去输入、点击、悬停，每到一个状态截一张 3 倍像素密度的整窗图，同时量出按钮和关键区域的位置写进 `.cache/ui/meta.json`。界面是产品本身，数据是一条演示任务；轨迹和上下文面板用的是 renderer 现成的演示数据。renderer 开发服务器没开时脚本会自己起一个，截完关掉。窗口左上角的三个圆点是合成时画上去的。
- **镜头。** `src/camera.js` 把一幅大画面放进固定取景框，按时间在几个区域之间推拉平移；区域用相对整幅画面的 `[左, 上, 宽, 高]` 表示。
- **配乐。** `scripts/lib/music.mjs` 用几层正弦波合成（铺底和弦、拨弦、琶音、低音、底鼓、沙锤），每个分镜给一个强度（也可以在分镜内分段），分镜开始时敲一声钟。没有外部音频素材，也就没有授权问题；同样的时间线得到逐字节相同的 WAV。
- **字体。** 思源宋体、思源黑体和 JetBrains Mono 随 `@fontsource-variable/*` 打包，不依赖本机字体，换机器渲染字形不变。

## 和其他目录的耦合

- 品牌标志引用 `apps/site/src/assets/brand/actspace-mark.png`，不另存一份。颜色、字体和色块舞台沿用 `apps/site/DESIGN.md`。
- `real` 版依赖桌面端 renderer 的 `promo-draft` / `promo-demo` 两个 mock 场景和几个界面选择器（写在 `scripts/capture-ui.mjs` 里）。界面改版后重跑 `capture:ui`：选择器找不到会直接报错；位置变了，镜头和指针跟着 `meta.json` 走，一般不用改分镜。
- `motion` 版里重画的界面（审批卡片、上下文用量、插件开关）是示意，不随产品自动更新；产品改了对应的文案或数字，要手动对一遍 `src/scenes/motion.js`。

画面里的说法以仓库 README 和官网首页为准：只有上下文管理引擎标「已上线」，用到「每个问题，都有它的空间」的版本在页脚写明 Actor 与 Space 还在开发；「怎么用」只写从源码运行。
