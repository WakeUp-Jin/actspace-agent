## [2026-05-26 15:58] | Task: Polish usage statistics prototype

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 调整 usage statistics 原型：不要推广卡；修复右侧顶部 tabs/actions 布局；删除旧工具卡，新增工具统计和详情弹窗；放大主统计卡；调整左侧指标排行；重做缓存效率模块，并将绿色主调改为蓝色。

### 🛠 Changes Overview

**Scope:** `docs/design-docs/frontend-ui/usage-statistics`

**Key Actions:**

- **[Prototype redesign]**: 重写 `prototype.html` 的统计页布局，保留左右两栏仪表盘结构，将 tabs/actions 放入右侧主统计卡。
- **[Tool stats]**: 删除旧 `Read/Bash/Grep/Others` 工具卡，新增工具统计摘要与工具调用详情弹窗。
- **[Visual polish]**: 将主色从绿色调整为仓库现有蓝色体系，重做缓存效率、热力图、分布条和趋势图视觉。
- **[Layout alignment]**: 合并左侧指标与模型排行卡，调整排行序号、间距、圆角和窄桌面适配。
- **[Density pass]**: 参考本地 Token Tracker 页面收紧整体密度，将卡片圆角、padding、主统计卡高度、热力图和表格字号调整为更接近产品界面的尺寸。
- **[Inline tool details]**: 将工具调用分布移到左侧栏，改为卡内「查看详情 / 收起」展开，不再使用工具详情弹窗。
- **[Cache cleanup]**: 删除缓存效率模块的说明文本，只保留关键数值、进度条和指标卡。
- **[Tool modal restore]**: 根据后续视觉反馈，将工具调用详情从卡内展开改回紧凑弹窗，左侧工具卡只保留分布摘要和入口按钮。
- **[Ranking accents]**: 为模型排行前三名徽章增加蓝、青、紫三档轻量颜色，增强识别度但保持低噪声。

### 🧠 Design Intent (Why)

用户希望原型更接近参考图的宽屏数据仪表盘气质，同时去掉不需要的推广卡和产品卡。后续对照本地 Token Tracker 页面发现原型尺寸偏展示稿，因此进一步收紧为产品界面密度。新版本把右侧主统计卡作为首屏核心，工具信息迁移到左栏并通过弹窗查看详情，缓存效率改成更贴合 actspace 主色调的蓝色数据模块。

### 📁 Files Modified

- `docs/design-docs/frontend-ui/usage-statistics/prototype.html`
- `docs/histories/2026-05/20260526-1558-usage-statistics-prototype-polish.md`
