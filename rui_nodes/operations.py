import heapq
import os
import re
import shutil
import torch
import numpy as np
import random
import winsound
from PIL import Image, ImageOps, ImageSequence
import folder_paths

try:
    from comfy_execution.graph_utils import GraphBuilder, is_link
except Exception:
    GraphBuilder = None

    def is_link(obj):
        return isinstance(obj, list) and len(obj) == 2 and isinstance(obj[0], str)

# 定义一个特殊的类型，用于在 ComfyUI 中接收任意类型的连接线输入
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
ANY_TYPE = AnyType("*")

def _as_bool(value):
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "no", "off", "")
    return bool(value)

def _safe_history_part(value):
    text = str(value or "").strip()
    if not text:
        return ""

    text = text.replace("\\", os.sep).replace("/", os.sep)
    parts = []
    for part in text.split(os.sep):
        part = part.strip().strip(".")
        if not part:
            continue
        part = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", part)
        parts.append(part)

    return os.path.join(*parts) if parts else ""

def _get_output_image_info(file_path):
    output_dir = os.path.abspath(folder_paths.get_output_directory())
    abs_path = os.path.abspath(file_path)

    try:
        common_path = os.path.commonpath((os.path.normcase(output_dir), os.path.normcase(abs_path)))
    except ValueError:
        return None

    if common_path != os.path.normcase(output_dir):
        return None

    rel_path = os.path.relpath(abs_path, output_dir)
    subfolder = os.path.dirname(rel_path)
    if subfolder == ".":
        subfolder = ""

    return {
        "filename": os.path.basename(abs_path),
        "subfolder": subfolder.replace(os.sep, "/"),
        "type": "output",
    }

def _unique_file_path(target_dir, filename):
    base_name, extension = os.path.splitext(filename)
    candidate = os.path.join(target_dir, filename)
    counter = 1

    while os.path.exists(candidate):
        candidate = os.path.join(target_dir, f"{base_name}_{counter:03d}{extension}")
        counter += 1

    return candidate

def _directory_stamp(path):
    if not os.path.exists(path):
        return 0
    mtime = os.stat(path).st_mtime_ns
    if not os.path.isdir(path):
        return mtime
    with os.scandir(path) as entries:
        subfolders = tuple(sorted((entry.name, entry.stat().st_mtime_ns) for entry in entries if entry.is_dir()))
    return (mtime, subfolders)

def _report_output_image(file_path, history_subfolder, copy_to_comfy_output=True, log_prefix="[RuiSaver]"):
    output_info = _get_output_image_info(file_path)
    if output_info is not None:
        return output_info

    if not _as_bool(copy_to_comfy_output):
        print(
            f"{log_prefix} 图片已保存到自定义目录，但不在 ComfyUI output 内；"
            "copy_to_comfy_output=False 时不会写入 /history 标准图片列表。"
        )
        return None

    clean_subfolder = _safe_history_part(history_subfolder)
    output_dir = folder_paths.get_output_directory()
    target_dir = os.path.join(output_dir, clean_subfolder) if clean_subfolder else output_dir
    os.makedirs(target_dir, exist_ok=True)

    target_path = _unique_file_path(target_dir, os.path.basename(file_path))
    shutil.copy2(file_path, target_path)
    print(f"{log_prefix} 已复制一份到 ComfyUI output 供 /history 使用: {target_path}")
    return _get_output_image_info(target_path)

class RuiDirectorySync:
    """
    Rui 文件夹同步节点
    用于同步遍历两个存在映射关系的文件夹，并按照“动态尾图匹配”规则输出图片路径。
    """
    
    def __init__(self):
        pass

    def natural_sort_key(self, s):
        """
        实现 Windows 风格的自然排序逻辑 (1, 2, 10 而不是 1, 10, 2)
        """
        # 将字符串中的数字部分转换为整数进行比较
        return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]
    
    @classmethod
    def INPUT_TYPES(s):
        """
        定义节点的输入参数
        """
        return {
            "required": {
                # 大A区的绝对路径
                "dir_A": ("STRING", {"default": ""}),
                # 大B区的绝对路径
                "dir_B": ("STRING", {"default": ""}),
                # 全局索引，用于从生成的队列中提取对应的图片对
                "global_index": ("INT", {
                    "default": 0, 
                    "min": 0, 
                    "max": 1000000, 
                    "step": 1,
                    "display": "number",
                    "display_name": "Current index"
                }),
            },
        }

    # 输出两个路径字符串
    RETURN_TYPES = ("STRING", "STRING")
    # 输出端口的显示名称
    RETURN_NAMES = ("area_a_image_path", "area_b_image_path")

    FUNCTION = "sync_and_match"

    # 在 ComfyUI 菜单中的分类
    CATEGORY = "Rui/Batch"

    @classmethod
    def IS_CHANGED(s, dir_A, dir_B, global_index):
        """
        强制 ComfyUI 在文件夹内容变化时重新运行节点。
        """
        # 获取 A 区和 B 区文件夹的最后修改时间
        mtime_A = _directory_stamp(dir_A)
        mtime_B = _directory_stamp(dir_B)
        
        # 将路径、索引和修改时间合并成一个值返回
        # 只要这个返回值变了，ComfyUI 就会认为节点需要重新计算
        return f"{dir_A}_{mtime_A}_{dir_B}_{mtime_B}_{global_index}"

    def sync_and_match(self, dir_A, dir_B, global_index):
        # 1. 检查路径是否存在
        if not os.path.exists(dir_A) or not os.path.exists(dir_B):
            return ("路径不存在", "路径不存在")

        # 2. 获取 A 区和 B 区的所有子文件夹，并进行自然排序
        subs_A = sorted([d for d in os.listdir(dir_A) if os.path.isdir(os.path.join(dir_A, d))], key=self.natural_sort_key)
        subs_B = sorted([d for d in os.listdir(dir_B) if os.path.isdir(os.path.join(dir_B, d))], key=self.natural_sort_key)

        # 确保两个区的子文件夹能够一一对应，取最小数量以防越界
        num_subs = min(len(subs_A), len(subs_B))
        
        # 定义支持的图片扩展名
        valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff')

        target_index = max(0, global_index)
        pair_count = 0
        last_pair = None

        # 3. 遍历每一对子文件夹
        for i in range(num_subs):
            sub_path_A = os.path.join(dir_A, subs_A[i])
            sub_path_B = os.path.join(dir_B, subs_B[i])

            # 获取 A 子文件夹内所有图片，并进行自然排序
            imgs_A = sorted([f for f in os.listdir(sub_path_A) if f.lower().endswith(valid_extensions)], key=self.natural_sort_key)
            # B 区只用自然排序后的前两张图片
            imgs_B = heapq.nsmallest(2, (f for f in os.listdir(sub_path_B) if f.lower().endswith(valid_extensions)), key=self.natural_sort_key)

            # 如果 A 文件夹没有图片，或者 B 文件夹图片少于 2 张，则跳过这个文件夹对
            if not imgs_A or len(imgs_B) < 2:
                continue

            N = len(imgs_A)
            
            # 核心匹配逻辑：
            # A 区的前 N-1 张图（索引 0 到 N-2），统一配对 B 区的第 0 张图
            # A 区的最后 1 张图（索引 N-1），专门配对 B 区的第 1 张图
            if target_index < pair_count + N:
                idx_A = target_index - pair_count
                path_B = imgs_B[0] if idx_A < N - 1 else imgs_B[1]
                return (os.path.join(sub_path_A, imgs_A[idx_A]), os.path.join(sub_path_B, path_B))

            pair_count += N
            last_pair = (os.path.join(sub_path_A, imgs_A[-1]), os.path.join(sub_path_B, imgs_B[1]))

        # 4. 如果没找到任何有效的配对
        if last_pair is None:
            return ("未匹配到任何图片", "未匹配到任何图片")
        return last_pair

