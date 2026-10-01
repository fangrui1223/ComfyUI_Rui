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

## 画布工具

- `Q` 打开 Rui 收藏：完整支持节点和节点组合收藏、分类、拼音搜索、排序、预览、
  使用统计和 JSON 导入导出。
- `C` 打开 Rui 主题：支持节点主题、预设、连线效果、画布壁纸和完整主题设置。
- `Rui Selector`、`Rui Universal Slider`、`Rui Title`：双击节点或使用节点右键菜单打开设置。
- `Rui Image Compare`：拖动分隔位置对比 A/B；批次图像使用滚轮切换 A，按住 Shift 使用
  滚轮切换 B。

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
