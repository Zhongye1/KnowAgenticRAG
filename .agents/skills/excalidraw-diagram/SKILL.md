---
name: excalidraw-diagram
description: Generate Excalidraw diagrams from text content. Supports three output modes - Obsidian (.md), Standard (.excalidraw), and Animated (.excalidraw with animation order). Triggers on "Excalidraw", "画图", "流程图", "思维导图", "可视化", "diagram", "标准Excalidraw", "standard excalidraw", "Excalidraw动画", "动画图", "animate".
metadata:
  version: 1.2.1
---

# Excalidraw Diagram Generator

Create Excalidraw diagrams from text content with multiple output formats.

## Output Modes

根据用户的触发词选择输出模式：

| 触发词 | 输出模式 | 文件格式 | 用途 |
|--------|----------|----------|------|
| `Excalidraw`、`画图`、`流程图`、`思维导图` | **Obsidian**（默认） | `.md` | 在 Obsidian 中直接打开 |
| `标准Excalidraw`、`standard excalidraw` | **Standard** | `.excalidraw` | 在 excalidraw.com 打开/编辑/分享 |
| `Excalidraw动画`、`动画图`、`animate` | **Animated** | `.excalidraw` | 拖到 excalidraw-animate 生成动画 |

## Workflow

1. **Detect output mode** from trigger words (see Output Modes table above)
2. Analyze content - identify concepts, relationships, hierarchy
3. Choose diagram type (see Diagram Types below)
4. Generate Excalidraw JSON (add animation order if Animated mode)
5. Output in correct format based on mode
6. **Automatically save to current working directory**
7. Notify user with file path and usage instructions

## Output Formats

### Mode 1: Obsidian Format (Default)

**严格按照以下结构输出，不得有任何修改：**

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
{JSON 完整数据}
\`\`\`
%%
```

**关键要点：**
- Frontmatter 必须包含 `tags: [excalidraw]`
- 警告信息必须完整
- JSON 必须被 `%%` 标记包围
- 不能使用 `excalidraw-plugin: parsed` 以外的其他 frontmatter 设置
- **文件扩展名**：`.md`

### Mode 2: Standard Excalidraw Format

直接输出纯 JSON 文件，可在 excalidraw.com 打开：

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

**关键要点：**
- `source` 使用 `https://excalidraw.com`（不是 Obsidian 插件）
- 纯 JSON，无 Markdown 包装
- **文件扩展名**：`.excalidraw`

### Mode 3: Animated Excalidraw Format

与 Standard 格式相同，但每个元素添加 `customData.animate` 字段控制动画顺序：

```json
{
  "id": "element-1",
  "type": "rectangle",
  "customData": {
    "animate": {
      "order": 1,
      "duration": 500
    }
  },
  ...其他标准字段
}
```

**动画顺序规则：**
- `order`: 动画播放顺序（1, 2, 3...），数字越小越先出现
- `duration`: 该元素的绘制时长（毫秒），默认 500
- 相同 `order` 的元素同时出现
- 建议顺序：标题 → 主要框架 → 连接线 → 细节文字

**使用方法：**
1. 生成 `.excalidraw` 文件
2. 拖到 https://dai-shi.github.io/excalidraw-animate/
3. 点击 Animate 预览，然后导出 SVG 或 WebM

**文件扩展名**：`.excalidraw`

---

## Diagram Types & Selection Guide

选择合适的图表形式，以提升理解力与视觉吸引力。

| 类型 | 英文 | 使用场景 | 做法 |
|------|------|---------|------|
| **流程图** | Flowchart | 步骤说明、工作流程、任务执行顺序 | 用箭头连接各步骤，清晰表达流程走向 |
| **思维导图** | Mind Map | 概念发散、主题分类、灵感捕捉 | 以中心为核心向外发散，放射状结构 |
| **层级图** | Hierarchy | 组织结构、内容分级、系统拆解 | 自上而下或自左至右构建层级节点 |
| **关系图** | Relationship | 要素之间的影响、依赖、互动 | 图形间用连线表示关联，箭头与说明 |
| **对比图** | Comparison | 两种以上方案或观点的对照分析 | 左右两栏或表格形式，标明比较维度 |
| **时间线图** | Timeline | 事件发展、项目进度、模型演化 | 以时间为轴，标出关键时间点与事件 |
| **矩阵图** | Matrix | 双维度分类、任务优先级、定位 | 建立 X 与 Y 两个维度，坐标平面安置 |
| **自由布局** | Freeform | 内容零散、灵感记录、初步信息收集 | 无需结构限制，自由放置图块与箭头 |

## Design Rules

### Text & Format
- **所有文本元素必须使用** `fontFamily: 5`（Excalifont 手写字体）
- **文本中的双引号替换规则**：`"` 替换为 `『』`
- **文本中的圆括号替换规则**：`()` 替换为 `「」`
- **字体大小规则**（硬性下限，低于此值在正常缩放下不可读）：
  - 标题：20-28px（最小 20px）
  - 副标题：18-20px
  - 正文/标签：16-18px（最小 16px）
  - 次要注释：14px（仅限不重要的辅助说明，慎用）
  - **绝对禁止低于 14px**
