---
name: office-pptx
description: "任何涉及 .pptx / .potx 的任务都用：做幻灯片、演示文稿、路演 PPT；读取、解析或提取 .pptx 里的文字（哪怕提取后用在别处）；编辑、更新已有演示；合并拆分幻灯片；处理模板、版式、演讲者备注。用户提到「PPT」「幻灯片」「deck」「演示」或任何 .pptx 文件名就触发。"
license: Complete terms in LICENSE.txt
---

# PPTX 创建、编辑与读取

改编自 anthropics/skills 的 `pptx`（Apache 2.0）。解释器是随包的 `actspace-python`，自带 `python-pptx`、`lxml`、`Pillow`；没有 Node 的 `pptxgenjs`、LibreOffice 和上游脚本，所以路线不同于上游。

| 任务 | 路线 |
|---|---|
| **新建**一套幻灯片 | `python-pptx` 写脚本——见要点 |
| **编辑**已有幻灯片或基于模板做 | 能用 `python-pptx` 就用它；要复制幻灯片、动母版等它不支持的结构时解包 `ppt/slides/slideN.xml` 改 XML 再打包 |
| **读取**内容 | 装了数据扩展就 `actspace-python -m markitdown deck.pptx`（每页一块，`<!-- Slide number: N -->` 分隔）；否则 `python-pptx` 遍历 `slide.shapes` 取 `text_frame.text` 和 `notes_slide` |

脚本写到 `$ACTSPACE_SCRATCH`，交付物写进工作区。

## 用 python-pptx 新建——要点

- **先定尺寸再加页。** 默认 4:3（10" × 7.5"）；16:9 要 `prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)`。坐标超出画布不会被裁剪，只是看不见。
- **颜色** `RGBColor(0x1E, 0x27, 0x61)` 或 `RGBColor.from_string("1E2761")`，6 位十六进制、不带 `#`。
- **列表**：每个条目一个 `paragraph`，`paragraph.level` 控制层级，不要手写 `•`；项目符号由版式决定，必要时改 XML `<a:buChar>` / `<a:buNone>`。
- **文本框自带内边距**，要和形状 / 线条对齐时 `text_frame.margin_left = 0` 等置零。
- **自动缩放不会真正发生**：`text_frame.word_wrap = True` + `auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE` 只是标记，字号要自己按字符数估算并留 ~10% 余量；文字溢出容器就减字号、分页或加大容器。
- **演讲者备注**写 `slide.notes_slide.notes_text_frame.text`，不要放到正文文本框。
- **图表保持原生**：`slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, x, y, cx, cy, chart_data)`，`CategoryChartData` 喂数据；默认图表很素，设 `chart.has_title`、`plot.has_data_labels`、`series.format.fill.solid()` 配色、关闭单系列的图例。只有 PowerPoint 没有的图形（桑基、网络图）才用 Pillow 画成 PNG 插入。
- **图片**只认 PNG / JPEG / GIF / BMP / TIFF；SVG / EMF 要先转 PNG（Pillow 不转 SVG，没有转换器就换图标方案）。
- **一个 `Presentation()` 对应一个输出文件**，不要复用实例。
- 新页 `prs.slides.add_slide(prs.slide_layouts[6])`（空白版式）最可控；`[0]` 标题、`[1]` 标题+内容、`[5]` 仅标题。

## 编辑已有演示和模板

- 先列版式：`for i, l in enumerate(prs.slide_layouts): print(i, l.name, [p.placeholder_format.type for p in l.placeholders])`，装了数据扩展再用 `markitdown` 读内容，把每段内容映射到合适版式；别每页都用「标题+项目符号」。
- **改文字用 `run.text`**，`text_frame.text = "..."` 会把整段压成一个无格式 run。
- **python-pptx 不能复制幻灯片**（只有 `add_slide(layout)`）。要复制就走 XML：解包 → 复制 `ppt/slides/slideN.xml` 和对应 `_rels/slideN.xml.rels`，在 `[Content_Types].xml` 加 Override，在 `ppt/presentation.xml` 的 `<p:sldIdLst>` 加 `<p:sldId>`（新 id、新 rId），在 `ppt/_rels/presentation.xml.rels` 加 Relationship。复制出来的页仍共享原页引用的图表 / 嵌入对象，改一页的图表会影响另一页。
- **删页 / 重排** = 编辑 `<p:sldIdLst>`；删页后清掉没人引用的 `slideN.xml`、媒体和 rels。
- **结构性操作（增、删、排序）先做完再改内容**。
- 解析 OOXML 用 `lxml.etree`，**不要**用 `xml.etree.ElementTree` 往返（它会改写命名空间前缀，文件损坏）；外部来的文件解包时忽略绝对路径和 `..` 条目。
- **模板槽位 ≠ 内容条数**：模板有 4 个成员位置而你只有 3 个，就把第 4 个整组（图片 + 文本框）删掉，不是只清文字。
- 带前后空格的文字要在 `<a:t>` 上加 `xml:space="preserve"`。
- `.potx` 与 `.pptx` 处理方式相同，输出保留 `.potx` 扩展名。

