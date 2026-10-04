import numpy as np
import torch
import torch.nn.functional as F
from scipy import ndimage

import comfy.utils


def _mask_bounds(mask):
    rows = np.flatnonzero(np.any(mask > 0, axis=1))
    if not len(rows):
        return None
    columns = np.flatnonzero(np.any(mask > 0, axis=0))
    return int(columns[0]), int(rows[0]), int(columns[-1]) + 1, int(rows[-1]) + 1


def _crop_origin(start, end, side, extent):
    origin = (start + end - side) // 2
    if side <= extent:
        return max(0, min(origin, extent - side))
    return max(extent - side, min(origin, 0))


def _outward_feather(mask, pixels):
    bounds = _mask_bounds(mask)
    if not pixels or bounds is None:
        return mask
    x0, y0, x1, y1 = bounds
    x0, y0 = max(0, x0 - pixels), max(0, y0 - pixels)
    x1, y1 = min(mask.shape[1], x1 + pixels), min(mask.shape[0], y1 + pixels)
    region = mask[y0:y1, x0:x1]
    distance, nearest = ndimage.distance_transform_edt(region <= 0, return_indices=True)
    t = np.minimum(distance / (pixels + 1), 1).astype(np.float32)
    falloff = (1 - t) ** 2 * (1 + 2 * t)
    falloff[distance > pixels] = 0
    alpha = mask.copy()
    alpha[y0:y1, x0:x1] = np.maximum(region, region[nearest[0], nearest[1]] * falloff)
    return alpha


