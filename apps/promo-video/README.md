# ActSpace 视频

这个目录里有两部片子，共用一套合成与渲染管线（1920×1080，30 帧，字都在画面里，没有旁白）。画面全部由这个目录里的网页合成，逐帧渲染成 MP4；配乐用授权清楚的现成曲子。

| 片子 | 时长 | 讲什么 | 渲染 |
| --- | --- | --- | --- |
| 产品宣传片（默认） | 71 秒 | 它是什么、核心特点、怎么用、接下来 | `render` |
| 《ActSpace 诞生记》 | 2 分 32 秒 | 头 176 天是怎么做出来的：第一夜、后端重写、做减法、较真 | `render --film origin` |

片子清单在 `src/films.js`。成片和配乐都不入库（`out/`、`.cache/`），需要时在本机重新生成。

## 怎么跑

需要本机装有 Chrome / Chromium 和 ffmpeg。在仓库根目录执行：

```bash
pnpm install
pnpm --filter @actspace/promo-video render                  # 产品宣传片，约 6 分钟，输出 apps/promo-video/out/actspace-promo.mp4
pnpm --filter @actspace/promo-video render --film origin    # 《诞生记》，约 8 分钟，输出 apps/promo-video/out/actspace-origin.mp4
```

第一次渲染会把配乐下载到 `.cache/music/`（每首约 6 MB）。调画面时不用每次都整片渲染。下面的命令默认对产品宣传片；加 `--film origin` 就换成《诞生记》，预览页相应是 `?film=origin`，单帧导出到 `out/stills-origin/`：

```bash
pnpm --filter @actspace/promo-video music                           # 只下载配乐，预览页要用
pnpm --filter @actspace/promo-video dev                             # http://127.0.0.1:8770/?t=20 预览，可拖动时间轴
pnpm --filter @actspace/promo-video render --stills 8.2,23          # 导出这两个时刻的 PNG 到 out/stills/
pnpm --filter @actspace/promo-video render --from 20 --to 27        # 只渲染一段
pnpm --filter @actspace/promo-video render --no-audio               # 不要配乐
pnpm --filter @actspace/promo-video test                            # 镜头、数字滚动、混音参数和《诞生记》分镜表的单测
```

找不到 Chrome 时用 `CHROME_PATH` 指定可执行文件；在容器里以 root 运行要加 `CHROME_NO_SANDBOX=1`。

## 产品宣传片

| 段落 | 时间 | 内容 |
| --- | --- | --- |
| 是什么 | 0:00 – 0:20 | 不存在一个能解决所有问题的 Agent → 每个问题都有它的空间 → ActSpace 是什么 → 说出任务，看它做完 |
| 核心特点 | 0:20 – 0:47 | 上下文看得见、执行有边界、过程有据可查（各 6.7 秒）→ 一切皆插件 |
| 怎么用 | 0:47 – 0:55 | 三条命令从源码运行，连上模型，选文件夹说任务 |
| 接下来 | 0:55 – 1:11 | 从一个 Agent 到一群 Actor（如实标出哪些已上线、哪些进行中）→ 收尾与链接 |

### 分镜

分镜顺序在 `src/film.js`。每个分镜是一个对象（`duration`、入场转场、HTML、镜头），文件在 `src/scenes/`：

| 文件 | 分镜 |
| --- | --- |
| `intro.js` | 开场问题、品牌亮相 |
| `work.js` | 说出任务，看它做完 |
| `features.js` | 三个核心特点，共用「左边标题和要点，右边重画的界面」这一套版式 |
| `plugins.js` | 一切皆插件 |
| `howto.js` | 三步开始 |
| `outro.js` | 接下来、收尾 |

改文案或时长只动对应的分镜文件，后面分镜的开始时间会自动顺延。分镜时长写成配乐的拍数（`beats(10)`），切换才落在拍子上。

做画面时守的两条，都是从前几版的反馈里来的：

- **界面按视频尺寸重画，不放录屏和整幅截图。** 产品截图缩进 1080p 的画面后字只有十几像素，看不清；所以「一次任务」和三个特点里的界面都是照着产品重画的卡片，字号不小于 22px。唯一用到截图的是「接下来」里的 Space，镜头只取其中两块，不整幅放。
- **字和画面说同一件事。** 右边每发生一件事，左边对应的要点亮起；要点只写一行，不带解释。

### 配乐

《The Good Times》，HoliznaCC0，专辑《Be Happy With Who You Are》，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（公有领域，可商用，不要求署名）。来源：<https://freemusicarchive.org/music/holiznacc0/be-happy-with-who-you-are/the-good-times/>。

曲目信息、下载地址和从第几秒开始用，都写在 `src/soundtrack.js`。渲染时 `scripts/lib/soundtrack.mjs` 取出成片长度的一段，量出响度后加一个固定增益调到 -16 LUFS，后面接一个限幅器，只压加了增益会过载的峰值（不做别的动态压缩），头尾淡入淡出。

曲子是 90 拍/分，成片从它的第 2 小节开始用，几个落点是对着曲子的结构排的：鼓进来的那一拍是品牌亮相；只剩和声的间奏落在「一切皆插件」；鼓回来时「怎么用」里的桌面端刚好启动。

换曲子：

```bash
# 先试听：不改代码，直接指定本机的音频文件和从第几秒开始用
pnpm --filter @actspace/promo-video render --music ~/Downloads/another.mp3 --music-start 12
```

