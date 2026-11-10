---
name: data-analysis
description: "用户要对数据做统计、聚合、清洗、透视、对比、找趋势或异常时使用：CSV / TSV / JSON / Excel / 日志里的数字要算汇总、分组、同比环比、去重合并、缺失值处理，或者要把多个数据文件拼成一张表。交付物是数字结论、整理后的表格或 Markdown 报告；只是读一眼文件内容不算，纯做 Excel 公式的任务走 office-xlsx。"
---

# 数据分析

ActSpace 自写 Skill。解释器是随包的 `actspace-python`；`pandas` 和 `numpy` 在**数据扩展**里，不是随包核心。

## 先确认扩展

`import pandas` 失败（`ModuleNotFoundError`）就停下来告诉用户：到 设置 › 扩展 › 插件 › 命令行 点「下载数据扩展」，下载完直接重试，不用重启。不要 `pip install`，也不要用系统 Python 替代。

小数据（几千行以内、只做计数求和）可以用标准库 `csv` + `collections` + `statistics` 完成，不必等扩展。

## 工作方式

1. **先看结构再算。** `df.shape`、`df.dtypes`、`df.head()`、`df.isna().sum()`，把这些摘要写进回复；不要把整张表 print 出来（Bash 输出上限 8000 字符）。
2. **脚本写到 `$ACTSPACE_SCRATCH`**，超过 20 行或要反复跑的分析都写文件再 `actspace-python "$ACTSPACE_SCRATCH/analyze.py"`；一两行的探索用 `actspace-python -c '...'`。
3. **结果落文件再读**：聚合结果 `to_csv` / `to_markdown` 到 `$ACTSPACE_SCRATCH` 或工作区，再用 `read_file` 看，不要靠滚屏输出。
4. **交付物进工作区**：整理后的 CSV / XLSX / Markdown 报告放用户的工作区目录；中间文件留在 scratch，会话结束会自动清理。
5. **把假设写进结论**：日期格式、单位、缺失值怎么处理、去重键是什么。数字四舍五入到合理位数，并说明样本量。

## pandas 要点

- 读取：`pd.read_csv(path, encoding="utf-8-sig")` 处理 BOM；编码不明先 `open(path, "rb").read(4096)` 看；`pd.read_excel(path, sheet_name=None)` 一次读所有 sheet（依赖随包的 `openpyxl`）。
- 日期：`pd.to_datetime(col, errors="coerce", format=...)`，显式给 `format` 避免逐行猜测；时区统一后再比较。
- 分组：`df.groupby(keys, dropna=False).agg(total=("amount", "sum"), n=("id", "nunique"))`，命名聚合比 `agg({"amount": "sum"})` 可读。
- 透视：`pd.pivot_table(df, index=, columns=, values=, aggfunc=, fill_value=0, margins=True)`。
- 同比环比：先 `set_index("date").resample("MS").sum()`，再 `.pct_change()` / `.pct_change(12)`。
- 合并：`pd.merge(a, b, on=key, how="left", validate="m:1", indicator=True)`，用 `validate` 防止意外多对多膨胀，看 `_merge` 统计匹配率。
- 异常值：`describe()` 看分位数，IQR 法（`q1 - 1.5*iqr`, `q3 + 1.5*iqr`）或 z-score，先报告再决定是否剔除。
- 大文件：`read_csv(chunksize=...)` 流式聚合；`usecols` 只读需要的列；`dtype` 指定类别列为 `category`。
- 输出 Markdown 表：`df.to_markdown(index=False)` 需要 `tabulate`（未随包），用 `df.to_string(index=False)` 或自己拼 `|` 表。

## 产出 Excel

整理后的表要给用户继续编辑时，写 `.xlsx`：`df.to_excel(path, index=False, sheet_name="数据")`。需要公式、格式、图表就按 `office-xlsx` Skill 用 `openpyxl` 加工同一文件。

## 不做的事

- 不画图：随包和扩展都没有 matplotlib，用表格和文字描述趋势；用户一定要图就说明限制。
- 不联网取数：数据来自工作区文件或用户给的内容。
- 不在没看过数据分布前下结论。
