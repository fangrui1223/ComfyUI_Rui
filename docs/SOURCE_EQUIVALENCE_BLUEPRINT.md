# Rui 源码级等价迁移蓝图

## 1. 目标与基准

本轮重构以上游 `xiaozhuguang/ComfyUI-xiaozhuguang` 的实际运行效果为基准，
迁移以下功能到 `ComfyUI_Rui`：

- 万能滑条
- 选择器
- 节点收藏
- 注释与标题
- 图像对比
- 主题
- 图像加载器及遮罩工作流

固定上游版本：

- 仓库：`https://github.com/xiaozhuguang/ComfyUI-xiaozhuguang`
- 提交：`367b5610237890a10248e2cc3b8017a94aa439c9`
- 许可证：MIT

本文件取代 `IMPLEMENTATION_BLUEPRINT.md` 中“只提取部分行为并重新实现”的路线。
旧的近似节点可以被直接替换，不要求兼容它们已经生成的工作流序列化数据。

## 2. 等价迁移原则

### 2.1 运行效果优先

迁移以隔离环境中的上游实际行为为判定依据，包括：

- 节点输入、输出、隐藏控件和执行结果
- 节点尺寸、画布绘制、弹窗、菜单与鼠标交互
- 工作流保存、重新打开和切换后的状态恢复
- 本地存储、IndexedDB、导入导出和面板位置
- 前端与后端接口的请求和返回格式

截图只用于定位功能，不作为完整规格。源码和隔离运行结果优先于截图推断。

### 2.2 保留完整功能簇

上游功能存在耦合时，迁移完整依赖簇，不把大型功能重新写成简化版：

- 收藏与标题共同迁移 `node_favorites.js` 中的标题创建、绘制和编辑逻辑。
- 主题共同迁移主题管理器、设置面板、预设和样式。
- 图像加载器共同迁移前端列表、上传、遮罩数据和后端本地接口。

### 2.3 只允许三类改动

1. **Rui 命名空间适配**：节点 ID、扩展名、DOM/CSS 前缀、存储键、
   IndexedDB 名称、后端路由和全局对象改为 Rui 专属名称。
2. **当前 ComfyUI 兼容适配**：只处理已实际验证的 API 差异，并在代码旁保留
   简短说明。
3. **已确认的 Rui 差异**：仅限第 6 节列出的功能。

除这三类外，不主动重排上游交互、删除设置项或用新的简化实现替换原逻辑。

## 3. 源码映射

| Rui 功能 | 上游后端来源 | 上游前端来源 | 迁移方式 |
|---|---|---|---|
| 万能滑条 | 根 `__init__.py` 中 `XiaozhuguangUniversalSlider` | `web/xzg_universal_slider.js` | 保留完整设置和画布交互，改 Rui ID |
| 选择器 | 根 `__init__.py` 中 `XiaozhuguangSelector` | `web/xzg_selector.js`，以及收藏脚本中的选择器设置逻辑 | 按真实依赖合并迁移 |
| 节点收藏 | 无独立后端 | `web/node_favorites.js`、`node_favorites.css`、`pinyin-pro.esm.js` | 迁移完整收藏系统 |
| 注释与标题 | 根 `__init__.py` 中 `XiaozhuguangTitle` | `web/node_favorites.js` 内标题逻辑 | 与收藏作为同一功能簇迁移 |
| 图像对比 | `nodes/xzg_image_compare.py` | `web/xzg_image_compare.js` | 保留 A/B、批次和显示选项 |
| 主题 | 无独立后端 | `xzg_theme.js`、`xzg_theme_panel.js`、`xzg_theme_presets.js`、`xzg_theme.css` | 迁移完整主题模块 |
| 图像加载器 | `nodes/xzg_image_loader.py` | `web/xzg_image_loader.js` | 保留完整加载和遮罩能力，叠加 Rui 文件名与缓存修复 |
| i18n | Python 节点定义 | `web/xzg_i18n.js` | 接入 Rui 官方 locale 与前端运行时文案 |

上游依赖文件随迁移保留 MIT 许可证和第三方声明。不会安装上游整包，也不会引入
它的模型、音视频或联网功能。

## 4. 目标结构