- **行高**：所有文本使用 `lineHeight: 1.25`
- **文字居中估算**：独立文本元素没有自动居中，需手动计算 x 坐标：
  - 估算文字宽度：`estimatedWidth = text.length * fontSize * 0.5`（CJK 字符用 `* 1.0`）
  - 居中公式：`x = centerX - estimatedWidth / 2`
  - 示例：文字 "Hello"（5字符, fontSize 20）居中于 x=300 → `estimatedWidth = 5 * 20 * 0.5 = 50` → `x = 300 - 25 = 275`

### Layout & Design
- **画布范围**：建议所有元素在 0-1200 x 0-800 区域内
- **最小形状尺寸**：带文字的矩形/椭圆不小于 120x60px
- **元素间距**：最小 20-30px 间距，防止重叠
- **层次清晰**：使用不同颜色和形状区分不同层级的信息
- **图形元素**：适当使用矩形框、圆形、箭头等元素来组织信息
- **禁止 Emoji**：不要在图表文本中使用任何 Emoji 符号，如需视觉标记请使用简单图形（圆形、方形、箭头）或颜色区分

### Color Palette

**文字颜色（strokeColor for text）：**

| 用途 | 色值 | 说明 |
|------|------|------|
| 标题 | `#1e40af` | 深蓝 |
| 副标题/连接线 | `#3b82f6` | 亮蓝 |
| 正文文字 | `#374151` | 深灰（白底最浅不低于 `#757575`） |
| 强调/重点 | `#f59e0b` | 金色 |

**形状填充色（backgroundColor, fillStyle: "solid"）：**

| 色值 | 语义 | 适用场景 |
|------|------|---------|
| `#a5d8ff` | 浅蓝 | 输入、数据源、主要节点 |
| `#b2f2bb` | 浅绿 | 成功、输出、已完成 |
| `#ffd8a8` | 浅橙 | 警告、待处理、外部依赖 |
| `#d0bfff` | 浅紫 | 处理中、中间件、特殊项 |
| `#ffc9c9` | 浅红 | 错误、关键、告警 |
| `#fff3bf` | 浅黄 | 备注、决策、规划 |
| `#c3fae8` | 浅青 | 存储、数据、缓存 |
| `#eebefa` | 浅粉 | 分析、指标、统计 |

**区域背景色（大矩形 + opacity: 30，用于分层图表）：**

| 色值 | 语义 |
|------|------|
| `#dbe4ff` | 前端/UI 层 |
| `#e5dbff` | 逻辑/处理层 |
| `#d3f9d8` | 数据/工具层 |

**对比度规则：**
- 白底上文字最浅不低于 `#757575`，否则不可读
- 浅色填充上用深色变体文字（如浅绿底用 `#15803d`，不用 `#22c55e`）
- 避免浅灰色文字（`#b0b0b0`、`#999`）出现在白底上

参考：[references/excalidraw-schema.md](references/excalidraw-schema.md)

## JSON Structure

**Obsidian 模式：**
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://github.com/zsviczian/obsidian-excalidraw-plugin",
  "elements": [...],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

**Standard / Animated 模式：**
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

## Element Template

Each element requires these fields (do NOT add extra fields like `frameId`, `index`, `versionNonce`, `rawText` -- they may cause issues on excalidraw.com. `boundElements` must be `null` not `[]`, `updated` must be `1` not timestamps):

```json
{
  "id": "unique-id",
  "type": "rectangle",
  "x": 100, "y": 100,
  "width": 200, "height": 50,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": {"type": 3},
  "seed": 123456789,
  "version": 1,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

`strokeStyle` values: `"solid"`（实线，默认）| `"dashed"`（虚线）| `"dotted"`（点线）。虚线适合表示可选路径、异步流、弱关联等。

Text elements add:
```json
{
  "text": "显示文本",
  "fontSize": 20,
  "fontFamily": 5,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": null,
  "originalText": "显示文本",
  "autoResize": true,
  "lineHeight": 1.25
}
```

**Animated 模式额外添加** `customData` 字段：
```json
{
  "id": "title-1",
  "type": "text",
  "customData": {
    "animate": {
      "order": 1,
      "duration": 500
    }
  },
  ...其他字段
}
```

See [references/excalidraw-schema.md](references/excalidraw-schema.md) for all element types.

---

## Additional Technical Requirements

### Text Elements 处理
- `## Text Elements` 部分在 Markdown 中**必须留空**，仅用 `%%` 作为分隔符
- Obsidian ExcaliDraw 插件会根据 JSON 数据**自动填充文本元素**
- 不需要手动列出所有文本内容

### 坐标与布局
- **坐标系统**：左上角为原点 (0,0)
- **推荐范围**：所有元素在 0-1200 x 0-800 像素范围内
- **元素 ID**：每个元素需要唯一的 `id`（可以是字符串，如「title」「box1」等）