## 设计思路

**别做无聊的幻灯片。** 白底加项目符号打动不了任何人。

### 开始前

- **选和主题相关的配色**：把这套颜色换到别的主题的演示里依然「合适」，就说明选得不够具体。
- **主次分明**：一个主色占 60–70%，1–2 个辅色，一个强调色。
- **明暗对比**：封面与结尾深色、内容页浅色（「三明治」），或全程深色。
- **一个贯穿的视觉母题**：圆角图框、彩色圆底图标……选一个重复用。**不要用色条或装饰条**。

### 配色参考

| 主题 | 主色 | 辅色 | 强调色 |
|---|---|---|---|
| 午夜商务 | `1E2761` 海军蓝 | `CADCFC` 冰蓝 | `FFFFFF` 白 |
| 森林苔藓 | `2C5F2D` 森林绿 | `97BC62` 苔绿 | `F5F5F5` 米白 |
| 珊瑚活力 | `F96167` 珊瑚 | `F9E795` 金 | `2F3C7E` 藏蓝 |
| 暖陶土 | `B85042` 陶土 | `E7E8D1` 沙 | `A7BEAE` 鼠尾草 |
| 海洋渐变 | `065A82` 深蓝 | `1C7293` 青 | `21295C` 午夜 |
| 炭灰极简 | `36454F` 炭灰 | `F2F2F2` 浅灰 | `212121` 黑 |
| 青色信赖 | `028090` 青 | `00A896` 海沫 | `02C39A` 薄荷 |
| 莓果奶油 | `6D2E46` 莓 | `A26769` 灰玫 | `ECE2D0` 奶油 |

### 每一页

- **每页都要有视觉元素**：图、图表、图标或形状。
- 布局：双栏（左文右图）、图标 + 文字行、2×2 / 2×3 网格、半出血图 + 内容叠加。
- 数据：大数字标注（60–72pt 加小标签）、对比列、时间线 / 流程。

### 字体与尺寸

安全字体（Office 自带且宽度稳定）：Arial、Calibri、Cambria、Times New Roman、Courier New；中文用 微软雅黑 / 宋体 / 苹方（macOS）。不要默认 Aptos。

| 元素 | 字号 |
|---|---|
| 页标题 | 36–44pt 粗体 |
| 节标题 | 20–24pt 粗体 |
| 正文 | 14–16pt |
| 说明 | 10–12pt 弱化 |

间距：页边距 ≥ 0.5"，内容块间 0.3–0.5"，留白。

### 避免

- 每页同一版式；正文居中（只居中标题）；标题与正文字号没拉开；默认蓝色；间距随意。
- 只有一页精心设计、其它页简陋。
- 纯文字页。
- 低对比度元素。
- **标题下的装饰线、横贯整页的色条、侧边竖条、卡片边缘的细色带**——这些是 AI 生成的标志；要区分卡片就用浅色底、阴影或图标。
- 默认米色 / 奶油色背景（`F5F5DC`、`FAF0E6` 等）；没指定就用白或用户品牌色。
- 文字溢出形状。

## QA（必做）

- 内容：`actspace-python -m markitdown out.pptx`（数据扩展）或 `python-pptx` 遍历文字，检查缺漏、错字、顺序；用了模板时 grep `lorem|ipsum|TODO|\[insert|xxx` 查残留占位符。
- 版式：本机没有渲染器。用 `python-pptx` 做几何检查——每个 shape 的 `left + width <= slide_width`、`top + height <= slide_height`，同页 shape 两两是否重叠（排除有意叠放的背景），估算文字行数 × 行高是否超过文本框高度。修完只重查改过的页。
- 最后告诉用户用 PowerPoint / Keynote / WPS 打开确认，不要声称「已看过渲染结果」。

## 依赖

随包：`python-pptx`、`lxml`、`Pillow`。数据扩展：`markitdown`（读取）。不要 `pip install`。
