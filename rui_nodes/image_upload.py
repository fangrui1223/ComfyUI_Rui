import os
import io
import hashlib
import base64
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths
import node_helpers
from aiohttp import web
from server import PromptServer

# ---------- Rui路由安全装饰器 ----------
import asyncio as _rui_asyncio
import functools as _rui_ft
import traceback as _rui_tb
try:
    from aiohttp import web as _rui_web
except Exception:
    import types as _rui_t
    _rui_web = _rui_t.ModuleType('aiohttp.web')
    class _R:
        def __init__(self, *a, **kw): pass
    _rui_web.Response = _R
    _rui_web.json_response = lambda *a, **kw: {'_json': (a, kw)}
    class _HTTPE(Exception): pass
    _rui_web.HTTPException = _HTTPE

try:
    from .. import rui_safe_handler as _xsh, _safe_dir as _xsd
    rui_safe_handler = _xsh
    _safe_dir = _xsd
except Exception:
    def rui_safe_handler(fn):
        def _fmt_resp(exc, status=500):
            tb_s = ''.join(_rui_tb.format_exception(type(exc), exc, exc.__traceback__))
            try:
                return _rui_web.json_response(
                    {'error': '%s: %s' % (type(exc).__name__, exc), 'traceback': tb_s},
                    status=status,
                )
            except Exception:
                return _rui_web.Response(status=500, text='%s: %s\n\n%s' % (type(exc).__name__, exc, tb_s))
        if _rui_asyncio.iscoroutinefunction(fn):
            @_rui_ft.wraps(fn)
            async def _aw(*a, **kw):
                try:
                    return await fn(*a, **kw)
                except _rui_web.HTTPException:
                    raise
                except BaseException as e:
                    print('[Rui路由异常] %s: %s: %s' % (fn.__name__, type(e).__name__, e))
                    _rui_tb.print_exc()
                    return _fmt_resp(e)
            return _aw
        else:
            @_rui_ft.wraps(fn)
            def _sw(*a, **kw):
                try:
                    return fn(*a, **kw)
                except _rui_web.HTTPException:
                    raise
                except BaseException as e:
                    print('[Rui路由异常] %s: %s: %s' % (fn.__name__, type(e).__name__, e))
                    _rui_tb.print_exc()
                    return _fmt_resp(e)
            return _sw

    def _safe_dir(fn_name, fallback_subdir):
        import folder_paths as _fp
        d = getattr(_fp, fn_name)()
        if d:
            os.makedirs(d, exist_ok=True)
            return d
        fallback = os.path.join(getattr(_fp, 'models_dir', os.getcwd()), fallback_subdir)
        os.makedirs(fallback, exist_ok=True)
        print('[Rui] folder_paths.%s() 返回 None，兜底使用: %s' % (fn_name, fallback))
        return fallback
# ---------------- END ----------------


def _routes():
    """防御性取 routes：ComfyUI 正常启动时 PromptServer 已有 instance；导入测试阶段则返回临时兜底。"""
    inst = getattr(PromptServer, 'instance', None)
    if inst is not None:
        return inst.routes
    # 兜底：提供最小 duck-typed 路由对象，只保证装饰器语法不炸
    class _Fallback:
        def _noop(self, path):
            def deco(fn): return fn
            return deco
        post = put = delete = patch = get = _noop
    return _Fallback()


routes = _routes()

_thumb_cache_dir = None
DEFAULT_THUMB_SIZE = 256


def _get_thumb_cache_dir():
    global _thumb_cache_dir
    if _thumb_cache_dir is None:
        _thumb_cache_dir = os.path.join(_safe_dir('get_temp_directory',   'temp'), "rui_thumbs")
        os.makedirs(_thumb_cache_dir, exist_ok=True)
    return _thumb_cache_dir


def _get_thumb_cache_key(filename, size):
    try:
        filename = _normalize_annotated_filename(filename)
        fpath = folder_paths.get_annotated_filepath(filename)
        if not fpath or not os.path.isfile(fpath):
            return None
        digest = hashlib.sha256()
        digest.update(str(size).encode("ascii"))
        digest.update(b"\0")
        with open(fpath, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest() + ".jpg"
    except OSError:
        return None


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".svg"}