class RuiImageLoader:
    """
    Rui 图像加载节点
    专门配套同步遍历节点，根据提供的路径加载图像并转换为 ComfyUI 可用的张量格式。
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
            },
            "optional": {
                # 使用字符串输入代替下拉列表，并开启上传功能。这样 ComfyUI 不会进行列表校验，解决 undefined 报错。
                "image": ("STRING", {"image_upload": True, "default": ""}),
                # 保留 image_path 字符串输入，用于接收同步遍历节点的路径
                "image_path": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("image", "mask", "filename")
    FUNCTION = "load_image"
    CATEGORY = "Rui/Image/Load"
    
    # 告诉 ComfyUI 这个节点可以有输出界面（即预览）
    OUTPUT_NODE = True

    def load_image(self, image="", image_path=None):
        # 1. 确定最终使用的文件路径
        # 如果 image_path 被连接且有值，优先使用它（全自动流程）
        # 否则使用拖拽上传产生的路径（手动流程）
        actual_path = None
        
        if image_path and os.path.exists(image_path) and not os.path.isdir(image_path):
            actual_path = image_path
        elif image and image != "undefined":
            # 如果 image 是上传产生的相对路径或绝对路径
            if os.path.isabs(image) and os.path.exists(image):
                actual_path = image
            else:
                # 尝试从 ComfyUI 的 input 目录获取
                potential_path = folder_paths.get_annotated_filepath(image)
                if potential_path and os.path.exists(potential_path):
                    actual_path = potential_path

        # 检查路径是否存在
        if not actual_path or not os.path.exists(actual_path):
            empty_image = torch.zeros((1, 512, 512, 3))
            empty_mask = torch.zeros((1, 512, 512))
            return (empty_image, empty_mask, "未选择文件")

        # 2. 提取不带后缀的文件名
        display_name = os.path.splitext(os.path.basename(actual_path))[0]

        # 3. 使用 PIL 加载图片
        img = Image.open(actual_path)
        img = ImageOps.exif_transpose(img)
        
        if img.mode == 'I':
            img = img.point(lambda i: i * (1./256)).convert('L')

        image_pil = img.convert("RGB")
        
        # --- 预览逻辑 ---
        temp_dir = folder_paths.get_temp_directory()
        filename_preview = f"rui_preview_{random.randint(0, 1000000)}.png"
        image_pil.save(os.path.join(temp_dir, filename_preview), compress_level=4)
        preview_ui = {"images": [{"filename": filename_preview, "type": "temp"}]}

        # 4. 转换为 ComfyUI 标准 Tensor 格式
        image_np = np.array(image_pil).astype(np.float32) / 255.0
        final_image_tensor = torch.from_numpy(image_np)[None,]

        # 5. 处理 Mask (Alpha 通道)
        if 'A' in img.getbands():
            mask = np.array(img.getchannel('A')).astype(np.float32) / 255.0
            final_mask_tensor = 1. - torch.from_numpy(mask)
        else:
            final_mask_tensor = torch.zeros((64, 64), dtype=torch.float32)

        return {
            "ui": preview_ui,
            "result": (final_image_tensor, final_mask_tensor, display_name)
        }

class RuiImageSaver:
    """
    Rui 图像保存节点
    专门配套同步遍历节点，将处理后的图片保存到指定的 C 区，并保持与 A 区相同的子文件夹结构。
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 要保存的图像 Tensor
                "images": ("IMAGE",),
                # 处理前原图片 A 的绝对路径，用于提取子文件夹名和文件名
                "image_path_A": ("STRING", {"forceInput": True}),
                # 目标保存的“大C区”绝对路径
                "dir_C": ("STRING", {"default": ""}),
                # 保存格式选择
                "save_format": (["jpg", "png"], {"default": "jpg"}),
                # 质量设置（仅对 jpg 有效）
                "quality": ("INT", {"default": 95, "min": 1, "max": 100, "step": 1}),
            },
            "optional": {
                "copy_to_comfy_output": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "Rui/Image/Save"

    def save_images(self, images, image_path_A, dir_C, save_format="jpg", quality=95, copy_to_comfy_output=True):
        if save_format not in ("jpg", "png"):
            raise ValueError(f"不支持的保存格式: {save_format}")
        # 1. 基础校验
        if not image_path_A or not os.path.exists(image_path_A):
            print(f"[RuiSaver] 错误：无效的原图片路径 {image_path_A}")
            return {"ui": {"images": []}}
        
        if not dir_C:
            print("[RuiSaver] 错误：未指定目标保存路径 dir_C")
            return {"ui": {"images": []}}

        # 2. 路径解析
        # 提取原小文件夹名称
        subfolder_name = os.path.basename(os.path.dirname(image_path_A))
        # 提取原文件名
        full_file_name = os.path.basename(image_path_A)
        file_base_name, _ = os.path.splitext(full_file_name)
        
        # 确定新后缀
        new_ext = f".{save_format}"

        # 3. 确定目标文件夹并创建
        target_dir = os.path.join(dir_C, subfolder_name)
        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)

        results = []

        # 4. 遍历保存图片（处理 Batch）
        for i, image in enumerate(images):
            # 处理文件名：如果是 batch，增加 _batch_01 后缀
            current_base_name = file_base_name
            if len(images) > 1:
                current_base_name = f"{file_base_name}_batch_{i+1:02d}"

            # 最终保存路径（处理同名冲突）
            save_filename = f"{current_base_name}{new_ext}"
            save_path = os.path.join(target_dir, save_filename)
            
            # 如果文件已存在，自动增加 (1), (2) 等后缀
            counter = 1
            while os.path.exists(save_path):
                save_filename = f"{current_base_name} ({counter}){new_ext}"
                save_path = os.path.join(target_dir, save_filename)
                counter += 1

            # 5. Tensor 转 PIL Image
            # ComfyUI 的 IMAGE 一般是 HWC 格式，这里先还原成 0-255 的 uint8 图像。
            img_np = 255. * image.cpu().numpy()
            np.clip(img_np, 0, 255, out=img_np)
            img_np = img_np.astype(np.uint8)
            pil_img = Image.fromarray(img_np)

            # 6. 执行保存
            if save_format == "jpg":
                # JPG 格式不支持透明通道。
                # 如果当前图片是 RGBA，这里先把透明区域铺到白底上，再转成 RGB 保存，
                # 这样就不会再出现 “cannot write mode RGBA as JPEG” 的报错。
                if pil_img.mode == "RGBA":
                    white_background = Image.new("RGB", pil_img.size, (255, 255, 255))
                    white_background.paste(pil_img, mask=pil_img.getchannel("A"))
                    pil_img = white_background
                elif pil_img.mode != "RGB":
                    # 其他不兼容 JPEG 的模式，也统一转成 RGB，避免再次报错。
                    pil_img = pil_img.convert("RGB")

                # JPG 保存：指定质量，不包含元数据
                pil_img.save(save_path, format="JPEG", quality=quality, subsampling=0)
            else:
                # PNG 保存：无损，不包含元数据
                pil_img.save(save_path, format="PNG", optimize=True)
                
            print(f"[RuiSaver] 已保存图片至: {save_path}")

            output_info = _report_output_image(
                save_path,
                os.path.join("RuiHistory", "RuiImageSaver", subfolder_name),
                copy_to_comfy_output,
                "[RuiSaver]",
            )
            if output_info is not None:
                results.append(output_info)

        return {"ui": {"images": results}}

