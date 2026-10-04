import sys
import unittest
from pathlib import Path

import torch


COMFY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(COMFY_ROOT))
sys.path.insert(0, str(COMFY_ROOT / "custom_nodes"))

import ComfyUI_Rui
from ComfyUI_Rui.rui_nodes.image_crop_stitch import RuiMaskSquareCrop, RuiMaskStitch


class MaskCropStitchTests(unittest.TestCase):
    def setUp(self):
        self.crop = RuiMaskSquareCrop()
        self.stitch = RuiMaskStitch()

    def test_registration_and_defaults(self):
        self.assertIs(ComfyUI_Rui.NODE_CLASS_MAPPINGS["RuiMaskSquareCrop"], RuiMaskSquareCrop)
        self.assertIs(ComfyUI_Rui.NODE_CLASS_MAPPINGS["RuiMaskStitch"], RuiMaskStitch)
        inputs = self.crop.INPUT_TYPES()["required"]
        self.assertEqual(inputs["crop_size"][1]["default"], 1024)
        self.assertEqual(inputs["context_pixels"][1]["default"], 128)
        self.assertEqual(self.stitch.INPUT_TYPES()["required"]["feather_pixels"][1]["default"], 32)

    def test_disconnected_regions_crop_original_pixels_without_shift(self):
        image = torch.arange(160 * 192 * 3, dtype=torch.float32).reshape(1, 160, 192, 3) / 2**18
        mask = torch.zeros(160, 192)
        mask[40:50, 70:80] = 1
        mask[80:90, 120:130] = 1
        cropped, cropped_mask, info, side, has_mask = self.crop.crop(image, mask, 70, 8, 0)
        self.assertEqual(side, 96)
        self.assertTrue(has_mask)
        self.assertEqual((info["regions"][0]["x"], info["regions"][0]["y"]), (52, 17))
        self.assertTrue(torch.equal(cropped, image[:, 17:113, 52:148]))
        self.assertTrue(torch.equal(cropped_mask, mask[17:113, 52:148][None]))
        self.assertTrue(torch.equal(self.stitch.stitch(image, cropped, info, 8)[0], image))
        enlarged = cropped.repeat_interleave(2, 1).repeat_interleave(2, 2)
        self.assertTrue(torch.equal(self.stitch.stitch(image, enlarged, info, 8)[0], image))

    def test_large_mask_grows_crop_to_include_context(self):
        image = torch.zeros(1, 1000, 2000, 3)
        mask = torch.zeros(1, 1000, 2000)
        mask[:, 100:900, 200:1600] = 1
        cropped, cropped_mask, info, side, _ = self.crop.crop(image, mask, 1024, 128, 0)
        self.assertEqual(side, 1664)
        self.assertEqual(tuple(cropped.shape), (1, 1664, 1664, 3))
        self.assertEqual(cropped_mask.sum().item(), 1400 * 800)
        self.assertEqual(info["regions"][0]["mask_bounds"], (200, 100, 1600, 900))

    def test_window_moves_inside_image_near_edge(self):
        image = torch.rand(1, 160, 192, 3)
        mask = torch.zeros(1, 160, 192)
        mask[:, 2:6, 180:186] = 1
        cropped, _, info, side, _ = self.crop.crop(image, mask, 64, 8, 0)
        self.assertEqual(side, 64)
        self.assertEqual((info["regions"][0]["x"], info["regions"][0]["y"]), (128, 0))
        self.assertTrue(torch.equal(cropped, image[:, :64, 128:192]))
        self.assertTrue(torch.equal(self.stitch.stitch(image, cropped, info, 32)[0], image))

    def test_padding_extends_edges_and_is_removed_before_stitching(self):
        image = torch.arange(10 * 20 * 3, dtype=torch.float32).reshape(1, 10, 20, 3) / 1024
        mask = torch.ones(10, 20)
        cropped, cropped_mask, info, side, _ = self.crop.crop(image, mask, 32, 0, 0)
        self.assertEqual(side, 32)
        self.assertEqual((info["regions"][0]["x"], info["regions"][0]["y"]), (-6, -11))
        self.assertTrue(torch.equal(cropped[:, 11:21, 6:26], image))
        self.assertTrue(torch.equal(cropped[0, 0, 0], image[0, 0, 0]))
        self.assertTrue(torch.equal(cropped[0, -1, -1], image[0, -1, -1]))
        self.assertEqual(cropped_mask.sum().item(), 200)
        self.assertEqual(cropped_mask[0, 0, 0].item(), 0)
        generated = (cropped + 0.125).repeat_interleave(2, 1).repeat_interleave(2, 2)
        output, = self.stitch.stitch(image, generated, info, 4)
        self.assertTrue(torch.equal(output, image + 0.125))

    def test_mask_expansion_changes_editable_outline(self):
        image = torch.zeros(1, 128, 160, 3)
        mask = torch.zeros(1, 128, 160)
        mask[:, 50:60, 70:80] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 64, 6, 3)
        self.assertEqual(info["regions"][0]["mask_bounds"], (67, 47, 83, 63))
        output, = self.stitch.stitch(image, torch.ones_like(cropped), info, 0)
        expected = image.clone()
        expected[:, 47:63, 67:83] = 1
        self.assertTrue(torch.equal(output, expected))
        self.assertEqual(mask.sum().item(), 100)
        self.assertTrue(torch.equal(image, torch.zeros_like(image)))

    def test_feather_extends_outward_and_keeps_core_and_exterior_exact(self):
        image = torch.zeros(1, 100, 100, 3)
        mask = torch.zeros(1, 100, 100)
        mask[:, 48:52, 48:52] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        output, = self.stitch.stitch(image, torch.ones_like(cropped), info, 4)
        self.assertTrue(torch.all(output[:, 48:52, 48:52] == 1))
        values = output[0, 49, 44:48, 0]
        self.assertTrue(torch.all(values > 0))
        self.assertTrue(torch.all(values < 1))
        self.assertTrue(torch.all(values[1:] > values[:-1]))
        self.assertEqual(output[0, 49, 43, 0].item(), 0)
        self.assertEqual(output[0, 45, 45, 0].item(), 0)
        self.assertTrue(torch.equal(output[:, :44], image[:, :44]))
        self.assertTrue(torch.equal(output[:, 56:], image[:, 56:]))
        self.assertTrue(torch.equal(output[:, :, :44], image[:, :, :44]))
        self.assertTrue(torch.equal(output[:, :, 56:], image[:, :, 56:]))

    def test_gray_mask_retains_strength(self):
        image = torch.zeros(1, 96, 96, 3)
        mask = torch.zeros(96, 96)
        mask[45:50, 45:50] = 0.4
        cropped, _, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        output, = self.stitch.stitch(image, torch.ones_like(cropped), info, 3)
        self.assertTrue(torch.all(output[:, 45:50, 45:50] == 0.4))
        self.assertGreater(output[0, 46, 44, 0].item(), 0)
        self.assertLess(output[0, 46, 44, 0].item(), 0.4)

    def test_smaller_generated_image_scales_back_to_crop(self):
        image = torch.zeros(1, 96, 96, 3)
        mask = torch.zeros(1, 96, 96)
        mask[:, 40:50, 40:50] = 1
        _, _, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        output, = self.stitch.stitch(image, torch.full((1, 16, 16, 3), 0.75), info, 0)
        self.assertTrue(torch.all(output[:, 40:50, 40:50] == 0.75))
        self.assertTrue(torch.equal(output[:, :40], image[:, :40]))

    def test_each_batch_image_uses_its_own_coordinates(self):
        image = torch.stack((torch.full((128, 160, 3), 0.1), torch.full((128, 160, 3), 0.2)))
        mask = torch.zeros(2, 128, 160)
        mask[0, 20:30, 20:30] = 1
        mask[1, 90:100, 120:130] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 64, 8, 0)
        generated = torch.stack((torch.full_like(cropped[0], 0.6), torch.full_like(cropped[1], 0.9)))
        output, = self.stitch.stitch(image, generated, info, 0)
        expected = image.clone()
        expected[0, 20:30, 20:30] = 0.6
        expected[1, 90:100, 120:130] = 0.9
        self.assertTrue(torch.equal(output, expected))
        with self.assertRaisesRegex(ValueError, "Each cropped region"):
            self.stitch.stitch(image, generated[:1], info, 0)

    def test_single_image_accepts_multiple_candidate_generations(self):
        image = torch.full((1, 96, 96, 3), 0.25)
        mask = torch.zeros(1, 96, 96)
        mask[:, 40:50, 40:50] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        generated = torch.cat([torch.full_like(cropped, value) for value in (0.3, 0.6, 0.9)])
        output, = self.stitch.stitch(image, generated, info, 0)
        self.assertEqual(tuple(output.shape), (3, 96, 96, 3))
        for i, value in enumerate((0.3, 0.6, 0.9)):
            expected = image[0].clone()
            expected[40:50, 40:50] = value
            self.assertTrue(torch.equal(output[i], expected))

    def test_image_and_mask_batch_broadcasting(self):
        image = torch.zeros(2, 96, 96, 3)
        mask = torch.zeros(1, 96, 96)
        mask[:, 40:50, 40:50] = 1
        cropped, cropped_mask, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        self.assertEqual(cropped.shape[0], 2)
        self.assertTrue(torch.equal(cropped_mask[0], cropped_mask[1]))
        self.assertEqual([r["source_index"] for r in info["regions"]], [0, 1])
        masks = mask.repeat(2, 1, 1)
        cropped, _, info, _, _ = self.crop.crop(image[:1], masks, 32, 8, 0)
        self.assertEqual([r["source_index"] for r in info["regions"]], [0, 0])
        self.assertEqual(self.stitch.stitch(image[:1], cropped, info, 0)[0].shape[0], 2)
        with self.assertRaisesRegex(ValueError, "batches must match"):
            self.crop.crop(image, mask.repeat(3, 1, 1), 32, 8, 0)

    def test_empty_masks_keep_original_including_mixed_batches(self):
        image = torch.rand(2, 96, 96, 3)
        mask = torch.zeros(2, 96, 96)
        cropped, _, info, _, has_mask = self.crop.crop(image, mask, 32, 8, 0)
        self.assertFalse(has_mask)
        self.assertTrue(torch.equal(self.stitch.stitch(image, torch.ones_like(cropped), info, 32)[0], image))
        mask[1, 40:50, 40:50] = 1
        cropped, _, info, _, has_mask = self.crop.crop(image, mask, 32, 8, 0)
        self.assertTrue(has_mask)
        output, = self.stitch.stitch(image, torch.ones_like(cropped), info, 0)
        self.assertTrue(torch.equal(output[0], image[0]))
        self.assertTrue(torch.all(output[1, 40:50, 40:50] == 1))

    def test_rgba_original_preserves_alpha_and_float_dtype(self):
        image = torch.rand(1, 96, 128, 4, dtype=torch.float64)
        mask = torch.zeros(1, 96, 128)
        mask[:, 40:50, 50:60] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 32, 8, 0)
        generated = torch.ones_like(cropped[..., :3]).repeat_interleave(2, 1).repeat_interleave(2, 2)
        output, = self.stitch.stitch(image, generated, info, 4)
        self.assertEqual(output.dtype, torch.float64)
        self.assertTrue(torch.equal(output[..., 3], image[..., 3]))
        self.assertTrue(torch.all(output[:, 40:50, 50:60, :3] == 1))
        self.assertTrue(torch.equal(output[:, :36], image[:, :36]))

    def test_low_resolution_mask_is_aligned_to_original(self):
        image = torch.zeros(1, 64, 64, 3)
        cropped, mask, _, side, _ = self.crop.crop(image, torch.ones(8, 8), 32, 0, 0)
        self.assertEqual(side, 64)
        self.assertEqual(tuple(cropped.shape), (1, 64, 64, 3))
        self.assertTrue(torch.all(mask == 1))

    def test_stitch_reports_insufficient_context_and_wrong_geometry(self):
        image = torch.zeros(1, 192, 192, 3)
        mask = torch.zeros(1, 192, 192)
        mask[:, 80:112, 80:112] = 1
        cropped, _, info, _, _ = self.crop.crop(image, mask, 32, 0, 0)
        with self.assertRaisesRegex(ValueError, "Increase context_pixels"):
            self.stitch.stitch(image, cropped, info, 1)
        with self.assertRaisesRegex(ValueError, "same original image"):
            self.stitch.stitch(image[:, :190], cropped, info, 0)
        with self.assertRaisesRegex(ValueError, "Keep the generated image square"):
            self.stitch.stitch(image, cropped[:, :, :16], info, 0)


if __name__ == "__main__":
    unittest.main()
