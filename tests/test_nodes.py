import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch
from PIL import Image


COMFY_ROOT = Path(__file__).resolve().parents[3]
CUSTOM_NODES = COMFY_ROOT / "custom_nodes"
sys.path.insert(0, str(COMFY_ROOT))
sys.path.insert(0, str(CUSTOM_NODES))

import ComfyUI_Rui
from ComfyUI_Rui.rui_nodes.image_compare import RuiImageCompare
from ComfyUI_Rui.rui_nodes.image_padding import RuiRemoveImagePadding, RuiResizeAndPadImage
from ComfyUI_Rui.rui_nodes.image_upload import RuiImageUploadLoader
from ComfyUI_Rui.rui_nodes.operations import (
    RuiDirectorySkip, RuiDirectorySync, RuiDirectoryTail, RuiGroupSwitchIndex,
    RuiImageSaver, RuiUniversalImageSaver,
)
from ComfyUI_Rui.rui_nodes.ui import RuiIntToBoolean, RuiSelector, RuiText, RuiUniversalSlider


class UiNodeTests(unittest.TestCase):
    def test_selector_and_slider_values(self):
        self.assertEqual(RuiSelector().select("3"), (3,))
        self.assertEqual(RuiSelector().select("invalid"), (0,))
        self.assertEqual(RuiUniversalSlider().execute(3.6, "int"), (4,))
        self.assertEqual(RuiUniversalSlider().execute(3.6, "float"), (3.6,))

    def test_text_output_matches_comfyroll_text_contract(self):
        text, show_help = RuiText().get_text("复古港风女孩")
        self.assertEqual(text, "复古港风女孩")
        self.assertIn("#cr-text", show_help)

    def test_integer_to_boolean_with_invert(self):
        node = RuiIntToBoolean()
        self.assertEqual(node.convert(0, False), (False,))
        self.assertEqual(node.convert(2, False), (True,))
        self.assertEqual(node.convert(2, True), (False,))

    def test_mapping_and_categories(self):
        expected = {"RuiImageUploadLoader", "RuiImageCompare", "RuiResizeAndPadImage", "RuiRemoveImagePadding", "RuiUniversalSlider", "RuiSelector", "RuiTitle", "RuiText", "RuiIntToBoolean"}
        self.assertTrue(expected.issubset(ComfyUI_Rui.NODE_CLASS_MAPPINGS))
        self.assertEqual(ComfyUI_Rui.NODE_CLASS_MAPPINGS["RuiImageCompare"].CATEGORY, "Rui/Image/Preview")
        self.assertEqual(ComfyUI_Rui.NODE_CLASS_MAPPINGS["RuiResizeAndPadImage"].CATEGORY, "Rui/Image/Transform")
        padding_inputs = RuiResizeAndPadImage.INPUT_TYPES()["required"]
        self.assertEqual(padding_inputs["target_size"][1]["default"], 2048)
        self.assertEqual(padding_inputs["padding_strategy"][1]["default"], "nearest_ratio")

    def test_group_switch_distinguishes_duplicate_titles(self):
        extra_pnginfo = {
            "workflow": {
                "nodes": [{
                    "id": 17,
                    "properties": {
                        "rui_gsi_mode": "always_one",
                        "rui_gsi_sort_mode": "manual",
                        "rui_gsi_order": ["id:22", "id:11"],
                        "rui_gsi_selected_group": "id:11",
                        "rui_gsi_selected_index": 2,
                    },
                }],
                "groups": [
                    {"id": 11, "title": "Group", "bounding": [0, 0, 100, 100]},
                    {"id": 22, "title": "Group", "bounding": [0, 200, 100, 100]},
                ],
            }
        }
        self.assertEqual(RuiGroupSwitchIndex().get_selected_index(0, extra_pnginfo, 17), (2,))


