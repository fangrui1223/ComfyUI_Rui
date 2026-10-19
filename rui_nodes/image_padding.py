import math

import comfy.utils
import torch.nn.functional as F


ASPECT_RATIOS = ((1, 1), (4, 3), (3, 4), (3, 2), (2, 3), (16, 9), (9, 16))


def _align_image_mask(image, mask):
    if mask is None:
        return image, None

    batch, height, width, _ = image.shape
    mask = mask.reshape(-1, mask.shape[-2], mask.shape[-1]).to(image)
    mask_count = mask.shape[0]
    count = max(batch, mask_count)
    if batch not in (1, count) or mask_count not in (1, count):
        raise ValueError("Image and mask batches must match, or one must contain a single item.")
    if mask.shape[1:] != (height, width):
        mask = F.interpolate(mask[:, None], size=(height, width), mode="bilinear", align_corners=False)[:, 0]
    if batch != count:
        image = image.expand(count, -1, -1, -1)
    if mask_count != count:
        mask = mask.expand(count, -1, -1)
    return image, mask


class RuiResizeAndPadImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "input_image": ("IMAGE",),
            "target_size": ("INT", {"default": 2048, "min": 64, "max": 8192, "step": 1}),
            "resolution_multiple": ("INT", {"default": 32, "min": 0, "max": 128, "step": 8}),
            "padding_strategy": (["nearest_ratio", "minimal_padding"], {"default": "nearest_ratio"}),
            "upscale_method": (["lanczos", "bicubic", "area", "nearest"], {"default": "lanczos"}),
            "resize_and_pad": ("BOOLEAN", {"default": True}),
        }, "optional": {
            "input_mask": ("MASK",),
        }}

    RETURN_TYPES = ("IMAGE", "IMAGE_INFO", "INT", "INT", "MASK")
    RETURN_NAMES = ("output_image", "image_info", "canvas_width", "canvas_height", "output_mask")
    FUNCTION = "resize_and_pad_image"
    CATEGORY = "Rui/Image/Transform"

    def resize_and_pad_image(self, input_image, target_size, resolution_multiple, padding_strategy, upscale_method, resize_and_pad, input_mask=None):
        input_image, input_mask = _align_image_mask(input_image, input_mask)
        batch, height, width, channels = input_image.shape
        if not resize_and_pad:
            output_mask = input_mask if input_mask is not None else input_image.new_zeros((batch, height, width))
            return (input_image, (0, 0, 0, 0, width, height), width, height, output_mask)

        if resolution_multiple > 0:
            target_size = max(resolution_multiple, ((target_size + resolution_multiple // 2) // resolution_multiple) * resolution_multiple)

        if padding_strategy == "nearest_ratio":
            ratio_width, ratio_height = min(
                ASPECT_RATIOS,
                key=lambda ratio: abs(math.log(width * ratio[1] / (height * ratio[0]))),
            )
            short_side = target_size * min(ratio_width, ratio_height) / max(ratio_width, ratio_height)
            if resolution_multiple > 0:
                short_side = max(resolution_multiple, int(short_side / resolution_multiple + 0.5) * resolution_multiple)
            else:
                short_side = max(1, round(short_side))
            if ratio_width >= ratio_height:
                canvas_width, canvas_height = target_size, short_side
            else:
                canvas_width, canvas_height = short_side, target_size
            if width * canvas_height <= height * canvas_width:
                new_height = canvas_height
                new_width = max(1, width * canvas_height // height)
            else:
                new_width = canvas_width
                new_height = max(1, height * canvas_width // width)
        elif padding_strategy == "minimal_padding":
            if width >= height:
                new_width = target_size
                new_height = max(1, height * target_size // width)
            else:
                new_height = target_size
                new_width = max(1, width * target_size // height)
            if resolution_multiple > 0:
                canvas_width = (new_width + resolution_multiple - 1) // resolution_multiple * resolution_multiple
                canvas_height = (new_height + resolution_multiple - 1) // resolution_multiple * resolution_multiple
            else:
                canvas_width, canvas_height = new_width, new_height
        else:
            raise ValueError(f"Unknown padding strategy: {padding_strategy}")

        left = (canvas_width - new_width) // 2
        top = (canvas_height - new_height) // 2
        right = canvas_width - new_width - left
        bottom = canvas_height - new_height - top

        image_info = (left, top, right, bottom, canvas_width, canvas_height)
        if new_width == width and new_height == height and not (left or top or right or bottom):
            output_mask = input_mask if input_mask is not None else input_image.new_zeros((batch, height, width))
            return (input_image, image_info, canvas_width, canvas_height, output_mask)

        if new_width == width and new_height == height:
            resized = input_image
        else:
            resized = comfy.utils.common_upscale(input_image.movedim(-1, 1), new_width, new_height, upscale_method, "disabled").movedim(1, -1)
        output = input_image.new_zeros((batch, canvas_height, canvas_width, channels))
        if channels == 4:
            output[..., 3] = 1
        output[:, top:top + new_height, left:left + new_width] = resized
        output_mask = input_image.new_zeros((batch, canvas_height, canvas_width))
        if input_mask is not None:
            if new_width != width or new_height != height:
                input_mask = comfy.utils.common_upscale(input_mask[:, None], new_width, new_height, upscale_method, "disabled").reshape(batch, new_height, new_width).clamp(0, 1)
            output_mask[:, top:top + new_height, left:left + new_width] = input_mask
        return (output, image_info, canvas_width, canvas_height, output_mask)


class RuiRemoveImagePadding:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "input_image": ("IMAGE",),
            "image_info": ("IMAGE_INFO",),
            "remove_pad": ("BOOLEAN", {"default": True}),
        }, "optional": {
            "input_mask": ("MASK",),
        }}

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("output_image", "output_mask")
    FUNCTION = "remove_image_padding"
    CATEGORY = "Rui/Image/Transform"

    def remove_image_padding(self, input_image, image_info, remove_pad, input_mask=None):
        input_image, input_mask = _align_image_mask(input_image, input_mask)
        batch, height, width, _ = input_image.shape
        if not remove_pad or not any(image_info[:4]):
            output_mask = input_mask if input_mask is not None else input_image.new_zeros((batch, height, width))
            return (input_image, output_mask)

        left, top, right, bottom, canvas_width, canvas_height = image_info
        scale_x = width / canvas_width
        scale_y = height / canvas_height

        x0 = max(0, min(width - 1, round(left * scale_x)))
        y0 = max(0, min(height - 1, round(top * scale_y)))
        x1 = max(x0 + 1, min(width, round((canvas_width - right) * scale_x)))
        y1 = max(y0 + 1, min(height, round((canvas_height - bottom) * scale_y)))
        output_mask = input_mask[:, y0:y1, x0:x1].clone() if input_mask is not None else input_image.new_zeros((batch, y1 - y0, x1 - x0))
        return (input_image[:, y0:y1, x0:x1].clone(), output_mask)


NODE_CLASS_MAPPINGS = {
    "RuiResizeAndPadImage": RuiResizeAndPadImage,
    "RuiRemoveImagePadding": RuiRemoveImagePadding,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RuiResizeAndPadImage": "Rui Resize and Pad Image",
    "RuiRemoveImagePadding": "Rui Remove Image Padding",
}
