class AnyType(str):
    def __ne__(self, value):
        return False


ANY = AnyType("*")


class RuiSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "label": ("STRING", {"default": "0"}),
                "_rui_settings": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "select"
    CATEGORY = "Rui/UI"

    def select(self, label, _rui_settings=""):
        try:
            return (int(label),)
        except (ValueError, TypeError):
            return (0,)


class RuiTitle:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    OUTPUT_NODE = False
    FUNCTION = "execute"
    CATEGORY = "Rui/UI"

    def execute(self):
        return ()


class RuiText:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = (ANY, "STRING")
    RETURN_NAMES = ("text", "show_help")
    FUNCTION = "get_text"
    CATEGORY = "Rui/Text"

    def get_text(self, text):
        return (text, "https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes/wiki/Other-Nodes#cr-text")


class RuiUniversalSlider:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("FLOAT", {
                    "default": 0.50,
                    "min": -999999,
                    "max": 999999,
                    "step": 0.01,
                    "display": "slider",
                }),
            },
            "hidden": {
                "output_type": (["float", "int"], {"default": "float"}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "Rui/UI"

    def execute(self, value, output_type="float"):
        processed_value = round(float(value), 10)
        if output_type == "int":
            return (int(round(processed_value)),)
        return (processed_value,)

    @classmethod
    def IS_CHANGED(cls, value, output_type="float"):
        processed_value = round(float(value), 10)
        if output_type == "int":
            return int(round(processed_value))
        return processed_value


class RuiIntToBoolean:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {"default": 0, "min": -2147483648, "max": 2147483647}),
                "invert": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "convert"
    CATEGORY = "Rui/Logic"

    def convert(self, value=0, invert=False):
        result = bool(value)
        return (not result if invert else result,)


NODE_CLASS_MAPPINGS = {
    "RuiUniversalSlider": RuiUniversalSlider,
    "RuiSelector": RuiSelector,
    "RuiTitle": RuiTitle,
    "RuiText": RuiText,
    "RuiIntToBoolean": RuiIntToBoolean,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RuiUniversalSlider": "Rui Universal Slider",
    "RuiSelector": "Rui Selector",
    "RuiTitle": "Rui Title",
    "RuiText": "Rui Text",
    "RuiIntToBoolean": "Rui Integer To Boolean",
}
