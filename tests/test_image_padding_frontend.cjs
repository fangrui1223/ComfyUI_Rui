const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../web/js/rui_image_padding.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "");

function nodeClass(type) {
    let extension;
    vm.runInNewContext(source, {
        app: { registerExtension(value) { extension = value; } },
        ruiT: zh => zh,
    });
    class Node {
        onConfigure(data) { this.restoredValues = data.widgets_values; return "configured"; }
        addInput(name, type, options) { this.inputs.push({ name, type, ...options }); }
        addOutput(name, type, options) { this.outputs.push({ name, type, ...options }); }
    }
    extension.beforeRegisterNodeDef(Node, { name: type });
    return Node;
}

test("an old resize node with a converted size input keeps its links and gains mask ports", () => {
    const Node = nodeClass("RuiResizeAndPadImage");
    const node = new Node();
    node.inputs = [{ name: "input_image", type: "IMAGE", link: 11 },
                   { name: "target_size", type: "INT", link: 12, widget: { name: "target_size" } }];
    node.outputs = [{ name: "output_image", type: "IMAGE", links: [21] },
                    { name: "image_info", type: "IMAGE_INFO", links: [22] },
                    { name: "canvas_width", type: "INT", links: [23] },
                    { name: "canvas_height", type: "INT", links: [24] }];
    const input = node.inputs[1];
    const outputs = node.outputs.slice();
    assert.equal(node.onConfigure({ widgets_values: [32, "nearest_ratio", "lanczos", true] }), "configured");
    assert.equal(node.inputs[1], input);
    assert.equal(node.inputs[1].link, 12);
    assert.deepEqual(node.outputs.slice(0, 4), outputs);
    assert.equal(node.inputs[2].name, "input_mask");
    assert.equal(node.inputs[2].type, "MASK");
    assert.equal(node.outputs[4].name, "output_mask");
    assert.equal(node.outputs[4].type, "MASK");
    assert.deepEqual(node.restoredValues, [32, "nearest_ratio", "lanczos", true]);
    node.onConfigure({ widgets_values: node.restoredValues });
    assert.equal(node.inputs.length, 3);
    assert.equal(node.outputs.length, 5);
});

test("an old crop node keeps image and metadata links while gaining mask ports", () => {
    const Node = nodeClass("RuiRemoveImagePadding");
    const node = new Node();
    node.inputs = [{ name: "input_image", type: "IMAGE", link: 31 },
                   { name: "image_info", type: "IMAGE_INFO", link: 32 }];
    node.outputs = [{ name: "output_image", type: "IMAGE", links: [41] }];
    node.onConfigure({ widgets_values: [true] });
    assert.equal(node.inputs[1].link, 32);
    assert.deepEqual(node.outputs[0].links, [41]);
    assert.equal(node.inputs[2].name, "input_mask");
    assert.equal(node.outputs[1].name, "output_mask");
});

test("new mask connections survive configuration without duplicate ports", () => {
    const Node = nodeClass("RuiResizeAndPadImage");
    const node = new Node();
    node.inputs = [{ name: "input_image", type: "IMAGE", link: 11 },
                   { name: "input_mask", type: "MASK", link: 12 }];
    node.outputs = [{ name: "output_mask", type: "MASK", links: [21] }];
    node.onConfigure({ widgets_values: [] });
    assert.equal(node.inputs.length, 2);
    assert.equal(node.inputs[1].link, 12);
    assert.equal(node.outputs.length, 1);
    assert.deepEqual(node.outputs[0].links, [21]);
});
