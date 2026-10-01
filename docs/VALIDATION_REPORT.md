# Rui 源码级迁移验证报告

验证日期：2026-08-11

## 基线

- 上游：`xiaozhuguang/ComfyUI-xiaozhuguang`
- 固定提交：`367b5610237890a10248e2cc3b8017a94aa439c9`
- 上游隔离实例：独立 base、user、input、output、temp、内存数据库和端口
- Rui 隔离实例：独立 base、user、input、output、temp、内存数据库和端口
- 两个实例使用同一套 ComfyUI core、前端包和便携 Python

## 自动检查

| 检查 | 结果 |
|---|---|
| Python 单元测试 | 6/6 通过 |
| Python 编译 | 通过 |
| JavaScript 语法 | 11/11 通过 |
| locale JSON | 全部可解析 |
| Rui 启动导入 | 通过，无插件导入异常 |
| 节点映射 | 所有目标 Rui 节点均出现在 `/object_info` |
| 加载器真实执行 | `/prompt` 成功，官方 `PreviewImage` 在 history 返回当前图片 |
| 图像对比真实执行 | `/prompt` 成功，history 同时返回 `a_images` 与 `b_images` |

## 前端对照

| 功能 | 结果 |
|---|---|
| 万能滑条 | 默认尺寸、数值、滑轨、手柄与上游基线一致 |
| 选择器 | 默认两项布局、选中态、输出口与上游基线一致 |
| 收藏 | `Q` 打开完整 Rui 收藏面板，分类、搜索、备注和设置区域正常 |
| 主题 | `C` 打开完整 Rui 主题面板，主题、菜单隐藏和快捷节点页正常 |
| 标题 | 自定义无标题栏绘制和“双击编辑”默认状态正常 |
| 图像加载器 | 完整列表 UI、四个输出、上传/input/output/删除/清空/模式控件正常 |
| 图像对比 | A/B 输入、选项栏和大幅对比区域正常 |
| 组开关选择 | 设置按钮与编号框不重叠；无组时显示 0 和空状态 |

## 可靠性回归

- 连续上传两个都叫 `same.png`、但内容和尺寸不同的文件。
- 第二次上传后，新图片立即成为当前预览，第一张仍保留在列表中。
- 后端缓存身份会随图片字节、遮罩数据和当前索引变化。
- 刷新整个 ComfyUI 页面后，加载器图片列表、预览、图像对比和组开关均恢复；
  组开关没有变成空白节点。
- 当前 ComfyUI 前端没有 `beforeQueuePrompt` 扩展钩子。Rui 只包装一次
  `app.graphToPrompt`，在生成提交图前等待本插件上传链完成。

## 运行日志

Rui 隔离实例没有新增的插件异常。日志中的 `ComfyApp graph accessed before
initialization`、legacy menu 和 MaskEditor deprecated 信息在上游隔离实例同样出现，
属于当前 ComfyUI 前端/核心信息，不是 Rui 迁移引入。

## 未保留内容

- 不保留本轮重构前的近似滑条、选择器、标题、收藏、主题、对比和加载器实现。
- 不保留旧近似节点的序列化兼容分支。
- 不安装上游整包，不迁移其模型、音频、视频、下载或联网功能。