def _normalize_annotated_filename(name: str) -> str:
    if not name:
        return name
    for suffix in ("[output]", "[input]", "[temp]"):
        spaced = " " + suffix
        if name.endswith(suffix) and not name.endswith(spaced):
            return name[: -len(suffix)] + spaced
    return name


def _contained_path(base_dir, relative_name):
    base_path = os.path.realpath(base_dir)
    target_path = os.path.realpath(os.path.join(base_path, relative_name))
    if os.path.commonpath((base_path, target_path)) != base_path:
        return None
    return target_path


@routes.get("/rui_input_files")
@rui_safe_handler
async def rui_input_files(request):
    input_dir = _safe_dir('get_input_directory',  'input')
    if not os.path.isdir(input_dir):
        return web.json_response([])

    files = []
    try:
        for f in os.listdir(input_dir):
            full_path = os.path.join(input_dir, f)
            if os.path.isfile(full_path):
                ext = os.path.splitext(f)[1].lower()
                if ext in IMAGE_EXTENSIONS:
                    stat = os.stat(full_path)
                    files.append({
                        "name": f,
                        "type": "image",
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    })
    except Exception as e:
        return web.Response(status=500, text=str(e))

    files.sort(key=lambda x: x["name"].lower())
    return web.json_response(files)


@routes.get("/rui_output_files")
@rui_safe_handler
async def rui_output_files(request):
    output_dir = _safe_dir('get_output_directory', 'output')
    if not os.path.isdir(output_dir):
        return web.json_response([])

    files = []
    try:
        for root, dirs, fnames in os.walk(output_dir):
            for f in fnames:
                ext = os.path.splitext(f)[1].lower()
                if ext in IMAGE_EXTENSIONS:
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, output_dir)
                    stat = os.stat(full_path)
                    files.append({
                        "name": rel_path.replace("\\", "/"),
                        "type": "image",
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    })
    except Exception as e:
        return web.Response(status=500, text=str(e))

    files.sort(key=lambda x: x["name"].lower())
    return web.json_response(files)


@routes.get("/rui_image_loader_thumb")
@rui_safe_handler
async def rui_image_loader_thumb(request):
    filename = request.rel_url.query.get("filename", "")
    size = int(request.rel_url.query.get("size", str(DEFAULT_THUMB_SIZE)))

    if not filename:
        return web.Response(status=400, text="filename required")

    filename = _normalize_annotated_filename(filename)
    image_path = folder_paths.get_annotated_filepath(filename)
    if not image_path or not os.path.isfile(image_path):
        return web.Response(status=404, text="image not found")

    cache_dir = _get_thumb_cache_dir()
    cache_key = _get_thumb_cache_key(filename, size)
    cache_path = os.path.join(cache_dir, cache_key) if cache_key else None

    etag = cache_key or None
    if_none_match = request.headers.get("If-None-Match", "")
    if etag and if_none_match == etag:
        return web.Response(status=304)

    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path, "rb") as f:
                data = f.read()
            headers = {"Cache-Control": "no-cache"}
            if etag:
                headers["ETag"] = etag
            return web.Response(
                body=data,
                content_type="image/jpeg",
                headers=headers,
            )
        except Exception:
            pass

    try:
        img = node_helpers.pillow(Image.open, image_path)
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        img.thumbnail((size, size), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90, optimize=False)
        buf.seek(0)
        data = buf.getvalue()

        if cache_path:
            try:
                with open(cache_path, "wb") as f:
                    f.write(data)
            except Exception:
                pass

        headers = {"Cache-Control": "no-cache"}
        if etag:
            headers["ETag"] = etag
        return web.Response(
            body=data,
            content_type="image/jpeg",
            headers=headers,
        )
    except Exception as e:
        return web.Response(status=500, text=str(e))


