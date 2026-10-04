# ComfyUI Rui

Rui 是一组面向本地批处理、图像输入输出和工作流画布控制的 ComfyUI 节点。

## 分类

- `Rui/Image/Load`：上传图像、路径图像加载
- `Rui/Image/Save`：自定义路径保存
- `Rui/Image/Preview`：图像对比预览
- `Rui/Image/Transform`：图像等比缩放填充与裁边
- `Rui/Batch`：目录遍历、同步与统计
- `Rui/Flow`：轻量循环、组开关选择
- `Rui/Logic`：类型与逻辑转换
- `Rui/UI`：滑条、选择器、注释标题
- `Rui/Utilities`：声音等辅助节点

ComfyUI 使用中文界面时显示中文名称，使用英文界面时显示英文名称。语言文本位于
`locales/zh` 和 `locales/en`，节点执行代码不包含显示名称分支。

## 上传图像加载器

`RuiImageUploadLoader` 输出：

1. `image`
2. `mask`
3. `source_filename`：当前上传图片的原始文件名，包含后缀
4. `source_stem`：不包含后缀的文件名

节点使用图片内容、当前索引和遮罩数据共同生成缓存标识。同一路径或同名文件换成新内容后，
ComfyUI 会重新加载图片。上传尚未完成时立即运行工作流，Rui 会等待本次上传结束，避免执行
上一张图。遮罩编辑生成的新物理文件不会覆盖已记录的原始文件名。

## 图像尺寸填充与裁边

`Rui 调整图像尺寸填充` 将图像等比缩放并居中填充到对齐画布。`目标尺寸` 表示画布最长边，默认 2048，可自行设置；对齐倍数默认 32，设为 0 可关闭对齐。当前 ComfyUI 的 Qwen-Image 2.1 参考图路径按 32 像素倍数处理，FLUX.2 [klein] 的潜空间步长为 16 像素。

- `就近常用比例`（默认）：从 1:1、4:3、3:4、3:2、2:3、16:9、9:16 中选最接近原图的画布比例，完整放入原图后补边。
- `最小对齐填充`：最长边缩放到目标尺寸后，仅将宽高各自补到对齐倍数。4:1 长图、目标尺寸 1024 时，前者画布为 1024×576，后者为 1024×256。

节点输出图像、`IMAGE_INFO` 边距信息，以及实际画布宽高。`Rui 移除图像填充` 在编辑图像解码后按画布宽高分别换算并裁掉填充。两个节点的开关关闭时直接透传图像。

裁边直接使用图像张量，不再反复转换为 8 位图片；需要在缩放阶段保留浮点色阶时可选 `bicubic` 或 `area`。极端长图使用最小填充更省显存，但可能不如常用画幅适合模型编辑。

将填充图像送入编辑模型的参考图路径，模型输出图像送入裁边节点，并连接同一组 `IMAGE_INFO`。采样画布应与填充图像尺寸一致：Qwen-Image 2.1 将文本编码节点的 `resolution` 设为 0，连接 VAE，并把第三个输出 `latent` 接到 KSampler 的 `latent_image`。这个输出是与第一张参考图同尺寸的空采样 latent；参考图经 VAE 编码的 latent 在正、负 conditioning 中。FLUX.2 [klein] 将本节点的画布宽高连接到 `Empty Flux 2 Latent` 的宽高输入。若模型或工作流在中途重排、裁切或改变输出构图，最终裁边无法保证与原图像素对齐。

