## [2026-11-13 22:30] | Task: 梳理并制作《ActSpace 诞生记》

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 根据 docs 和 docs/histories 梳理一份 ActSpace 的视频内容，主要想向大家展示 ActSpace 诞生的过程：history 里有完整的时间线，从中梳理出关键节点，让大家知道它原来是这么诞生的、过程很不容易；整体风格和 BGM 要把控好，让大家愿意去看。

### 🛠 Changes Overview

**Scope:** `apps/promo-video`（新增第二部片子和它的内容文档，管线支持多部片子）；`apps/README.md`、`docs/ARCHITECTURE.md`

**Key Actions:**

- **内容文档**：`apps/promo-video/ORIGIN_STORY.md`。定位、故事线、从 696 篇开发记录和 git 历史里梳理出的关键节点（每条带出处）、分镜表、风格、配乐、数字的口径、说法的边界、发布时要注意的事。
- **成片**：《ActSpace 诞生记》，172.7 秒，1920×1080，30 帧，无旁白。12 个分镜：冷开场（写下 86 万行、删掉 41 万行）→ 片名 → 第一夜 → 第一句话 → 越长越多 → 推倒重来 → 再长一遍 → 做减法 → 较真 → 谁在写 → 回头看 → 片尾。一条时间轴和「第 N 天」贯穿全片，中间三章在时间轴上叠一条代码量曲线。
- **管线**：`src/films.js` 登记片子，`render --film <id>`、`music --film <id>`、预览页 `?film=<id>` 选片；默认仍是产品宣传片，改动前后导出的 11 张单帧逐字节相同。数字滚动支持匀速（`data-linear`），混音的淡入时长可以由片子指定。
- **数据**：`scripts/origin-stats.mjs` 对着截止提交数出画面上的全部数字（天数、提交、增删行、每天的代码行数、重写那次提交、按小时的提交分布、开发记录的 Runtime 一栏），结果抄在 `src/origin/data.js`。
- **配乐**：Scott Buckley《Chasing Daylight》（CC BY 4.0），从第 28 个和弦用到曲终，不剪接。分镜长度写成和弦数（`src/origin/cues.js`），换章节落在曲子换段落的和弦上，由 `scripts/test/origin.test.mjs` 守着。
- **文档**：宣传片 README 改成两部片子的说明；`apps/README.md`、`docs/ARCHITECTURE.md` 的登记同步。

### 🧠 Design Intent (Why)

要的是「视频内容」，但只有文字稿看不出好不好看，而仓库里已经有一条能重复渲染的管线。所以底稿和成片一起交：文档写清讲什么、为什么这么排，成片是照着底稿做出来的一版；以后改文案或更新数字，改代码重新渲染即可。

「过程不容易」不靠形容词，只摆能在仓库里核对的事实：凌晨的时间戳、起不来的应用、一次提交改 1,780 个文件、亲手删掉的功能、被 bug 逼出来的规范。每个数字的口径、每句引文的出处都写在文档里；引文只删节不改写，画面上标「摘自开发记录」。能力状态不超出 README 和官网的标注，Kairos、Lab、fs-watch 只作为「做过又删掉的东西」出现。

只出一版，不做多个版本：上一轮的反馈是多版不如一版做好。配乐的备选只列在文档里。

配乐沿用上次的结论，用人做好的、授权清楚的成品。这首要求署名，片尾和文档里都带了，发布时简介里也要贴。曲子是按波形分段和作者的文字说明选的；落点（换和弦的时刻、响度起伏、成片音轨和原曲的对位）在成片上量过，但仍然没有经过人耳试听——文档里写明了要听一遍再定，并列了三首同一授权的备选。

第二部片子放在同一个目录、共用管线，是照之前「视频相关的东西都放到一个文件夹里」的要求。宣传片的分镜和样式没有搬动，只是入口多了一层片子清单。

顺带记一个坑：整片渲染中途用 Ctrl-C 打断，无头 Chrome 不会跟着退出，要手动清掉再重跑。

### 📁 Files Modified

- `apps/promo-video/ORIGIN_STORY.md`（新增）、`apps/promo-video/README.md`
- `apps/promo-video/src/films.js`（新增）、`apps/promo-video/src/{film,main,timeline,tween}.js`
- `apps/promo-video/src/origin/{film,cues,soundtrack,data,shared}.js`、`src/origin/scenes/{opening,firstdays,growth,rewrite,discipline,ending}.js`、`src/origin/styles/{shared,scenes}.css`（新增）
- `apps/promo-video/scripts/render.mjs`、`scripts/origin-stats.mjs`（新增）、`scripts/lib/soundtrack.mjs`、`scripts/test/{origin,soundtrack,tween}.test.mjs`
- `apps/README.md`、`docs/ARCHITECTURE.md`