### Required Fields for All Elements

**IMPORTANT**: Do NOT include `frameId`, `index`, `versionNonce`, or `rawText` fields. Use `boundElements: null` (not `[]`), and `updated: 1` (not timestamps).

```json
{
  "id": "unique-identifier",
  "type": "rectangle|text|arrow|ellipse|diamond",
  "x": 100, "y": 100,
  "width": 200, "height": 50,
  "angle": 0,
  "strokeColor": "#color-hex",
  "backgroundColor": "transparent|#color-hex",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid|dashed|dotted",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": {"type": 3},
  "seed": 123456789,
  "version": 1,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Text-Specific Properties
文本元素 (type: "text") 需要额外属性（do NOT include `rawText`）：
```json
{
  "text": "显示文本",
  "fontSize": 20,
  "fontFamily": 5,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": null,
  "originalText": "显示文本",
  "autoResize": true,
  "lineHeight": 1.25
}
```

### appState 配置
```json
"appState": {
  "gridSize": null,
  "viewBackgroundColor": "#ffffff"
}
```

### files 字段
```json
"files": {}
```

## Common Mistakes to Avoid

- **文字偏移** — 独立 text 元素的 `x` 是左边缘，不是中心。必须用居中公式手动计算，否则文字会偏到一边
- **元素重叠** — y 坐标相近的元素容易堆叠。放置新元素前检查与周围元素是否有至少 20px 间距
- **画布留白不足** — 内容不要贴着画布边缘。在四周留 50-80px 的 padding
- **标题没有居中于图表** — 标题应居中于下方图表的整体宽度，不是固定在 x=0
- **箭头标签溢出** — 长文字标签（如 "ATP + NADPH"）会超出短箭头。保持标签简短或加大箭头长度
- **对比度不够** — 浅色文字在白底上几乎不可见。文字颜色不低于 `#757575`，有色文字用深色变体
- **字号太小** — 低于 14px 在正常缩放下不可读，正文最小 16px

## Implementation Notes

### Auto-save & File Generation Workflow

当生成 Excalidraw 图表时，**必须自动执行以下步骤**：

#### 1. 选择合适的图表类型
- 根据用户提供的内容特性，参考上方 「Diagram Types & Selection Guide」 表
- 分析内容的核心诉求，选择最合适的可视化形式

#### 2. 生成有意义的文件名

根据输出模式选择文件扩展名：

| 模式 | 文件名格式 | 示例 |
|------|-----------|------|
| Obsidian | `[主题].[类型].md` | `商业模式.relationship.md` |
| Standard | `[主题].[类型].excalidraw` | `商业模式.relationship.excalidraw` |
| Animated | `[主题].[类型].animate.excalidraw` | `商业模式.relationship.animate.excalidraw` |

- 优先使用中文以提高清晰度

#### 3. 使用 Write 工具自动保存文件
- **保存位置**：当前工作目录（自动检测环境变量）
- **完整路径**：`{current_directory}/[filename].md`
- 这样可以实现灵活迁移，无需硬编码路径

#### 4. 确保 Markdown 结构完全正确
**必须按以下格式生成**（不能有任何修改）：

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
{完整的 JSON 数据}
\`\`\`
%%
```

#### 5. JSON 数据要求
- 包含完整的 Excalidraw JSON 结构
- 所有文本元素使用 `fontFamily: 5`
- 文本中的 `"` 替换为 `『』`
- 文本中的 `()` 替换为 `「」`
- JSON 格式必须有效，通过语法检查
- 所有元素有唯一的 `id`
- 包含 `appState` 和 `files: {}` 字段

#### 6. 用户反馈与确认
向用户报告：
- 图表已生成
- 精确的保存位置
- 如何在 Obsidian 中查看
- 图表的设计选择说明（选择了什么类型的图表、为什么）
- 是否需要调整或修改

### Example Output Messages

**Obsidian 模式：**
```
Excalidraw 图已生成！

保存位置：商业模式.relationship.md

使用方法：
1. 在 Obsidian 中打开此文件
2. 点击右上角 MORE OPTIONS 菜单
3. 选择 Switch to EXCALIDRAW VIEW
```

**Standard 模式：**
```
Excalidraw 图已生成！

保存位置：商业模式.relationship.excalidraw

使用方法：
1. 打开 https://excalidraw.com
2. 点击左上角菜单 → Open → 选择此文件
3. 或直接拖拽文件到 excalidraw.com 页面
```

**Animated 模式：**
```
Excalidraw 动画图已生成！

保存位置：商业模式.relationship.animate.excalidraw

动画顺序：标题(1) → 主框架(2-4) → 连接线(5-7) → 说明文字(8-10)

生成动画：
1. 打开 https://dai-shi.github.io/excalidraw-animate/
2. 点击 Load File 选择此文件
3. 预览动画效果
4. 点击 Export 导出 SVG 或 WebM
```