```text
ComfyUI_Rui/
|-- __init__.py
|-- rui_nodes/
|   |-- operations.py
|   |-- ui.py
|   |-- image_loader.py
|   `-- image_compare.py
|-- web/
|   |-- js/
|   |   |-- rui_i18n.js
|   |   |-- rui_universal_slider.js
|   |   |-- rui_selector.js
|   |   |-- rui_canvas_tools.js
|   |   |-- rui_image_compare.js
|   |   |-- rui_image_loader.js
|   |   |-- rui_theme.js
|   |   |-- rui_theme_panel.js
|   |   |-- rui_theme_presets.js
|   |   |-- rui_group_switch_index.js
|   |   `-- vendor/pinyin-pro.esm.js
|   `-- css/
|       |-- rui_canvas_tools.css
|       `-- rui_theme.css
|-- locales/en/
|-- locales/zh/
|-- docs/
|-- licenses/
`-- tests/
```

`rui_canvas_tools.js` 对应上游收藏与标题的完整功能簇。文件名可以在实施时依据
上游模块边界微调，但不能把同一套逻辑保留成两份并行实现。

## 5. 命名空间与隔离规则

| 对象 | Rui 规则 |
|---|---|
| 节点 ID | `RuiUniversalSlider`、`RuiSelector`、`RuiTitle`、`RuiImageCompare`、`RuiImageUploadLoader` |
| 扩展名 | `Rui.SourceEquivalent.<feature>` |
| 分类 | `Rui/UI`、`Rui/Image/Load`、`Rui/Image/Preview`、`Rui/Logic` |
| 后端路由 | `/rui/image-loader/...` |
| localStorage | `Rui.<Feature>.v2` |
| IndexedDB | `RuiFavoritesV2`、`RuiImageLoaderV2` 等明确所有者名称 |
| DOM/CSS | `.rui-*`，禁止继续使用全局 `.xzg-*` 选择器 |
| 全局对象 | `window.RuiThemeManager` 等 Rui 专属名称 |

所有一次性补丁必须具备安装标记或恢复路径。切换工作流不能重复安装监听器、
重复添加控件或重复包裹 LiteGraph 方法。

## 6. Rui 特有差异

### 6.1 图像加载器

在上游完整加载器基础上增加：

- 输出当前图片原始文件名（含扩展名）。
- 输出当前图片原始文件名主体（不含扩展名）。
- 上传、替换、列表切换、遮罩保存后，名称与当前选中图片保持一致。
- 缓存身份包含实际图像内容和当前遮罩内容，不能只依赖文件名或修改时间。
- 同名文件被新内容替换时必须重新执行。
- 排队前等待当前 Rui 上传完成，避免丢入新图后仍提交上一张图。
- 工作流切换和重新打开时清除仅属于前一工作流的临时预览状态。

输出契约最终为：`IMAGE`、`MASK`、`STRING source_filename`、
`STRING source_stem`。批量模式下，图像输出遵循上游列表契约；文件名输出与当前
执行选择保持一一对应，具体标量/列表形态在隔离基线记录后锁定并写入测试。

### 6.2 整数转布尔

保留 Rui 自有节点 `RuiIntToBoolean`：

- `0` 转为 `False`，非零转为 `True`。
- `invert` 开启后反转结果。

### 6.3 组开关选择

保留 `RuiGroupSwitchIndex` 和现有 Rui 组控制功能：

- 节点显示名为“Rui 忽略组的选择”。
- “始终开启一个”时稳定输出当前可见行的 1-based 编号。
- 不使用 BYPASS 代替停用；组状态遵循已核对的 ComfyUI 官方机制。
- 迁移主题和全局画布补丁后，工作流切换、设置按钮和编号框布局仍正常。

### 6.4 品牌与语言

- 用户可见名称使用 Rui 品牌。
- Python 中使用稳定英文节点 ID 和分类。
- 节点定义通过 ComfyUI 官方 `locales/<locale>/nodeDefs.json` 翻译。
- 自定义弹窗和画布文案通过 Rui 前端 i18n 自动随 ComfyUI 语言切换。

## 7. 实施阶段

### 阶段 A：固定基线

1. 校验隔离克隆提交和工作区洁净状态。
2. 创建独立 ComfyUI 用户目录、端口和仅含上游插件的 custom_nodes 环境。
3. 记录目标节点映射、输入输出定义、默认尺寸、默认设置和工作流 JSON。
4. 对每项交互保存截图或结构化状态记录。

### 阶段 B：后端契约替换

1. 用上游真实定义替换 Rui 万能滑条、选择器、标题和图像对比后端。
2. 迁移完整图像加载器后端及其本地接口，所有路径重新使用 Rui 路由。
3. 添加原文件名、内容哈希和遮罩哈希差异。
4. 保留 `RuiIntToBoolean` 和 `RuiGroupSwitchIndex`。
5. 更新映射、分类和官方 locale。

### 阶段 C：前端等价迁移

1. 先迁移万能滑条与选择器，逐项对照设置和序列化。
2. 迁移收藏与标题完整功能簇及拼音依赖。
3. 迁移图像对比和图像加载器完整前端。
4. 迁移主题管理器、面板、预设和 CSS。
5. 系统性改 Rui 命名空间，禁止保留会与上游冲突的全局标识。

### 阶段 D：Rui 差异与可靠性

1. 接入原文件名捕获和输出。
2. 接入上传完成屏障、内容/遮罩缓存身份和工作流切换清理。
3. 验证组开关与主题、收藏、标题的 LiteGraph 补丁共存。
4. 删除被替换的近似脚本、旧样式和死分支。

### 阶段 E：验证与收尾

1. Python 编译、导入、节点契约和后端单元测试。
2. 每个 JavaScript 文件执行语法检查。
3. locale JSON 解析和中英文切换检查。
4. 在隔离上游和 Rui 环境逐项执行验收矩阵。
5. 记录所有允许差异；未记录差异视为缺陷。
6. 确认活动 `custom_nodes` 中没有上游安装残留或重复节点。

## 8. 变更控制

- 每迁移一个功能簇，先通过该功能的后端和序列化测试，再进入下一个功能簇。
- 大型上游脚本的机械改名与行为修改分开检查。
- 不修改 ComfyUI core，不安装上游完整依赖，不引入联网、遥测或更新检查。
- 不为了旧近似节点的序列化兼容保留双实现、别名或迁移分支。
- 上游代码中与目标功能无关的模型、音频、视频和下载逻辑不迁移。

## 9. 完成定义

只有在 `SOURCE_EQUIVALENCE_ACCEPTANCE_MATRIX.md` 的必测项全部通过、所有 Rui 差异
均有自动化或手动证据、且旧近似实现被删除后，源码级等价迁移才算完成。
