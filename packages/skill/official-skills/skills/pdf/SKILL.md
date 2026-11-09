---
name: pdf
description: "任何 PDF 相关任务都用：读取或提取 PDF 里的文字 / 表格、合并拆分、旋转页面、加水印、新建 PDF、填表单、加密解密、提取图片、把页面渲染成图片查看版面、处理扫描件。用户提到 .pdf 文件或要产出 PDF 就触发。"
license: Complete terms in LICENSE.txt
---

# PDF 处理指南

改编自 anthropics/skills 的 `pdf`（Apache 2.0）。解释器是随包的 `actspace-python`，自带 `pypdf`、`pdfplumber`（含 `pdfminer.six`、`pypdfium2`）和 `Pillow`；**没有** poppler（`pdftotext` / `pdftoppm` / `pdfimages`）、qpdf、pdftk、reportlab、tesseract。缺的能力下面都给了替代路线。

脚本写到 `$ACTSPACE_SCRATCH`，交付物写进工作区。读 PDF 的脚本路径：`scripts/pdf_to_images.py`（相对本 Skill 目录）。

## 速查

| 任务 | 工具 | 做法 |
|---|---|---|
| 合并 | pypdf | `writer.append(reader)` 或逐页 `add_page` |
| 拆分 | pypdf | 每页一个 `PdfWriter` |
| 提取文字 | pdfplumber | `page.extract_text()`；要版面用 `extract_text(layout=True)` |
| 提取表格 | pdfplumber | `page.extract_tables()` |
| 看版面 / 扫描件 | pypdfium2 | `scripts/pdf_to_images.py in.pdf out_dir`，再用 `inspect_image` 看图 |
| 快速转 Markdown | markitdown（数据扩展） | `actspace-python -m markitdown in.pdf` |
| 新建 PDF | Pillow 或 pypdf | 见「创建 PDF」 |
| 填表单 | pypdf | `writer.update_page_form_field_values` |
| 加密 / 解密 | pypdf | `writer.encrypt` / `reader.decrypt` |
| 提取图片 | pypdf | `page.images` |
| OCR | 本机没有 | 渲染成图后用 `inspect_image` 读；要可搜索 PDF 就说明做不到 |

## pypdf 基本操作

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("document.pdf")
print(len(reader.pages), reader.metadata)

# 合并
writer = PdfWriter()
for path in ["a.pdf", "b.pdf"]:
    writer.append(PdfReader(path))
writer.write("merged.pdf")

# 拆分
for i, page in enumerate(reader.pages):
    out = PdfWriter(); out.add_page(page); out.write(f"page_{i + 1}.pdf")

# 旋转（顺时针 90°）
page = reader.pages[0]; page.rotate(90)

# 水印：把水印页叠到每页
watermark = PdfReader("watermark.pdf").pages[0]
for page in reader.pages:
    page.merge_page(watermark); writer.add_page(page)

# 加密 / 解密
writer.encrypt(user_password="user", owner_password="owner")
if reader.is_encrypted: reader.decrypt("password")

# 提取图片
for image in reader.pages[0].images:
    open(image.name, "wb").write(image.data)
```

`writer.append` 会带上书签、链接；只要页面就 `add_page`。写文件用 `writer.write(path)`。

## pdfplumber 文字与表格

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        for table in page.extract_tables():
            header, *rows = table
```

- 表格识别不准时调 `table_settings`：`{"vertical_strategy": "text", "horizontal_strategy": "text"}` 对没有边框线的表更有效。
- 要坐标用 `page.extract_words()` / `page.chars`。
- 多页表格合并后转 `openpyxl` 写 xlsx（随包）；装了数据扩展可直接 `pandas.DataFrame(rows, columns=header).to_excel(...)`。
- `page.to_image()` 需要 pypdfium2（随包），可以 `.draw_rects(page.extract_words())` 调试版面。

## 看版面 / 扫描件

```bash
actspace-python scripts/pdf_to_images.py input.pdf "$ACTSPACE_SCRATCH/pages" --first 1 --last 3
```

生成 `page_N.png`（200 dpi，长边缩到 1000px），然后用 `inspect_image` 看。扫描件没有文本层（`extract_text()` 为空）时只能走这条路；需要大量 OCR 时如实告诉用户本机没有 OCR 引擎。

## 创建 PDF

本机没有 reportlab。两种随包路线：

- **图片转 PDF（Pillow）**：`Image.open(a).convert("RGB").save("out.pdf", save_all=True, append_images=[...])`，适合把渲染好的图页合成 PDF。
- **文字 PDF**：用 Pillow 在 Letter / A4 尺寸画布（`(2550, 3300)` 对应 300 dpi Letter）上用 `ImageDraw.text` 排版再存 PDF，中文要 `ImageFont.truetype` 指定系统字体。排版复杂（多级标题、目录、表格）时建议先产出 `.docx`（见 `office-docx`）让用户另存为 PDF，并说明原因。
- 不要用 Unicode 上下标字符，用普通字符加位置偏移。

## 表单

```python
reader = PdfReader("form.pdf")
print(reader.get_fields())  # 字段名、类型、当前值
writer = PdfWriter(); writer.append(reader)
writer.update_page_form_field_values(writer.pages[0], {"Name": "张三", "Agree": "/Yes"}, auto_regenerate=False)
writer.set_need_appearances_writer(True)
writer.write("filled.pdf")
```

复选框的值是 `/Yes` 或 `/Off`（以 `get_fields()` 里的 `/_States_` 为准）；单选按钮同理。XFA 表单 pypdf 填不了，要说明。

## 依赖

随包：`pypdf`、`pdfplumber`、`pdfminer.six`、`pypdfium2`、`Pillow`。数据扩展：`markitdown`。不要 `pip install`。