class ImageNodeTests(unittest.TestCase):
    def test_resize_pad_and_crop_round_trip(self):
        image = torch.arange(2 * 8 * 3, dtype=torch.float32).reshape(1, 2, 8, 3) / 48
        padded, info, canvas_width, canvas_height = RuiResizeAndPadImage().resize_and_pad_image(image, 1024, 32, "nearest_ratio", "nearest", True)
        self.assertEqual((canvas_width, canvas_height), (1024, 576))
        self.assertEqual(tuple(padded.shape), (1, 576, 1024, 3))
        self.assertEqual(info, (0, 160, 0, 160, 1024, 576))
        cropped, = RuiRemoveImagePadding().remove_image_padding(padded, info, True)
        self.assertEqual(tuple(cropped.shape), (1, 256, 1024, 3))
        self.assertTrue(torch.equal(cropped, padded[:, 160:416]))

        minimal, minimal_info, canvas_width, canvas_height = RuiResizeAndPadImage().resize_and_pad_image(image, 1024, 32, "minimal_padding", "nearest", True)
        self.assertEqual((canvas_width, canvas_height), (1024, 256))
        self.assertEqual(minimal_info, (0, 0, 0, 0, 1024, 256))
        self.assertEqual(tuple(minimal.shape), (1, 256, 1024, 3))
        self.assertTrue(torch.equal(minimal, cropped))

    def test_padding_aligns_each_dimension(self):
        image = torch.zeros((1, 10, 17, 3))
        padded, info, width, height = RuiResizeAndPadImage().resize_and_pad_image(image, 70, 32, "minimal_padding", "nearest", True)
        self.assertEqual((width, height), (64, 64))
        self.assertEqual(info, (0, 13, 0, 14, 64, 64))
        self.assertEqual(tuple(padded.shape), (1, 64, 64, 3))
        unaligned, unaligned_info, width, height = RuiResizeAndPadImage().resize_and_pad_image(image, 70, 0, "minimal_padding", "nearest", True)
        self.assertEqual((width, height), (70, 41))
        self.assertEqual(unaligned_info, (0, 0, 0, 0, 70, 41))
        self.assertEqual(tuple(unaligned.shape), (1, 41, 70, 3))

    def test_nearest_ratio_handles_portrait_image(self):
        image = torch.zeros((1, 8, 2, 3))
        padded, info, width, height = RuiResizeAndPadImage().resize_and_pad_image(image, 1024, 32, "nearest_ratio", "nearest", True)
        self.assertEqual((width, height), (576, 1024))
        self.assertEqual(info, (160, 0, 160, 0, 576, 1024))
        self.assertEqual(tuple(padded.shape), (1, 1024, 576, 3))

    def test_remove_padding_scales_axes_independently(self):
        image = torch.arange(2 * 128 * 96 * 4, dtype=torch.float32).reshape(2, 128, 96, 4)
        info = (16, 8, 16, 24, 64, 64)
        cropped, = RuiRemoveImagePadding().remove_image_padding(image, info, True)
        self.assertEqual(tuple(cropped.shape), (2, 64, 48, 4))
        self.assertTrue(torch.equal(cropped, image[:, 16:80, 24:72]))

    def test_remove_padding_keeps_thin_content_after_downscale(self):
        image = torch.ones((1, 8, 8, 3))
        cropped, = RuiRemoveImagePadding().remove_image_padding(image, (15, 0, 16, 0, 32, 32), True)
        self.assertEqual(tuple(cropped.shape), (1, 8, 1, 3))

    def test_padding_preserves_alpha_and_bypass_image(self):
        image = torch.full((1, 32, 60, 4), 0.25, dtype=torch.float32)
        image[..., 3] = 0.5
        padded, info, width, height = RuiResizeAndPadImage().resize_and_pad_image(image, 64, 32, "nearest_ratio", "lanczos", True)
        self.assertEqual((width, height), (64, 32))
        self.assertEqual(info, (2, 0, 2, 0, 64, 32))
        self.assertTrue(torch.equal(padded[:, :, 2:62], image))
        self.assertTrue(torch.all(padded[:, :, :2, :3] == 0))
        self.assertTrue(torch.all(padded[:, :, :2, 3] == 1))
        self.assertTrue(torch.equal(RuiRemoveImagePadding().remove_image_padding(padded, info, True)[0], image))
        bypass, bypass_info, width, height = RuiResizeAndPadImage().resize_and_pad_image(image, 64, 32, "nearest_ratio", "lanczos", False)
        self.assertIs(bypass, image)
        self.assertEqual(bypass_info, (0, 0, 0, 0, 60, 32))
        self.assertEqual((width, height), (60, 32))
        self.assertIs(RuiRemoveImagePadding().remove_image_padding(bypass, bypass_info, True)[0], image)

    def test_savers_reject_unknown_format_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            source.touch()
            images = torch.zeros((1, 2, 2, 3), dtype=torch.float32)
            target = root / "out"
            with self.assertRaises(ValueError):
                RuiImageSaver().save_images(images, str(source), str(target), save_format="bad/format")
            with self.assertRaises(ValueError):
                RuiUniversalImageSaver().save_images(images, str(target), "", "image", save_format="bad/format")
            self.assertFalse(target.exists())

    def test_directory_nodes_keep_natural_order_and_last_item_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            area_a = root / "A"
            area_b = root / "B"
            for area in (area_a, area_b):
                for folder in ("1", "2"):
                    (area / folder).mkdir(parents=True)
            for name in ("2.png", "10.png"):
                (area_a / "1" / name).touch()
            (area_a / "2" / "1.png").touch()
            for folder in ("1", "2"):
                for name in ("1.png", "2.png"):
                    (area_b / folder / name).touch()

            sync = RuiDirectorySync()
            self.assertEqual(sync.sync_and_match(str(area_a), str(area_b), 0),
                             (str(area_a / "1" / "2.png"), str(area_b / "1" / "1.png")))
            self.assertEqual(sync.sync_and_match(str(area_a), str(area_b), 1),
                             (str(area_a / "1" / "10.png"), str(area_b / "1" / "2.png")))
            last_pair = (str(area_a / "2" / "1.png"), str(area_b / "2" / "2.png"))
            self.assertEqual(sync.sync_and_match(str(area_a), str(area_b), 2), last_pair)
            self.assertEqual(sync.sync_and_match(str(area_a), str(area_b), 99), last_pair)

            skip = RuiDirectorySkip()
            self.assertEqual(skip.get_path(str(area_a), 0, 1), (str(area_a / "1" / "2.png"),))
            self.assertEqual(skip.get_path(str(area_a), 99, 1), (str(area_a / "1" / "2.png"),))
            tail = RuiDirectoryTail()
            self.assertEqual(tail.get_path(str(area_a), 0, 1), (str(area_a / "1" / "10.png"),))
            self.assertEqual(tail.get_path(str(area_a), 99, 1), (str(area_a / "2" / "1.png"),))

            sync_stamp = sync.IS_CHANGED(str(area_a), str(area_b), 0)
            skip_stamp = skip.IS_CHANGED(str(area_a), 0, 1)
            tail_stamp = tail.IS_CHANGED(str(area_a), 0, 1)
            folder = area_a / "1"
            stat = folder.stat()
            os.utime(folder, ns=(stat.st_atime_ns, stat.st_mtime_ns + 2_000_000_000))
            self.assertNotEqual(sync_stamp, sync.IS_CHANGED(str(area_a), str(area_b), 0))
            self.assertNotEqual(skip_stamp, skip.IS_CHANGED(str(area_a), 0, 1))
            self.assertNotEqual(tail_stamp, tail.IS_CHANGED(str(area_a), 0, 1))

    def test_upload_loader_hashes_content_and_returns_source_name(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = os.path.join(directory, "uploaded.png")
            rgba = np.zeros((3, 4, 4), dtype=np.uint8)
            rgba[..., :3] = 128
            rgba[..., 3] = 255
            rgba[0, 0, 3] = 0
            Image.fromarray(rgba, "RGBA").save(image_path)

            with patch("ComfyUI_Rui.rui_nodes.image_upload.folder_paths.get_annotated_filepath", return_value=image_path):
                first_hash = RuiImageUploadLoader.IS_CHANGED("uploaded.png", 0, False, source_names="portrait original.png")
                images, mask, filename, stem = RuiImageUploadLoader().load_images(
                    "uploaded.png", 0, False, source_names="portrait original.png"
                )
                rgba[0, 0, 0] = 255
                Image.fromarray(rgba, "RGBA").save(image_path)
                second_hash = RuiImageUploadLoader.IS_CHANGED("uploaded.png", 0, False, source_names="portrait original.png")

            self.assertNotEqual(first_hash, second_hash)
            self.assertEqual(filename, "portrait original.png")
            self.assertEqual(stem, "portrait original")
            self.assertEqual(len(images), 1)
            self.assertEqual(tuple(images[0].shape), (1, 3, 4, 3))
            self.assertEqual(tuple(mask.shape), (3, 4))
            self.assertEqual(mask[0, 0].item(), 0.0)

    def test_upload_loader_mask_changes_cache_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = os.path.join(directory, "uploaded.png")
            Image.new("RGB", (2, 2), "white").save(image_path)
            with patch("ComfyUI_Rui.rui_nodes.image_upload.folder_paths.get_annotated_filepath", return_value=image_path):
                without_mask = RuiImageUploadLoader.IS_CHANGED("uploaded.png", 0, False, mask_data="")
                with_mask = RuiImageUploadLoader.IS_CHANGED("uploaded.png", 0, False, mask_data="different-mask")
            self.assertNotEqual(without_mask, with_mask)

    def test_image_compare_writes_temp_previews(self):
        with tempfile.TemporaryDirectory() as directory:
            image_a = torch.zeros((1, 8, 12, 3), dtype=torch.float32)
            image_b = torch.ones((1, 8, 12, 3), dtype=torch.float32)
            with patch("ComfyUI_Rui.rui_nodes.image_compare.folder_paths.get_temp_directory", return_value=directory):
                result = RuiImageCompare().compare_images(image_a, image_b)

            self.assertEqual(len(result["ui"]["a_images"]), 1)
            self.assertEqual(len(result["ui"]["b_images"]), 1)
            for side in ("a_images", "b_images"):
                info = result["ui"][side][0]
                self.assertEqual(info["type"], "temp")
                self.assertTrue(info["filename"].endswith(".jpg"))
                self.assertTrue(os.path.isfile(os.path.join(directory, info["subfolder"], info["filename"])))

    def test_image_compare_preserves_alpha(self):
        with tempfile.TemporaryDirectory() as directory:
            image = torch.ones((1, 8, 12, 4), dtype=torch.float32)
            image[..., 3] = 0.5
            with patch("ComfyUI_Rui.rui_nodes.image_compare.folder_paths.get_temp_directory", return_value=directory):
                result = RuiImageCompare().compare_images(image, None)

            info = result["ui"]["a_images"][0]
            self.assertTrue(info["filename"].endswith(".png"))
            with Image.open(os.path.join(directory, info["filename"])) as preview:
                self.assertEqual(preview.format, "PNG")
                self.assertEqual(preview.mode, "RGBA")
                self.assertEqual(preview.getchannel("A").getextrema(), (127, 127))

    def test_image_compare_resizes_extreme_aspect_ratio(self):
        with tempfile.TemporaryDirectory() as directory:
            image = torch.ones((1, 1, 10, 3), dtype=torch.float32)
            with patch("ComfyUI_Rui.rui_nodes.image_compare.folder_paths.get_temp_directory", return_value=directory):
                info = RuiImageCompare()._save_compressed(image, max_side=4)[0]
            with Image.open(os.path.join(directory, info["filename"])) as preview:
                self.assertEqual(preview.size, (4, 1))


if __name__ == "__main__":
    unittest.main()