@routes.post("/rui_delete_images")
@rui_safe_handler
async def rui_delete_images(request):
    try:
        data = await request.json()
    except Exception:
        return web.Response(status=400, text="invalid json")

    filenames = data.get("files", [])
    source = data.get("source", "input")

    if source not in ("input", "output"):
        return web.Response(status=400, text="invalid source")

    if source == "input":
        base_dir = _safe_dir('get_input_directory',  'input')
    else:
        base_dir = _safe_dir('get_output_directory', 'output')

    deleted = []
    errors = []

    for fn in filenames:
        try:
            if not fn:
                continue
            fn_clean = fn
            for suffix in (" [input]", " [output]", " [temp]"):
                if fn_clean.endswith(suffix):
                    fn_clean = fn_clean[: -len(suffix)]
                    break

            full_path = _contained_path(base_dir, fn_clean)
            if full_path is None:
                errors.append(f"{fn}: path traversal")
                continue
            if not os.path.isfile(full_path):
                errors.append(f"{fn}: not found")
                continue
            os.remove(full_path)
            deleted.append(fn)
        except Exception as e:
            errors.append(f"{fn}: {e}")

    return web.json_response({"deleted": deleted, "errors": errors})


@routes.post("/rui_copy_output_to_input")
@rui_safe_handler
async def rui_copy_output_to_input(request):
    try:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"copied": [], "errors": ["invalid json"]}, status=400)

        filenames = data.get("files", [])
        output_dir = _safe_dir('get_output_directory', 'output')
        input_dir = _safe_dir('get_input_directory',  'input')

        copied = []
        errors = []

        import shutil

        for fn in filenames:
            try:
                if not fn:
                    continue

                src_path = _contained_path(output_dir, fn)
                if src_path is None:
                    errors.append(f"{fn}: path traversal")
                    continue
                if not os.path.isfile(src_path):
                    errors.append(f"{fn}: not found")
                    continue

                basename = os.path.basename(fn)
                dst_name = basename
                dst_path = os.path.join(input_dir, dst_name)

                if os.path.exists(dst_path):
                    copied.append({"original": fn, "input_name": dst_name})
                    continue

                shutil.copy2(src_path, dst_path)
                copied.append({"original": fn, "input_name": dst_name})
            except Exception as e:
                errors.append(f"{fn}: {e}")

        return web.json_response({"copied": copied, "errors": errors})
    except Exception as e:
        return web.json_response({"copied": [], "errors": [str(e)]}, status=500)


class RuiImageUploadLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_list": ("STRING", {"default": ""}),
                "index": ("INT", {"default": 0, "min": 0, "max": 999999}),
                "batch_mode": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "mask_data": ("STRING", {"default": ""}),
                "upload_mode": ("STRING", {"default": "append"}),
                "source_names": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING")
    RETURN_NAMES = ("image", "mask", "source_filename", "source_stem")
    OUTPUT_IS_LIST = (True, False, False, False)
    FUNCTION = "load_images"
    CATEGORY = "Rui/Image/Load"

    def load_images(self, image_list, index, batch_mode, unique_id=None, mask_data="", upload_mode="append",
                    source_names=""):
        empty_mask = torch.zeros((1, 1), dtype=torch.float32)
        if not image_list or not image_list.strip():
            return ([], empty_mask, "", "")

        names = [n.strip() for n in image_list.split("\n") if n.strip()]
        if not names:
            return ([], empty_mask, "", "")

        original_names = [n.strip() for n in source_names.split("\n")]
        selected_index = max(0, min(int(index), len(names) - 1))
        selected_name = names[selected_index]
        if selected_index < len(original_names) and original_names[selected_index]:
            source_filename = os.path.basename(original_names[selected_index].replace("\\", "/"))
        else:
            clean_name = _normalize_annotated_filename(selected_name)
            for suffix in (" [input]", " [output]", " [temp]"):
                if clean_name.endswith(suffix):
                    clean_name = clean_name[:-len(suffix)]
                    break
            source_filename = os.path.basename(clean_name.replace("\\", "/"))
        source_stem = os.path.splitext(source_filename)[0]

        images = []
        for name in names:
            try:
                name_norm = _normalize_annotated_filename(name)
                image_path = folder_paths.get_annotated_filepath(name_norm)
                if not image_path or not os.path.isfile(image_path):
                    continue

                img = node_helpers.pillow(Image.open, image_path)
                img = ImageOps.exif_transpose(img)
                image = img.convert("RGB")
                image = np.array(image).astype(np.float32) / 255.0
                image = torch.from_numpy(image)[None,]
                images.append(image)
            except Exception:
                continue

        # 解析遮罩数据（单图模式使用第一张图的尺寸）
        # 语义约定：白色(255 / 1.0) = 用户绘制过的区域；黑色(0 / 0.0) = 未绘制区域
        # —— 无数据或失败时返回全黑(zeros)，代表"没画任何东西，没遮罩任何部分"
        def _decode_mask(mask_str, ref_h, ref_w):
            if ref_h <= 0 or ref_w <= 0:
                return torch.zeros((max(1, ref_h), max(1, ref_w)), dtype=torch.float32)
            if not mask_str:
                return torch.zeros((ref_h, ref_w), dtype=torch.float32)
            try:
                # 支持 "data:image/png;base64,xxx" 格式或纯 base64
                if mask_str.startswith("data:"):
                    _, b64part = mask_str.split(",", 1)
                    raw = base64.b64decode(b64part)
                else:
                    raw = base64.b64decode(mask_str)
                mask_pil = Image.open(io.BytesIO(raw)).convert("L")
                if mask_pil.size != (ref_w, ref_h):
                    mask_pil = mask_pil.resize((ref_w, ref_h), Image.LANCZOS)
                arr = np.array(mask_pil).astype(np.float32) / 255.0
                return torch.from_numpy(arr)
            except (ValueError, OSError, base64.binascii.Error):
                return torch.zeros((ref_h, ref_w), dtype=torch.float32)

        if batch_mode:
            if len(images) == 0:
                return ([], torch.zeros((1, 1), dtype=torch.float32), source_filename, source_stem)

            max_h = max(img.shape[1] for img in images)
            max_w = max(img.shape[2] for img in images)

            resized = []
            for img in images:
                _, h, w, _ = img.shape

                if h == max_h and w == max_w:
                    resized.append(img)
                    continue

                scale = max(max_h / h, max_w / w)
                new_h = int(round(h * scale))
                new_w = int(round(w * scale))

                img_pil = Image.fromarray((img[0].numpy() * 255).astype(np.uint8))
                img_pil = img_pil.resize((new_w, new_h), Image.LANCZOS)

                left = (new_w - max_w) // 2
                top = (new_h - max_h) // 2
                img_pil = img_pil.crop((left, top, left + max_w, top + max_h))

                arr = np.array(img_pil).astype(np.float32) / 255.0
                tensor = torch.from_numpy(arr)[None,]
                resized.append(tensor)

            batch = torch.cat(resized, dim=0)
            # 批次模式下遮罩尺寸对齐到批次尺寸，用 index 对应的图参考尺寸解码
            ref_h, ref_w = max_h, max_w
            mask_out = _decode_mask(mask_data, ref_h, ref_w)
            return ([batch], mask_out, source_filename, source_stem)
        else:
            # 列表模式：每张图独立放入列表，OUTPUT_IS_LIST 驱动下游 N 次执行
            # 遮罩对齐到 index 对应的图像尺寸
            idx = max(0, min(int(index), len(images) - 1)) if images else 0
            if len(images) > 0 and 0 <= idx < len(images):
                _, ref_h, ref_w, _ = images[idx].shape
            else:
                ref_h, ref_w = 1, 1
            mask_out = _decode_mask(mask_data, ref_h, ref_w)
            return (images, mask_out, source_filename, source_stem)

    @classmethod
    def IS_CHANGED(cls, image_list, index, batch_mode, unique_id=None, mask_data="", upload_mode="append",
                   source_names=""):
        digest = hashlib.sha256()
        names = [n.strip() for n in str(image_list or "").split("\n") if n.strip()]
        for name in names:
            normalized = _normalize_annotated_filename(name)
            image_path = folder_paths.get_annotated_filepath(normalized)
            digest.update(normalized.encode("utf-8"))
            digest.update(b"\0")
            if image_path and os.path.isfile(image_path):
                with open(image_path, "rb") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
            digest.update(b"\0")
        digest.update(str(index).encode("ascii"))
        digest.update(b"\0")
        digest.update(str(bool(batch_mode)).encode("ascii"))
        digest.update(b"\0")
        digest.update(str(mask_data or "").encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(source_names or "").encode("utf-8"))
        return digest.hexdigest()


NODE_CLASS_MAPPINGS = {
    "RuiImageUploadLoader": RuiImageUploadLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RuiImageUploadLoader": "Rui图像加载器",
}
