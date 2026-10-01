import os
import random

import folder_paths
import numpy as np
import torch
from nodes import PreviewImage
from PIL import Image


class RuiImageCompare(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "a": ("IMAGE",),
                "b": ("IMAGE",),
                "reduce_lag": ("BOOLEAN", {"default": False}),
                "show_line": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "compare_images"
    CATEGORY = "Rui/Image/Preview"
    OUTPUT_NODE = True

    def compare_images(self, a=None, b=None, reduce_lag=False, show_line=True,
                       filename_prefix="rui.compare.", prompt=None, extra_pnginfo=None):
        result = {"ui": {"a_images": [], "b_images": []}}
        max_side = 3840 if reduce_lag else 6400

        if a is not None and len(a) > 0:
            result["ui"]["a_images"] = self._save_compressed(a, filename_prefix + "comp.", max_side)
        if b is not None and len(b) > 0:
            result["ui"]["b_images"] = self._save_compressed(b, filename_prefix + "comp.", max_side)
        return result

    def _save_compressed(self, images, prefix="rui.comp.", max_side=3840, quality=85):
        output_dir = folder_paths.get_temp_directory()
        os.makedirs(output_dir, exist_ok=True)
        results = []

        for index, tensor in enumerate(images):
            image = tensor.unsqueeze(0).permute(0, 3, 1, 2)
            height, width = image.shape[2], image.shape[3]
            if max(width, height) > max_side:
                ratio = max_side / max(width, height)
                new_width = max(1, int(width * ratio))
                new_height = max(1, int(height * ratio))
                image = torch.nn.functional.interpolate(
                    image,
                    size=(new_height, new_width),
                    mode="bicubic",
                    align_corners=False,
                )

            array = image.squeeze(0).permute(1, 2, 0).cpu().numpy()
            pixels = array * 255
            np.clip(pixels, 0, 255, out=pixels)
            pil_image = Image.fromarray(pixels.astype(np.uint8))
            token = "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))
            has_alpha = pil_image.mode in ("RGBA", "LA")
            extension = "png" if has_alpha else "jpg"
            image_format = "PNG" if has_alpha else "JPEG"
            save_options = {} if has_alpha else {"quality": quality, "optimize": True}
            filename = f"{prefix}{token}_{index}.{extension}"
            pil_image.save(os.path.join(output_dir, filename), image_format, **save_options)
            results.append({"filename": filename, "subfolder": "", "type": "temp"})

        return results


NODE_CLASS_MAPPINGS = {"RuiImageCompare": RuiImageCompare}
NODE_DISPLAY_NAME_MAPPINGS = {"RuiImageCompare": "Rui Image Compare"}