class RuiMaskSquareCrop:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "mask": ("MASK",),
            "crop_size": ("INT", {"default": 1024, "min": 32, "max": 8192, "step": 32,
                                  "tooltip": "Preferred crop side in original pixels. Grows to include the mask and context, rounded up to a multiple of 32."}),
            "context_pixels": ("INT", {"default": 128, "min": 0, "max": 1024, "step": 1,
                                       "tooltip": "Original pixels reserved around the expanded mask for model context and outward feathering."}),
            "mask_expand_pixels": ("INT", {"default": 0, "min": 0, "max": 256, "step": 1,
                                           "tooltip": "Expand the editable mask in original pixels before cropping. Useful for changing object outlines."}),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "RUI_CROP_INFO", "INT", "BOOLEAN")
    RETURN_NAMES = ("cropped_image", "cropped_mask", "crop_info", "actual_crop_size", "has_mask")
    FUNCTION = "crop"
    CATEGORY = "Rui/Image/Transform"

    def crop(self, image, mask, crop_size, context_pixels, mask_expand_pixels):
        image_count, height, width, _ = image.shape
        masks = mask.reshape(-1, mask.shape[-2], mask.shape[-1]).detach().to(device="cpu", dtype=torch.float32)
        if masks.shape[1:] != (height, width):
            masks = F.interpolate(masks[:, None], size=(height, width), mode="bilinear", align_corners=False)[:, 0]
        masks = masks.clamp(0, 1)
        mask_count = masks.shape[0]
        count = max(image_count, mask_count)
        if image_count not in (1, count) or mask_count not in (1, count):
            raise ValueError("Image and mask batches must match, or one must contain a single item.")

        prepared = []
        side = crop_size
        for i in range(count):
            mask_array = masks[0 if mask_count == 1 else i].numpy()
            bounds = _mask_bounds(mask_array)
            if bounds is not None and mask_expand_pixels:
                x0, y0, x1, y1 = bounds
                x0, y0 = max(0, x0 - mask_expand_pixels), max(0, y0 - mask_expand_pixels)
                x1, y1 = min(width, x1 + mask_expand_pixels), min(height, y1 + mask_expand_pixels)
                expanded = ndimage.maximum_filter(mask_array[y0:y1, x0:x1], size=2 * mask_expand_pixels + 1, mode="constant")
                mask_array = np.zeros_like(mask_array)
                mask_array[y0:y1, x0:x1] = expanded
                bounds = _mask_bounds(mask_array)
            if bounds is not None:
                x0, y0, x1, y1 = bounds
                side = max(side, x1 - x0 + 2 * context_pixels, y1 - y0 + 2 * context_pixels)
            prepared.append((mask_array, bounds))
        side = (side + 31) // 32 * 32

        cropped_images = []
        cropped_masks = []
        regions = []
        for i, (mask_array, bounds) in enumerate(prepared):
            source_index = 0 if image_count == 1 else i
            if bounds is None:
                bounds_for_crop = (width // 2, height // 2, width // 2, height // 2)
            else:
                bounds_for_crop = bounds
            bx0, by0, bx1, by1 = bounds_for_crop
            x = _crop_origin(bx0, bx1, side, width)
            y = _crop_origin(by0, by1, side, height)
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(width, x + side), min(height, y + side)
            left, top = x0 - x, y0 - y
            right, bottom = x + side - x1, y + side - y1
            cropped = image[source_index:source_index + 1, y0:y1, x0:x1]
            if left or top or right or bottom:
                cropped = F.pad(cropped.movedim(-1, 1), (left, right, top, bottom), mode="replicate").movedim(1, -1)
            crop_mask = np.zeros((side, side), dtype=np.float32)
            crop_mask[top:top + y1 - y0, left:left + x1 - x0] = mask_array[y0:y1, x0:x1]
            cropped_images.append(cropped)
            cropped_masks.append(torch.from_numpy(crop_mask))
            regions.append({"x": x, "y": y, "source_index": source_index, "mask_bounds": bounds})

        cropped_masks = torch.stack(cropped_masks).to(image.device)
        crop_info = {
            "original_size": (width, height),
            "original_batch_size": image_count,
            "crop_size": side,
            "regions": regions,
            "mask": cropped_masks,
        }
        return (torch.cat(cropped_images), cropped_masks, crop_info, side, any(bounds is not None for _, bounds in prepared))


class RuiMaskStitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "original_image": ("IMAGE",),
            "generated_image": ("IMAGE",),
            "crop_info": ("RUI_CROP_INFO",),
            "feather_pixels": ("INT", {"default": 32, "min": 0, "max": 256, "step": 1,
                                       "tooltip": "Blend outward from the mask in original pixels. Keep enough context in the crop for this width."}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "stitch"
    CATEGORY = "Rui/Image/Transform"

    def stitch(self, original_image, generated_image, crop_info, feather_pixels):
        image_count, height, width, channels = original_image.shape
        if (width, height) != crop_info["original_size"] or image_count != crop_info["original_batch_size"]:
            raise ValueError("Connect the same original image and batch used by Rui Mask Square Crop.")
        regions = crop_info["regions"]
        generated_count, generated_height, generated_width, generated_channels = generated_image.shape
        if len(regions) > 1 and generated_count != len(regions):
            raise ValueError("Each cropped region needs its own generated image. Use a per-image loop or matching generation batch.")

        count = max(len(regions), generated_count)
        source_indices = [regions[0 if len(regions) == 1 else i]["source_index"] for i in range(count)]
        output = original_image[source_indices]
        if all(region["mask_bounds"] is None for region in regions):
            return (output,)
        if generated_width != generated_height:
            raise ValueError("Keep the generated image square before stitching; resizing must preserve the crop's aspect ratio.")
        color_channels = 3 if channels == 4 else channels
        if generated_channels < color_channels:
            raise ValueError("The generated image must have the original image's color channels.")

        side = crop_info["crop_size"]
        generated = generated_image[..., :color_channels].to(device=original_image.device, dtype=original_image.dtype)
        if generated_width != side:
            method = "area" if generated_width > side else "bicubic"
            generated = comfy.utils.common_upscale(generated.movedim(-1, 1), side, side, method, "disabled").movedim(1, -1)
        masks = crop_info["mask"].detach().to(device="cpu", dtype=torch.float32).numpy()

        for i in range(count):
            region_index = 0 if len(regions) == 1 else i
            region = regions[region_index]
            bounds = region["mask_bounds"]
            if bounds is None:
                continue
            x, y = region["x"], region["y"]
            bx0, by0, bx1, by1 = bounds
            margins = []
            if x > 0:
                margins.append(bx0 - x)
            if y > 0:
                margins.append(by0 - y)
            if x + side < width:
                margins.append(x + side - bx1)
            if y + side < height:
                margins.append(y + side - by1)
            if margins and feather_pixels > min(margins):
                raise ValueError(f"Feathering needs {feather_pixels}px, but the crop has {min(margins)}px at an internal edge. Increase context_pixels and crop again.")

            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(width, x + side), min(height, y + side)
            left, top = x0 - x, y0 - y
            alpha = _outward_feather(masks[region_index], feather_pixels)
            alpha = torch.from_numpy(alpha[top:top + y1 - y0, left:left + x1 - x0].copy()).to(device=output.device, dtype=output.dtype)[..., None]
            patch = generated[i, top:top + y1 - y0, left:left + x1 - x0]
            original = output[i, y0:y1, x0:x1, :color_channels]
            blended = torch.lerp(original, patch, alpha)
            output[i, y0:y1, x0:x1, :color_channels] = torch.where(alpha == 0, original, torch.where(alpha == 1, patch, blended))
        return (output,)


NODE_CLASS_MAPPINGS = {
    "RuiMaskSquareCrop": RuiMaskSquareCrop,
    "RuiMaskStitch": RuiMaskStitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RuiMaskSquareCrop": "Rui Mask Square Crop",
    "RuiMaskStitch": "Rui Mask Stitch",
}
