import { app } from "../../../scripts/app.js";
import { ruiT } from "./rui_i18n.js";

app.registerExtension({
    name: "rui.ImagePadding",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RuiResizeAndPadImage" && nodeData.name !== "RuiRemoveImagePadding") return;

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            if (!this.inputs.some(input => input.name === "input_mask")) {
                this.addInput("input_mask", "MASK", { localized_name: ruiT("输入遮罩", "Input mask") });
            }
            if (!this.outputs.some(output => output.name === "output_mask")) {
                this.addOutput("output_mask", "MASK", { localized_name: ruiT("输出遮罩", "Output mask") });
            }
            return result;
        };
    },
});
