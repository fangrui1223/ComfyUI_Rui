import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import torch
from PIL import Image


COMFY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(COMFY_ROOT))
sys.path.insert(0, str(COMFY_ROOT / "custom_nodes"))

import nodes
from execution import CacheType, PromptExecutor
from ComfyUI_Rui.rui_nodes.operations import RuiLightForEnd, RuiLightForStart, RuiUniversalImageSaver


class LoopImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"index": ("INT",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "make_image"

    def make_image(self, index):
        return (torch.full((1, 2, 3, 3), index / 10),)


class SavedImageProbe:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "index": ("INT",), "save_dir": ("STRING",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "check_saved"

    def check_saved(self, images, index, save_dir):
        filename = "loop.png" if index == 0 else f"loop_{index:03d}.png"
        assert (Path(save_dir) / filename).is_file(), "Downstream ran before the image was saved"
        torch.testing.assert_close(images, torch.full((1, 2, 3, 3), index / 10), rtol=0, atol=0)
        return (images,)


class UniversalImageSaverTests(unittest.TestCase):
    def test_all_formats_pass_original_rgba_batch_without_changing_precision(self):
        images = torch.linspace(0, 1, 2 * 3 * 4 * 4).reshape(2, 3, 4, 4)
        before = images.clone()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("folder_paths.get_output_directory", return_value=str(root / "comfy-output")):
                for image_format in ("jpg", "png", "webp"):
                    with self.subTest(format=image_format):
                        target = root / image_format
                        result = RuiUniversalImageSaver().save_images(
                            images, str(target), "", "frame", save_format=image_format, copy_to_comfy_output=False)
                        self.assertIs(result["result"][0], images)
                        self.assertTrue(torch.equal(images, before))
                        self.assertEqual(result["ui"]["images"], [])
                        saved = sorted(target.glob(f"frame_batch_*.{image_format}"))
                        self.assertEqual(len(saved), 2)
                        for file in saved:
                            with Image.open(file) as image:
                                self.assertEqual(image.size, (4, 3))
                                self.assertEqual(image.mode, "RGB" if image_format == "jpg" else "RGBA")
                self.assertFalse((root / "comfy-output").exists())
        self.assertEqual(RuiUniversalImageSaver.RETURN_TYPES, ("IMAGE",))
        self.assertTrue(RuiUniversalImageSaver.OUTPUT_NODE)

    def test_history_copy_remains_available_with_image_output(self):
        images = torch.zeros((1, 2, 3, 3))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "comfy-output"
            with patch("folder_paths.get_output_directory", return_value=str(output)):
                result = RuiUniversalImageSaver().save_images(
                    images, str(root / "custom"), "batch", "frame", save_format="png")
            self.assertIs(result["result"][0], images)
            self.assertEqual(len(result["ui"]["images"]), 1)
            preview = result["ui"]["images"][0]
            self.assertEqual(preview["type"], "output")
            self.assertTrue((output / preview["subfolder"] / preview["filename"]).is_file())
            self.assertTrue((root / "custom" / "batch" / "frame.png").is_file())

    def test_invalid_inputs_fail_instead_of_passing_an_unsaved_image(self):
        images = torch.zeros((1, 2, 3, 3))
        for directory in (None, "", "   "):
            with self.subTest(directory=directory), self.assertRaisesRegex(ValueError, "保存根目录"):
                RuiUniversalImageSaver().save_images(images, directory, "", "frame")
        with self.assertRaisesRegex(ValueError, "未接收到图像"):
            RuiUniversalImageSaver().save_images(None, "unused", "", "frame")

    def test_write_failure_does_not_produce_a_downstream_result(self):
        images = torch.zeros((1, 2, 3, 3))
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(Image.Image, "save", side_effect=OSError("disk full")):
                with self.assertRaisesRegex(OSError, "disk full"):
                    RuiUniversalImageSaver().save_images(images, directory, "", "frame", copy_to_comfy_output=False)


class SaverLoopTests(unittest.IsolatedAsyncioTestCase):
    async def test_three_rounds_save_before_downstream_and_loop_completion(self):
        server = SimpleNamespace(client_id=None, send_sync=lambda *args: None)
        executor = PromptExecutor(server, cache_type=CacheType.CLASSIC, cache_args={"ram": 0, "ram_inactive": 0})
        classes = {
            "RuiLightForStart": RuiLightForStart,
            "RuiLightForEnd": RuiLightForEnd,
            "RuiUniversalImageSaver": RuiUniversalImageSaver,
            "RuiTestLoopImage": LoopImage,
            "RuiTestSavedImageProbe": SavedImageProbe,
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = str(root / "saved")
            prompt = {
                "start": {"class_type": "RuiLightForStart", "inputs": {"total": 3, "start_index": 0}},
                "image": {"class_type": "RuiTestLoopImage", "inputs": {"index": ["start", 1]}},
                "save": {"class_type": "RuiUniversalImageSaver", "inputs": {
                    "images": ["image", 0], "save_dir": target, "folder_name": "", "save_name": "loop",
                    "save_format": "png", "quality": 95, "copy_to_comfy_output": False,
                }},
                "probe": {"class_type": "RuiTestSavedImageProbe", "inputs": {
                    "images": ["save", 0], "index": ["start", 1], "save_dir": target,
                }},
                "end": {"class_type": "RuiLightForEnd", "inputs": {
                    "flow": ["start", 0], "index": ["start", 1], "total": ["start", 2], "loop_done": ["probe", 0],
                }},
            }
            with patch.dict(nodes.NODE_CLASS_MAPPINGS, classes), patch("folder_paths.get_output_directory", return_value=str(root / "comfy-output")):
                await executor.execute_async(prompt, "rui-saver-loop-test", execute_outputs=["save", "end"])
            errors = [message for event, message in executor.status_messages if event == "execution_error"]
            self.assertEqual(errors, [])
            self.assertTrue(executor.success)
            self.assertEqual(sorted(file.name for file in Path(target).glob("*.png")), ["loop.png", "loop_001.png", "loop_002.png"])