class RuiDirectorySkip:
    """
    Rui 文件夹遍历 (带忽略规则)
    用于遍历文件夹，并按照“忽略每个子文件夹最后 N 张图”的规则输出路径。
    """
    def __init__(self):
        pass

    def natural_sort_key(self, s):
        return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 遍历文件夹的绝对路径
                "dir_ZD": ("STRING", {"default": ""}),
                # 全局索引
                "global_index": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                # 忽略每个文件夹末尾的图片张数
                "skip_last_n": ("INT", {"default": 1, "min": 0, "max": 100, "step": 1}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("image_path",)
    FUNCTION = "get_path"
    CATEGORY = "Rui/Batch"

    @classmethod
    def IS_CHANGED(s, dir_ZD, global_index, skip_last_n):
        # 监控文件夹修改时间，实现强制刷新
        mtime = _directory_stamp(dir_ZD)
        return f"{dir_ZD}_{mtime}_{global_index}_{skip_last_n}"

    def get_path(self, dir_ZD, global_index, skip_last_n):
        if not os.path.exists(dir_ZD):
            return ("路径不存在",)

        # 1. 获取并自然排序子文件夹
        subs = sorted([d for d in os.listdir(dir_ZD) if os.path.isdir(os.path.join(dir_ZD, d))], key=self.natural_sort_key)
        
        # 如果根目录下没有子文件夹，则直接把根目录当作唯一的文件夹处理
        if not subs:
            folder_list = [dir_ZD]
        else:
            folder_list = [os.path.join(dir_ZD, d) for d in subs]

        valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff')
        target_index = max(0, global_index)
        path_count = 0
        last_path = None

        # 2. 遍历每个文件夹
        for folder in folder_list:
            imgs = sorted([f for f in os.listdir(folder) if f.lower().endswith(valid_extensions)], key=self.natural_sort_key)
            
            # 核心规则：忽略最后 N 张
            if len(imgs) > skip_last_n:
                remaining_count = min(len(imgs), len(imgs) - skip_last_n)
                if remaining_count == 0:
                    continue
                if target_index < path_count + remaining_count:
                    return (os.path.join(folder, imgs[target_index - path_count]),)
                path_count += remaining_count
                last_path = os.path.join(folder, imgs[remaining_count - 1])
            # 如果图片总数小于或等于要忽略的张数，则该文件夹被完全忽略

        if last_path is None:
            return ("未匹配到有效图片",)
        return (last_path,)

class RuiDirectoryTail:
    """
    Rui 文件夹尾图遍历节点
    用于遍历文件夹，并按照“读取每个子文件夹自然排序后最后 N 张图”的规则输出路径。
    例如某个子文件夹有 5 张图，tail_n=1 时只取第 5 张；tail_n=2 时取第 4、5 张。
    """
    def __init__(self):
        pass

    def natural_sort_key(self, s):
        """
        使用 Windows 风格的自然排序，避免出现 1、10、2 这种排序问题。
        """
        return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 遍历文件夹的绝对路径
                "dir_ZD": ("STRING", {"default": ""}),
                # 全局索引，用于从最终列表中取出对应图片
                "global_index": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                # 读取每个文件夹最后 N 张图片。
                # 默认是 1，表示每个文件夹只读取最后 1 张图。
                "tail_n": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("image_path",)
    FUNCTION = "get_path"
    CATEGORY = "Rui/Batch"

    @classmethod
    def IS_CHANGED(s, dir_ZD, global_index, tail_n):
        # 监控文件夹修改时间，实现强制刷新
        mtime = _directory_stamp(dir_ZD)
        return f"{dir_ZD}_{mtime}_{global_index}_{tail_n}"

    def get_path(self, dir_ZD, global_index, tail_n):
        if not os.path.exists(dir_ZD):
            return ("路径不存在",)

        # 1. 获取并自然排序子文件夹
        subs = sorted(
            [d for d in os.listdir(dir_ZD) if os.path.isdir(os.path.join(dir_ZD, d))],
            key=self.natural_sort_key
        )

        # 如果根目录下没有子文件夹，则直接把根目录当作唯一的文件夹处理
        if not subs:
            folder_list = [dir_ZD]
        else:
            folder_list = [os.path.join(dir_ZD, d) for d in subs]

        valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff')
        target_index = max(0, global_index)
        path_count = 0
        last_path = None

        # 2. 遍历每个文件夹，只保留自然排序后的最后 N 张图片
        for folder in folder_list:
            imgs = sorted(
                [f for f in os.listdir(folder) if f.lower().endswith(valid_extensions)],
                key=self.natural_sort_key
            )

            if not imgs:
                continue

            # 如果该文件夹图片数量少于 tail_n，就把该文件夹全部图片都保留下来。
            # 例如只有 1 张图，而 tail_n=2，那么就只输出这 1 张。
            selected_imgs = imgs[-tail_n:]

            if target_index < path_count + len(selected_imgs):
                return (os.path.join(folder, selected_imgs[target_index - path_count]),)
            path_count += len(selected_imgs)
            last_path = os.path.join(folder, selected_imgs[-1])

        if last_path is None:
            return ("未匹配到有效图片",)
        return (last_path,)

class RuiFlatImageReader:
    """
    Rui 当前目录图片遍历节点
    这个节点只会读取用户输入路径这一层里面的图片，不会进入子文件夹。
    适合处理“一个文件夹里直接放图片”的场景。
    """
    def __init__(self):
        pass

    def natural_sort_key(self, s):
        """
        使用 Windows 习惯的自然排序。
        例如 1, 2, 10 会排成 1, 2, 10，而不是 1, 10, 2。
        """
        return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 要读取图片的文件夹绝对路径
                "dir_ZD": ("STRING", {"default": ""}),
                # 外部传入的全局索引
                "global_index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 1000000,
                    "step": 1,
                    "display": "number",
                    "display_name": "Current index"
                }),
                # 图片格式筛选。
                # all 表示读取所有支持的图片格式。
                "image_format": (["all", "jpg", "jpeg", "png", "bmp", "webp", "tiff"], {"default": "all"}),
                # 忽略最后 N 张图片。
                # 默认是 0，表示不忽略任何图片。
                "skip_last_n": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 1000000,
                    "step": 1,
                    "display": "number",
                    "display_name": "Skip last images"
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("image_path",)
    FUNCTION = "get_image_path"
    CATEGORY = "Rui/Batch"

    @classmethod
    def IS_CHANGED(s, dir_ZD, global_index, image_format, skip_last_n):
        """
        让 ComfyUI 感知到文件夹变化。
        只要该路径下文件有增删改，修改时间变化后，节点就会重新执行。
        """
        mtime = os.path.getmtime(dir_ZD) if os.path.exists(dir_ZD) else 0
        return f"{dir_ZD}_{mtime}_{global_index}_{image_format}_{skip_last_n}"

    def get_valid_extensions(self, image_format):
        """
        根据用户选择的格式，返回当前要筛选的扩展名列表。
        """
        extension_map = {
            "jpg": (".jpg",),
            "jpeg": (".jpeg",),
            "png": (".png",),
            "bmp": (".bmp",),
            "webp": (".webp",),
            "tiff": (".tiff",),
            "all": (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"),
        }
        return extension_map.get(image_format, extension_map["all"])

    def get_image_path(self, dir_ZD, global_index, image_format, skip_last_n):
        # 1. 基础校验
        if not dir_ZD or not os.path.exists(dir_ZD):
            return ("路径不存在",)

        if not os.path.isdir(dir_ZD):
            return ("输入路径不是文件夹",)

        valid_extensions = self.get_valid_extensions(image_format)

        # 2. 只读取当前目录下的图片文件，不进入子文件夹
        image_files = []
        for file_name in os.listdir(dir_ZD):
            full_path = os.path.join(dir_ZD, file_name)
            if os.path.isfile(full_path) and file_name.lower().endswith(valid_extensions):
                image_files.append(file_name)

        # 3. 自然排序，保证符合 Windows 11 的命名习惯
        image_files = sorted(image_files, key=self.natural_sort_key)

        # 4. 按照规则忽略最后 N 张图片
        # 例如 skip_last_n=1 时，会丢掉排序后的最后 1 张图。
        # 如果 skip_last_n=0，就不会忽略任何图片。
        if skip_last_n > 0:
            if len(image_files) > skip_last_n:
                image_files = image_files[:-skip_last_n]
            else:
                image_files = []

        if not image_files:
            return ("未匹配到有效图片",)

        # 5. 按索引输出
        final_index = max(0, min(global_index, len(image_files) - 1))
        return (os.path.join(dir_ZD, image_files[final_index]),)

class RuiImageCount:
    """
    Rui 图片数量统计节点
    这个节点专门用于统计当前文件夹这一层里的图片数量，
    不会进入子文件夹，适合直接给循环次数、批处理次数之类的节点使用。
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 要统计图片数量的文件夹绝对路径
                "dir_ZD": ("STRING", {"default": ""}),
                # 图片格式筛选。
                # all 表示统计当前目录下所有支持的图片格式。
                "image_format": (["all", "jpg", "jpeg", "png", "bmp", "webp", "tiff"], {"default": "all"}),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("image_count",)
    FUNCTION = "get_image_count"
    CATEGORY = "Rui/Batch"

    @classmethod
    def IS_CHANGED(s, dir_ZD, image_format):
        """
        让 ComfyUI 感知到文件夹内容变化。
        只要目录里有文件新增、删除或修改，这里的返回值就会变化，
        节点就会自动重新计算图片总数。
        """
        mtime = os.path.getmtime(dir_ZD) if os.path.exists(dir_ZD) else 0
        return f"{dir_ZD}_{mtime}_{image_format}"

    def get_valid_extensions(self, image_format):
        """
        根据格式选项，返回要匹配的扩展名。
        这样可以和前面的图片遍历节点保持一致。
        """
        extension_map = {
            "jpg": (".jpg",),
            "jpeg": (".jpeg",),
            "png": (".png",),
            "bmp": (".bmp",),
            "webp": (".webp",),
            "tiff": (".tiff",),
            "all": (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"),
        }
        return extension_map.get(image_format, extension_map["all"])

    def get_image_count(self, dir_ZD, image_format):
        # 1. 基础校验
        if not dir_ZD or not os.path.exists(dir_ZD):
            return (0,)

        if not os.path.isdir(dir_ZD):
            return (0,)

        valid_extensions = self.get_valid_extensions(image_format)

        # 2. 只统计当前目录下的图片，不进入子文件夹
        image_count = 0
        for file_name in os.listdir(dir_ZD):
            full_path = os.path.join(dir_ZD, file_name)
            if os.path.isfile(full_path) and file_name.lower().endswith(valid_extensions):
                image_count += 1

        return (image_count,)

class RuiUniversalImageSaver:
    """
    Rui 通用图像保存节点
    这个节点不依赖前面的路径遍历节点，只要输入的是 ComfyUI 标准 IMAGE，
    就可以保存到任意位置，因此更适合和其他插件一起搭配使用。
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 要保存的图像 Tensor，支持 batch
                "images": ("IMAGE",),
                # 基础保存路径，例如 D:\\输出目录
                "save_dir": ("STRING", {"default": ""}),
                # 可选的新建子文件夹名称。
                # 如果这里留空，就直接保存到 save_dir。
                "folder_name": ("STRING", {"default": ""}),
                # 自定义保存名称，不需要手动带扩展名。
                # 例如填 portrait，最终会保存为 portrait.jpg / portrait.png
                "save_name": ("STRING", {"default": "image"}),
                # 保存格式选择
                "save_format": (["jpg", "png", "webp"], {"default": "jpg"}),
                # 质量参数：jpg / webp 会使用它，png 会尽量无损优化
                "quality": ("INT", {"default": 95, "min": 1, "max": 100, "step": 1}),
            },
            "optional": {
                "copy_to_comfy_output": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "Rui/Image/Save"

    def _build_target_dir(self, save_dir, folder_name):
        """
        生成最终保存目录。
        用户如果填写了 folder_name，就在 save_dir 下面自动新建这一层文件夹。
        """
        clean_save_dir = (save_dir or "").strip()
        clean_folder_name = (folder_name or "").strip()

        if not clean_save_dir:
            return ""

        if clean_folder_name:
            return os.path.join(clean_save_dir, clean_folder_name)

        return clean_save_dir

    def _get_unique_save_path(self, target_dir, base_name, extension):
        """
        如果同名文件已存在，就自动在后面补 _001、_002、_003……
        这样不会覆盖原图，也能保持文件名自然排序清晰。
        """
        save_filename = f"{base_name}{extension}"
        save_path = os.path.join(target_dir, save_filename)

        counter = 1
        while os.path.exists(save_path):
            save_filename = f"{base_name}_{counter:03d}{extension}"
            save_path = os.path.join(target_dir, save_filename)
            counter += 1

        return save_path

    def _tensor_to_pil(self, image_tensor):
        """
        把 ComfyUI 的 IMAGE Tensor 转成 PIL Image。
        这里兼容常见的 RGB / RGBA 图像，便于后续统一保存。
        """
        image_np = 255.0 * image_tensor.cpu().numpy()
        np.clip(image_np, 0, 255, out=image_np)
        image_np = image_np.astype(np.uint8)
        return Image.fromarray(image_np)

    def _prepare_for_jpg(self, pil_img):
        """
        JPEG 不支持透明通道。
        如果是 RGBA，就先铺白底再转 RGB，避免报错。
        """
        if pil_img.mode == "RGBA":
            white_background = Image.new("RGB", pil_img.size, (255, 255, 255))
            white_background.paste(pil_img, mask=pil_img.getchannel("A"))
            return white_background

        if pil_img.mode != "RGB":
            return pil_img.convert("RGB")

        return pil_img

    def save_images(self, images, save_dir, folder_name, save_name, save_format="jpg", quality=95, copy_to_comfy_output=True):
        # 1. 基础校验
        if images is None:
            print("[RuiUniversalSaver] 错误：未接收到图像输入 images")
            return {"ui": {"images": []}}

        if not save_dir or not str(save_dir).strip():
            print("[RuiUniversalSaver] 错误：未填写保存路径 save_dir")
            return {"ui": {"images": []}}

        target_dir = self._build_target_dir(save_dir, folder_name)
        if not target_dir:
            print("[RuiUniversalSaver] 错误：目标保存路径无效")
            return {"ui": {"images": []}}

        clean_base_name = (save_name or "").strip()
        if not clean_base_name:
            clean_base_name = "image"

        extension_map = {
            "jpg": ".jpg",
            "png": ".png",
            "webp": ".webp",
        }
        if save_format not in extension_map:
            raise ValueError(f"不支持的保存格式: {save_format}")
        extension = extension_map[save_format]
        os.makedirs(target_dir, exist_ok=True)

        results = []
        history_subfolder = os.path.join(
            "RuiHistory",
            "RuiUniversalImageSaver",
            _safe_history_part(folder_name),
        )

        # 2. 遍历保存 batch 图像
        for batch_index, image_tensor in enumerate(images):
            current_base_name = clean_base_name
            if len(images) > 1:
                current_base_name = f"{clean_base_name}_batch_{batch_index + 1:02d}"

            save_path = self._get_unique_save_path(target_dir, current_base_name, extension)
            pil_img = self._tensor_to_pil(image_tensor)

            # 3. 根据不同格式使用不同策略，尽量兼顾画质和体积
            if save_format == "jpg":
                pil_img = self._prepare_for_jpg(pil_img)
                pil_img.save(
                    save_path,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                    progressive=True,
                    subsampling=0,
                )
            elif save_format == "png":
                pil_img.save(
                    save_path,
                    format="PNG",
                    optimize=True,
                    compress_level=6,
                )
            else:
                # WebP 一般在体积和画质之间比较均衡，适合更通用的保存需求。
                if pil_img.mode not in ("RGB", "RGBA"):
                    pil_img = pil_img.convert("RGB")
                pil_img.save(
                    save_path,
                    format="WEBP",
                    quality=quality,
                    method=6,
                )

            print(f"[RuiUniversalSaver] 已保存图片至: {save_path}")

            output_info = _report_output_image(
                save_path,
                history_subfolder,
                copy_to_comfy_output,
                "[RuiUniversalSaver]",
            )
            if output_info is not None:
                results.append(output_info)

        return {"ui": {"images": results}}

class RuiPlaySound:
    """
    Rui 播放声音节点 (Sink Node)
    用于在批处理的最后阶段接收任意信号并播放声音。
    因为它配置了 OUTPUT_NODE = True，所以即使后面不接保存或预览节点，工作流也会强行跑完。
    这样可以省去渲染或保存图片的时间，加快批处理速度。
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # ANY_TYPE 允许这个端口连接任何类型的输出线（IMAGE, STRING, LATENT 等）
                "any_input": (ANY_TYPE,),
                # 播放模式控制
                "mode": (["always", "disabled"], {"default": "always"}),
                # 可选择 Windows 系统内置的提示音，无需额外下载音频文件
                "sound_type": (["SystemAsterisk", "SystemExclamation", "SystemHand", "SystemQuestion", "SystemDefault"], {"default": "SystemAsterisk"}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "play"
    CATEGORY = "Rui/Utilities"
    
    # 这一行极其关键：它告诉 ComfyUI 这是一个“输出节点”，工作流必须执行它
    OUTPUT_NODE = True

    def play(self, any_input, mode, sound_type):
        if mode == "always":
            try:
                # 使用 Windows 系统的 winsound 模块播放声音
                # SND_ASYNC 表示异步播放，不会卡住后续流程或界面
                winsound.PlaySound(sound_type, winsound.SND_ALIAS | winsound.SND_ASYNC)
                print(f"[RuiPlaySound] 已触发声音播放: {sound_type}")
            except Exception as e:
                print(f"[RuiPlaySound] 声音播放失败: {e}")
        
        # 返回空元组，不向后输出任何数据
        return ()

class RuiLightForStart:
    """
    轻量 For 循环开始节点。
    只输出循环控制、当前索引和总次数，不携带图片、latent 或视频帧状态。
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "total": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1, "display": "number"}),
                "start_index": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1, "display": "number"}),
            },
        }

    RETURN_TYPES = ("FLOW_CONTROL", "INT", "INT")
    RETURN_NAMES = ("flow_control", "current_index", "total")
    FUNCTION = "start_loop"
    CATEGORY = "Rui/Flow"

    def start_loop(self, total, start_index):
        return ("stub", int(start_index), max(1, int(total)))