参考：[Qwen-Image 2.1 官方说明](https://github.com/QwenLM/Qwen-Image-2.1#supported-aspect-ratios)、[ComfyUI 的 Qwen-Image 2.1 节点](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_qwen.py)、[FLUX.2 官方推理实现](https://github.com/black-forest-labs/flux2/blob/main/src/flux2/sampling.py)、[原节点](https://github.com/xingyuezhiyuan/Comfyui-txtnode/tree/xingyue)。

## 遮罩正方形裁切与贴回

`Rui 遮罩正方形裁切` 在原图像素中围绕所有遮罩区域取一个正方形，裁切阶段不缩放图像。
裁切边长默认 1024，上下文边距默认 128；遮罩扩展默认 0，可设 0～256 像素，适合服装轮廓变化或物体增删。
实际边长会扩大到能容纳扩展后的遮罩和上下文，再向上对齐到 32 的倍数。窗口优先向原图内移动，
不足部分延伸边缘像素补足，补边遮罩为黑色。节点输出裁切图、裁切遮罩、专用裁切信息、实际边长和有效遮罩标志。

原图同时连接到 `Rui 遮罩贴回`，生成图与同一组裁切信息也连接到该节点。
生成图应保持正方形；放大后的图像自动缩回原图取景尺寸，补边部分舍弃，输出保持原图宽高。
外扩柔化默认 32，可设 0～256 原图像素，调整它无需重新生成。
白色遮罩内完整使用生成图，灰度遮罩保留合成强度；柔化从边界向外延伸，柔化带以外逐像素保留原图。
若柔化宽度超出裁切窗口在原图内部预留的空间，节点提示增大上下文边距后重新裁切。RGBA 原图保留原有透明度。

Qwen-Image 2.1 将裁切图接入第一张参考图，设 `resolution=0`，编码节点的第三个 latent 输出接到采样器。
FLUX.2 [klein] 将实际裁切边长连接到 `Empty Flux 2 Latent` 的宽、高。
批量图像建议沿用逐图循环，每张图使用自己的遮罩和裁切信息。
原生 IMAGE 批次支持逐项配对，以及一张图配多个遮罩或一个遮罩配多张图；批次裁切采用共同的最大边长。
一组裁切信息也可贴回同一区域生成的多张候选图。不同裁切区域必须有对应数量的生成结果；
Qwen 编码节点只使用每个参考输入的第一张图，因此多张原图需逐图送入模型。
空遮罩贴回原图；有效遮罩标志可用于工作流跳过生成，节点本身不会取消上游采样。

仅裁切和缩放无法修正模型自身的位移或形变。结构修改的遮罩应包含旧物体及预期新轮廓。
细长的大遮罩扩成正方形后可能增加显存，运行前可检查实际裁切边长。

## 画布工具

- `Q` 打开 Rui 收藏：完整支持节点和节点组合收藏、分类、拼音搜索、排序、预览、
  使用统计和 JSON 导入导出。
- `C` 打开 Rui 主题：支持节点主题、预设、连线效果、画布壁纸和完整主题设置。
- `Rui Selector`、`Rui Universal Slider`、`Rui Title`：双击节点或使用节点右键菜单打开设置。
- `Rui Image Compare`：拖动分隔位置对比 A/B；批次图像使用滚轮切换 A，按住 Shift 使用
  滚轮切换 B。

主题随工作流保存，切换工作流或重新打开后恢复。组合收藏保留节点参数、标题、主题和内部连线；旧收藏中已经丢失的数据需要重新收藏。

收藏面板的 `↕` 按钮启用手动排序，按住 Shift 拖动收藏项调整顺序。节点与组合分别排序，使用频率和最近使用排序仍可选。刷新组合缩略图前，请选中对应节点并让它们完整显示在画布中。

## 安装后刷新

Python 节点只会在 ComfyUI 启动时注册。更新本插件后需要重启 ComfyUI，并对浏览器执行
强制刷新，才能加载新的节点定义和前端脚本。

## 验证

```powershell
C:\FR_comfyui_next\ComfyUI\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

源码级迁移边界与验收项见 `docs/SOURCE_EQUIVALENCE_BLUEPRINT.md` 和
`docs/SOURCE_EQUIVALENCE_ACCEPTANCE_MATRIX.md`。参考项目和 MIT 许可见
`THIRD_PARTY_NOTICES.md` 与 `licenses/ComfyUI-xiaozhuguang-MIT.txt`。
