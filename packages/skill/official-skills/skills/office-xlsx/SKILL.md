---
name: office-xlsx
description: "表格文件是主要输入或输出时使用：打开、读取、编辑、修复 .xlsx / .xlsm / .xltx / .csv / .tsv（加列、写公式、格式化、画图、清洗脏数据）、从零或从别的数据源新建表格、表格格式互转。用户随口提到某个表格文件（「下载里那个 xlsx」）并要对它做事也算。交付物是 Word、HTML 报告、Python 脚本或数据库流程时不用。"
license: Complete terms in LICENSE.txt
---

# XLSX 创建、编辑与分析

改编自 anthropics/skills 的 `xlsx`（Apache 2.0）。解释器是随包的 `actspace-python`，自带 `openpyxl`、`XlsxWriter`；`pandas` 与 `markitdown` 在数据扩展里（未安装时 `import pandas` 会失败，提示用户到 设置 › 扩展 › 插件 › 命令行 下载）。本机没有 LibreOffice，所以没有 `recalc.py`。

| 任务 | 路线 |
|---|---|
| **新建**或**编辑**带公式 / 格式的表 | `openpyxl`——见要点 |
| 只**新建**、追求速度和图表 | `XlsxWriter`（只写不读） |
| **批量数据**进出 | `pandas`（`read_excel` / `to_excel`，需数据扩展）；没有扩展就用 `csv` 模块 + `openpyxl` |
| **快速看一眼** | `actspace-python -m markitdown file.xlsx`（每个 sheet 一个 `##`，没有单元格坐标，别据此规划编辑） |
| **读模型**（公式和值都要） | `load_workbook` 两遍——见要点 |

脚本写到 `$ACTSPACE_SCRATCH`，交付物写进工作区。

## 每个产出都要满足

- **用公式，不写死结果。** `ws["B10"] = "=SUM(B2:B9)"`，不是 Python 算好的数。输入变了表要能重算。
- **照用户的规格写。** 标签名、列头、他写出来的公式都原样用，不要自作主张重新设计。
- **每个假设和写死的数字都要标出来**：单元格批注或表尾相邻单元格；有来源就引用，是用户给的就写明。
- **给人填的表**要有一小段图例说明哪些格子可以改，加一行示例数据；被要求编辑的现成文件不要加示例行。
- **编辑已有文件时匹配它的惯例**，这些优先于下面所有规则：先找输入格（通常颜色 / 填充不同），只写那里，不动已有公式。
- **字体**统一（Arial / Calibri 等），除非用户另有要求。

## 公式没有缓存值（没有 LibreOffice 的后果）

openpyxl 写进去的公式只是字符串，**没有计算结果**。用 `data_only=True`、pandas 或预览器读回时全是 `None`，Excel / Numbers / WPS 打开时才会算。所以：

- 交付前**自己验证公式逻辑**：先写 2–3 个公式，用 Python 对同一数据算一遍对照，再铺满整列。
- 需要在 ActSpace 里拿到结果数值时，用 Python 另算一份，不要试图从文件读公式结果。
- 告诉用户「公式会在 Excel 打开时计算」；绝不说「我已验算过文件里的数值」。

## 选能被各处识别的函数

- **优先 Excel 2007 时代的函数**：`SUMIFS`、`INDEX`、`MATCH`、`IFERROR`、`SUMPRODUCT`。
- **2007 以后的函数要加 `_xlfn.` 前缀**，因为 openpyxl 原样写入 XML 而 Excel 存储时带前缀：`_xlfn.TEXTJOIN`、`_xlfn.CONCAT`、`_xlfn.IFS`、`_xlfn.SWITCH`、`_xlfn.MAXIFS`、`_xlfn.MINIFS`。裸写会变 `#NAME?`。
- **别用 `XLOOKUP`、`XMATCH`、`SORT`、`FILTER`、`UNIQUE`、`SEQUENCE`**：它们是溢出数组函数，openpyxl 写的文件没有溢出元数据，老版本 Excel 和 WPS 也不一定支持。查找用 `INDEX`/`MATCH`，排序 / 筛选 / 去重在 Python 里做完再写。

## openpyxl 要点

- **读模型要两遍**：`data_only=True` 得到缓存值（公式没了）；默认得到公式字符串（没有值）。
- **`data_only=True` 打开后保存是破坏性的**：公式全部变成字面量。
- **合并单元格只写左上角**，其他是只读的 `MergedCell`。
- **`.xlsm` 要 `keep_vba=True`**，否则宏丢失。
- **含空格的 sheet 名在跨表引用里要加引号**：`='Assumptions Inputs'!$B$5`。
- **百分比按小数存**（`0.15` 显示 `15.0%`），数字格式 `number_format = "0.0%"`。
- **日期**写 `datetime` 对象并设 `number_format = "yyyy-mm-dd"`，不要写字符串。
- 大文件用 `load_workbook(read_only=True)` 读、`Workbook(write_only=True)` 写。
- **图表**：`openpyxl.chart`（BarChart / LineChart / PieChart）引用 `Reference`，图表原生可编辑；不要贴图片代替。

## 财务模型约定

除非用户另有要求或已有文件另有惯例：

- **颜色**：蓝字（`0000FF`）硬编码输入和情景变量；黑字公式；绿字（`008000`）跨表链接；黄底（`FFFF00`）关键假设和用户要填的格。
- **数字**：货币 `$#,##0`，单位写在表头（`Revenue ($mm)`）；零显示 `-`（`$#,##0;($#,##0);-`）；负数括号；百分比 `0.0%`；倍数 `0.0x`；年份作文本（`"2024"`，不是 `2,024`）。
- **结构**：每个假设单独一格并被公式引用（`=B5*(1+$B$6)`，不是 `=B5*1.05`）；同一行公式在每个期间一致；分母可能为零的要防。

## 依赖

随包：`openpyxl`、`XlsxWriter`。数据扩展：`pandas`、`numpy`、`markitdown`。不要 `pip install`。
