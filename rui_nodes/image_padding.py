import math

import comfy.utils


ASPECT_RATIOS = ((1, 1), (4, 3), (3, 4), (3, 2), (2, 3), (16, 9), (9, 16))


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
        }}

    RETURN_TYPES = ("IMAGE", "IMAGE_INFO", "INT", "INT")
    RETURN_NAMES = ("output_image", "image_info", "canvas_width", "canvas_height")
    FUNCTION = "resize_and_pad_image"
    CATEGORY = "Rui/Image/Transform"

    def resize_and_pad_image(self, input_image, target_size, resolution_multiple, padding_strategy, upscale_method, resize_and_pad):
        batch, height, width, channels = input_image.shape
        if not resize_and_pad:
            return (input_image, (0, 0, 0, 0, width, height), width, height)

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
            return (input_image, image_info, canvas_width, canvas_height)

        if new_width == width and new_height == height:
            resized = input_image
        else:
            resized = comfy.utils.common_upscale(input_image.movedim(-1, 1), new_width, new_height, upscale_method, "disabled").movedim(1, -1)
        output = input_image.new_zeros((batch, canvas_height, canvas_width, channels))
        if channels == 4:
            output[..., 3] = 1
        output[:, top:top + new_height, left:left + new_width] = resized
        return (output, image_info, canvas_width, canvas_height)


class RuiRemoveImagePadding:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "input_image": ("IMAGE",),
            "image_info": ("IMAGE_INFO",),
            "remove_pad": ("BOOLEAN", {"default": True}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("output_image",)
    FUNCTION = "remove_image_padding"
    CATEGORY = "Rui/Image/Transform"

    def remove_image_padding(self, input_image, image_info, remove_pad):
        if not remove_pad:
            return (input_image,)

        left, top, right, bottom, canvas_width, canvas_height = image_info
        if not (left or top or right or bottom):
            return (input_image,)

        height, width = input_image.shape[1:3]
        scale_x = width / canvas_width
        scale_y = height / canvas_height

        x0 = max(0, min(width - 1, round(left * scale_x)))
        y0 = max(0, min(height - 1, round(top * scale_y)))
        x1 = max(x0 + 1, min(width, round((canvas_width - right) * scale_x)))
        y1 = max(y0 + 1, min(height, round((canvas_height - bottom) * scale_y)))
        return (input_image[:, y0:y1, x0:x1],)


NODE_CLASS_MAPPINGS = {
    "RuiResizeAndPadImage": RuiResizeAndPadImage,
    "RuiRemoveImagePadding": RuiRemoveImagePadding,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RuiResizeAndPadImage": "Rui Resize and Pad Image",
    "RuiRemoveImagePadding": "Rui Remove Image Padding",
}
