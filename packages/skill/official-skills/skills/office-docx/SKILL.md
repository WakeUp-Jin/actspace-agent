---
name: office-docx
description: "用户要创建、读取、编辑 Word 文档（.docx / .dotx）时使用：提到「Word」「docx」「报告 / 备忘 / 信函要 Word 格式」、要从 .docx 里提取或重组内容、查找替换、插入图片、处理批注或修订、把内容整理成排版好的 Word 文件。PDF、表格、Google Docs 不用这个 Skill。"
license: Complete terms in LICENSE.txt
---

# DOCX 创建、编辑与读取

改编自 anthropics/skills 的 `docx`（Apache 2.0）。这里的解释器是 ActSpace 随包的 `actspace-python`，自带 `python-docx`、`lxml`、`Pillow`；没有 Node 的 `docx` 库、pandoc 和 LibreOffice，所以路线不同于上游。

`.docx` 是一组 XML 的 ZIP 包。按任务选路线：

| 任务 | 路线 |
|---|---|
| **新建**文档 | `python-docx` 写脚本——见下方要点 |
| **编辑**已有文档 | 能用 `python-docx` 就用它（段落、表格、图片、样式）；要动修订 / 批注 / 它不支持的结构时，`zipfile` 解包 → 改 `word/document.xml` → 重新打包 |
| **读取**内容 | 装了数据扩展就 `actspace-python -m markitdown file.docx`（Markdown，含表格）；否则 `python-docx` 逐段落 / 表格读 |

脚本写到 `$ACTSPACE_SCRATCH`，交付物写进工作区。

## 用 python-docx 新建——要点

- **页面默认 Letter。** A4 要 `section.page_width = Mm(210); section.page_height = Mm(297)`；横向另设 `section.orientation = WD_ORIENT.LANDSCAPE` 并交换宽高。
- **标题用内置样式** `document.add_heading(text, level)`，目录和导航栏才认得；不要用加粗正文冒充标题。
- **列表用样式** `List Bullet` / `List Number`，不要手写 `•` 或 `1.`。
- **换行用新段落**，不要在一个 run 里塞 `\n`；强制分页 `document.add_page_break()`。
- **表格**：`table.style = "Table Grid"` 才有边框；列宽要对每个单元格设 `cell.width`，只设 `table.columns[i].width` Word 不认；`table.autofit = False`。
- **图片** `document.add_picture(path, width=Inches(5))`，只传宽或高之一保持比例；格式只认 PNG / JPEG / GIF / BMP / TIFF，SVG / EMF 要先转 PNG。
- **字体**要同时设 `run.font.name` 与东亚字体：`run._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")`，否则中文回退到默认字体。
- **目录（TOC）** python-docx 不能生成，要插入域代码 `TOC \o "1-3" \h \z \u` 的 `fldSimple` / `fldChar` 结构，并提醒用户打开后按 F9 更新。
- **页码**同样是域代码 `PAGE`，放在 `section.footer` 的段落里。
- `.dotx` 模板：`Document("template.dotx")` 打开后保存为 `.docx`；要输出模板就保留 `.dotx` 扩展名。

## 编辑已有文档

- 先 `Document(path)` 看 `paragraphs` / `tables` / `sections`，找到目标再改；改 `run.text` 保留格式，改 `paragraph.text` 会把整段合并成一个无格式 run。
- Word 会把一句话拆成多个 `<w:r>`（拼写标记、修订 id），所以「可见的词」可能不是连续字符串。查找替换先把相邻、格式相同的 run 合并，再替换。
- 走 XML 路线时：`zipfile` 解包到 `$ACTSPACE_SCRATCH/unpacked/`；**不要**格式化 / 美化 XML；改完用 `zipfile.ZipFile(out, "w", ZIP_DEFLATED)` 从目录内写回，`[Content_Types].xml` 必须是第一个条目。
- 外部来的文档不可信：解包时忽略绝对路径和含 `..` 的条目。
- **修订（track changes）**：插入用 `<w:ins w:id w:author w:date>` 包住 run，删除用 `<w:del>` 且文字标签是 `<w:delText>`；段落标记的删除放在 `<w:pPr><w:rPr><w:del/></w:rPr></w:pPr>`，表示并入下一段。接受全部修订 = 去掉 `<w:del>` 整段、把 `<w:ins>` 解包。
- **批注**需要 `comments.xml` + `commentRangeStart/End` + `commentReference` 三处配合，还要登记 relationship 与 content type；用 `lxml` 按上述顺序写，不要手拼字符串。

## 验证产出

- 重新 `Document(out)` 打开一遍，没报错且 `len(paragraphs)` / 表格数符合预期。
- 装了数据扩展时 `actspace-python -m markitdown out.docx` 看文本顺序和表格是否正确。
- 要看版式只能转成图片：本机没有 LibreOffice 时告诉用户用 Word 打开检查，不要假装渲染过。

## 依赖

随包：`python-docx`、`lxml`、`Pillow`。可选数据扩展：`markitdown`（读取）。不要 `pip install`。