class RuiLightForEnd:
    """
    轻量 For 循环结束节点。
    loop_done 只作为本轮执行完成的依赖，不作为循环状态传回下一轮。
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "index": ("INT", {"forceInput": True}),
                "total": ("INT", {"forceInput": True}),
                "loop_done": (ANY_TYPE,),
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("final_index", "total")
    FUNCTION = "end_loop"
    CATEGORY = "Rui/Flow"
    OUTPUT_NODE = True

    def _explore_dependencies(self, node_id, dynprompt, upstream):
        node_info = dynprompt.get_node(node_id)
        for value in node_info.get("inputs", {}).values():
            if not is_link(value):
                continue
            parent_id = value[0]
            if parent_id not in upstream:
                upstream[parent_id] = []
                self._explore_dependencies(parent_id, dynprompt, upstream)
            upstream[parent_id].append(node_id)

    def _collect_contained(self, node_id, upstream, contained):
        for child_id in upstream.get(node_id, []):
            if child_id in contained:
                continue
            contained[child_id] = True
            self._collect_contained(child_id, upstream, contained)

    def _is_output_node(self, class_type):
        try:
            from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS
            class_def = ALL_NODE_CLASS_MAPPINGS.get(class_type)
            return getattr(class_def, "OUTPUT_NODE", False) is True
        except Exception:
            return False

    def _include_output_nodes(self, dynprompt, contained, unique_id):
        added = True
        while added:
            added = False
            for node_id in dynprompt.all_node_ids():
                if node_id in contained:
                    continue
                node_info = dynprompt.get_node(node_id)
                if not self._is_output_node(node_info.get("class_type")):
                    continue
                for value in node_info.get("inputs", {}).values():
                    if is_link(value) and value[0] == unique_id:
                        continue
                    if is_link(value) and value[0] in contained:
                        contained[node_id] = True
                        added = True
                        break

    def _copied_node_id(self, node_id, unique_id):
        return "Recurse" if node_id == unique_id else node_id

    def _copy_loop_graph(self, dynprompt, contained, unique_id):
        graph = GraphBuilder()
        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            copy_id = self._copied_node_id(node_id, unique_id)
            node = graph.node(original_node["class_type"], copy_id)
            node.set_override_display_id(node_id)

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            copy_id = self._copied_node_id(node_id, unique_id)
            node = graph.lookup_node(copy_id)
            for input_name, value in original_node.get("inputs", {}).items():
                if is_link(value) and value[0] in contained:
                    parent_copy_id = self._copied_node_id(value[0], unique_id)
                    parent = graph.lookup_node(parent_copy_id)
                    if parent is None:
                        raise RuntimeError(
                            f"Rui 轻量 For 复制子图失败：节点 {node_id} 的输入 {input_name} "
                            f"连接到 {value[0]}:{value[1]}，但复制后的父节点 {parent_copy_id} 不存在。"
                        )
                    node.set_input(input_name, parent.out(value[1]))
                else:
                    node.set_input(input_name, value)

        return graph

    def end_loop(self, flow, index, total, loop_done=None, dynprompt=None, unique_id=None):
        current_index = int(index)
        total = max(1, int(total))
        next_index = current_index + 1

        if next_index >= total:
            return (current_index, total)

        if GraphBuilder is None:
            raise RuntimeError("当前 ComfyUI 环境不支持 GraphBuilder 动态子图，无法执行 Rui 轻量 For 循环。")
        if dynprompt is None or unique_id is None:
            raise RuntimeError("缺少 ComfyUI 动态执行上下文，无法执行 Rui 轻量 For 循环。")

        upstream = {}
        self._explore_dependencies(unique_id, dynprompt, upstream)

        start_node_id = flow[0]
        contained = {}
        self._collect_contained(start_node_id, upstream, contained)
        contained[start_node_id] = True
        contained[unique_id] = True
        self._include_output_nodes(dynprompt, contained, unique_id)

        graph = self._copy_loop_graph(dynprompt, contained, unique_id)
        new_start = graph.lookup_node(start_node_id)
        new_start.set_input("start_index", next_index)
        new_start.set_input("total", total)

        new_end = graph.lookup_node("Recurse")
        return {
            "result": (new_end.out(0), new_end.out(1)),
            "expand": graph.finalize(),
        }

# 导出节点类
class RuiGroupSwitchIndex:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "selected_index_value": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("selected_index",)
    FUNCTION = "get_selected_index"
    CATEGORY = "Rui/Flow"

    @staticmethod
    def _workflow_node(extra_pnginfo, unique_id):
        workflow = (extra_pnginfo or {}).get("workflow") if isinstance(extra_pnginfo, dict) else None
        nodes = workflow.get("nodes") if isinstance(workflow, dict) else None
        if not isinstance(nodes, list):
            return {}

        wanted = str(unique_id)
        for node in nodes:
            if str(node.get("id")) == wanted:
                return node
        return {}

    @staticmethod
    def _workflow_groups(extra_pnginfo):
        workflow = (extra_pnginfo or {}).get("workflow") if isinstance(extra_pnginfo, dict) else None
        groups = workflow.get("groups") if isinstance(workflow, dict) else None
        if not isinstance(groups, list):
            return []

        result = []
        for group in groups:
            if not isinstance(group, dict):
                continue
            title = str(group.get("title", "")).strip()
            if not title:
                continue
            bounding = group.get("bounding")
            if not isinstance(bounding, list) or len(bounding) < 4:
                bounding = [0, 0, 0, 0]
            group_id = group.get("id")
            if group_id is None:
                values = ",".join(f"{float(value):g}" for value in bounding[:4])
                key = f"legacy:{title}\x1f{values}"
            else:
                key = f"id:{group_id}"
            result.append({"key": key, "title": title, "bounding": bounding, "color": str(group.get("color", "") or "").lower()})
        return result

    @staticmethod
    def _ordered_groups(groups, properties):
        filter_text = str(properties.get("rui_gsi_filter", "") or "").strip().lower()
        color_filter = str(properties.get("rui_gsi_color_filter", "none") or "none").lower()
        groups = [group for group in groups if not filter_text or filter_text in group["title"].lower()]
        if color_filter != "none":
            groups = [group for group in groups if (not group["color"] if color_filter == "transparent" else group["color"] == color_filter)]

        sort_mode = str(properties.get("rui_gsi_sort_mode", "manual") or "manual")
        if sort_mode == "alphabet":
            return sorted(groups, key=lambda group: group["title"].lower())
        if sort_mode == "position":
            return sorted(groups, key=lambda group: (group["bounding"][1], group["bounding"][0], group["title"].lower()))

        remaining = list(groups)
        ordered = []
        for value in properties.get("rui_gsi_order", []) or []:
            index = next((i for i, group in enumerate(remaining) if group["key"] == value), -1)
            if index < 0:
                index = next((i for i, group in enumerate(remaining) if group["title"] == value), -1)
            if index >= 0:
                ordered.append(remaining.pop(index))
        ordered.extend(sorted(remaining, key=lambda group: (group["bounding"][1], group["bounding"][0], group["title"].lower())))
        return ordered

    @staticmethod
    def _selected_from_properties(properties):
        try:
            return int(properties.get("rui_gsi_selected_index", 0))
        except Exception:
            return 0

    @classmethod
    def IS_CHANGED(cls, selected_index_value=0, extra_pnginfo=None, unique_id=None):
        node = cls._workflow_node(extra_pnginfo, unique_id)
        properties = node.get("properties") if isinstance(node, dict) else {}
        if not isinstance(properties, dict):
            properties = {}
        return (
            int(selected_index_value),
            properties.get("rui_gsi_mode", "default"),
            properties.get("rui_gsi_filter", ""),
            properties.get("rui_gsi_color_filter", "none"),
            properties.get("rui_gsi_sort_mode", "manual"),
            properties.get("rui_gsi_selected_group", ""),
            properties.get("rui_gsi_selected_title", ""),
            properties.get("rui_gsi_selected_index", 0),
            tuple(properties.get("rui_gsi_active_groups", []) or []),
            tuple(properties.get("rui_gsi_active_set", []) or []),
            tuple(properties.get("rui_gsi_order", []) or []),
        )
    def get_selected_index(self, selected_index_value=0, extra_pnginfo=None, unique_id=None):
        node = self._workflow_node(extra_pnginfo, unique_id)
        properties = node.get("properties") if isinstance(node, dict) else {}
        if not isinstance(properties, dict):
            properties = {}

        mode = str(properties.get("rui_gsi_mode", "default") or "default")
        selected_group = str(properties.get("rui_gsi_selected_group", "") or "")
        selected_title = str(properties.get("rui_gsi_selected_title", "") or "").strip()
        groups = self._ordered_groups(self._workflow_groups(extra_pnginfo), properties)

        try:
            selected_index_value = int(selected_index_value)
        except Exception:
            selected_index_value = 0

        if selected_index_value > 0:
            return (selected_index_value,)

        if not groups:
            return (0,)

        if mode == "default":
            return (0,)

        selected = next((index for index, group in enumerate(groups) if group["key"] == selected_group), -1)
        if selected < 0 and selected_title:
            selected = next((index for index, group in enumerate(groups) if group["title"] == selected_title), -1)
        if selected >= 0:
            return (selected + 1,)

        selected_index = self._selected_from_properties(properties)
        if 1 <= selected_index <= len(groups):
            return (selected_index,)

        if mode == "always_one":
            return (1,)

        return (0,)
RUI_NODE_DEFINITIONS = [
    ("RuiDirectorySync", RuiDirectorySync, "Rui Directory Sync"),
    ("RuiImageLoader", RuiImageLoader, "Rui Path Image Loader"),
    ("RuiImageSaver", RuiImageSaver, "Rui Image Saver"),
    ("RuiDirectorySkip", RuiDirectorySkip, "Rui Directory Iterator"),
    ("RuiDirectoryTail", RuiDirectoryTail, "Rui Directory Tail Iterator"),
    ("RuiFlatImageReader", RuiFlatImageReader, "Rui Current Directory Image Iterator"),
    ("RuiImageCount", RuiImageCount, "Rui Image Count"),
    ("RuiUniversalImageSaver", RuiUniversalImageSaver, "Rui Universal Image Saver"),
    ("RuiPlaySound", RuiPlaySound, "Rui Play Sound"),
    ("RuiGroupSwitchIndex", RuiGroupSwitchIndex, "Rui Ignore Group Selector"),
    ("RuiLightForStart", RuiLightForStart, "Rui Lightweight For Start"),
    ("RuiLightForEnd", RuiLightForEnd, "Rui Lightweight For End"),
]

NODE_CLASS_MAPPINGS = {node_id: node_class for node_id, node_class, _ in RUI_NODE_DEFINITIONS}

NODE_DISPLAY_NAME_MAPPINGS = {node_id: display_name for node_id, _, display_name in RUI_NODE_DEFINITIONS}