定下来后改 `src/soundtrack.js` 里的地址、`bpm` 和 `start`，再对一遍上面几个落点。只用授权清楚、允许商用的曲子，并把来源和授权写在这一节。

## 《ActSpace 诞生记》

内容上的事都在 [ORIGIN_STORY.md](./ORIGIN_STORY.md)：故事线、从 `docs/histories/` 梳理出的关键节点、分镜表、风格、配乐怎么选的、每个数字的口径和出处。这里只说代码怎么放。

| 位置 | 内容 |
| --- | --- |
| `src/origin/film.js` | 分镜顺序 |
| `src/origin/cues.js` | 每个分镜占配乐的几小节；长度只在这里写一次 |
| `src/origin/soundtrack.js` | 配乐的地址、拍速、分段，以及小节换成秒的算法 |
| `src/origin/data.js` | 画面上的所有数字和代码量曲线 |
| `src/origin/scenes/` | 各分镜的文案和版式 |
| `src/origin/shared.js`、`src/origin/styles/` | 贯穿全片的时间轴、代码量曲线，和这部片子自己的样式 |
| `scripts/origin-stats.mjs` | 对着截止提交把 `data.js` 里的数重新数一遍 |

配乐是 Josh Woodward 的《Orbit (Instrumental Version)》（专辑《Addressed to the Stars》），一首木吉他曲，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，可商用。来源：<https://freemusicarchive.org/music/Josh_Woodward/Addressed_to_the_Stars_1995/JoshWoodward-Orbit-NoVox_1885/>。

和宣传片不同的三点：

- **配乐要署名。** 宣传片的配乐是 CC0；这一首是 CC BY，作者要求署名里留着曲名、他的名字和他的网站。片尾卡最下面一行就是署名（`src/origin/scenes/ending.js`）；发布时简介里还要加的那两行，见 ORIGIN_STORY.md 第 9 节。
- **长度按小节写，不按拍。** 这首曲子 94 拍/分，一小节 2.553 秒；成片把它从第一下扫弦用到余音收完，不剪接。分镜长度一律写成小节数，换章节对着曲子起新一句的地方，几个要紧的画面对着曲子的段落（进第二段、间奏、最响的一句）；这个对应关系由 `scripts/test/origin.test.mjs` 守着。
- **数字来自仓库自己。** `node scripts/origin-stats.mjs` 读的是 git 历史和 `docs/histories/`，需要完整的克隆。它只在更新数字时手动跑，渲染和预览都不依赖它。

## 它是怎么做出来的

- **按时刻定位，而不是录屏。** 所有动效都是普通的 CSS 动画，用 `animation-delay` 排先后。`src/timeline.js` 把它们全部暂停，再把每个动画的 `currentTime` 设成「当前时刻减去所在分镜的开始时间」。预览和渲染走同一个 `seek(t)`，所以渲染再慢也不会掉帧，同一时刻永远是同一幅画面。打字、数字滚动和镜头不是 CSS 动画，由同一个文件里的几个小驱动按时刻直接算。
- **渲染。** `scripts/render.mjs` 用无头 Chrome 打开合成页（`?render=1`），每帧先 `seek` 再截图，PNG 顺序喂给 ffmpeg 编成 H.264 + AAC。Chrome 通过 `scripts/lib/chrome.mjs` 里的一个最小 DevTools 协议客户端驱动，没有引入浏览器自动化依赖。
- **镜头。** `src/camera.js` 把一张大图放进固定取景框，按时间在几个区域之间推拉平移；区域用相对整张图的 `[左, 上, 宽, 高]` 表示。
- **字体。** 思源宋体、思源黑体和 JetBrains Mono 随 `@fontsource-variable/*` 打包，不依赖本机字体，换机器渲染字形不变。

## 和其他目录的关系

这个目录自成一体：代码、素材、说明都在这里，合成和渲染不读取仓库里其他目录的文件，整个目录删掉或搬走都不影响别处。唯一会往外看的是 `scripts/origin-stats.mjs`，它在更新《诞生记》的数字时读 git 历史和 `docs/histories/`。目录之外只有几处登记：`pnpm-lock.yaml` 里的字体依赖、`scripts/check-package-boundaries.mjs` 的应用名单、`apps/README.md` 和 `docs/ARCHITECTURE.md` 里各一段说明，以及 `docs/histories/` 里的任务记录。

- `assets/` 里的品牌标志和 Space 截图是从官网（`apps/site/src/assets/`）复制来的，官网换图后这里不会自动跟着变；要用新图就再复制一次，并核对 `src/scenes/outro.js` 里镜头取的两块区域。颜色、字体和色块舞台照着 `apps/site/DESIGN.md` 写。
- 宣传片里重画的界面（任务步骤、上下文用量、审批卡片、轨迹与改动清单）是示意，数字是一条演示任务的数据，不随产品自动更新；产品改了对应的文案或数字，要手动对一遍 `src/scenes/work.js` 和 `src/scenes/features.js`。
- 《诞生记》里的数字截到某一次提交为止，不会自己更新；要更新到新的日期，按 ORIGIN_STORY.md 最后一节做。

画面里的说法以仓库 README 和官网首页为准：只有上下文管理引擎标「已上线」，Harness 自进化、Actor 与 Space 标「进行中」；宣传片的「怎么用」只写从源码运行。
