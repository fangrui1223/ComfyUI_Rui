const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../web/js/rui_image_compare.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
const plain = value => JSON.parse(JSON.stringify(value));
const output = (prefix, count = 1) => ({
    a_images: Array.from({ length: count }, (_, i) => ({ filename: `${prefix}-a${i}.jpg`, type: "temp", subfolder: "" })),
    b_images: Array.from({ length: count }, (_, i) => ({ filename: `${prefix}-b${i}.jpg`, type: "temp", subfolder: "" })),
});

async function runtime() {
    let extension;
    const requests = [];
    const app = {
        registerExtension(value) { extension = value; },
        getPreviewFormatParam() { return ""; },
        getRandParam() { return "&rand=test"; },
        canvas: { setDirty() {} },
        graph: { setDirtyCanvas() {} },
    };
    class PreviewImage {
        naturalWidth = 0;
        naturalHeight = 0;
        set src(url) { this.url = url; requests.push(this); }
        load() { this.naturalWidth = 640; this.naturalHeight = 480; this.onload(); }
        fail() { this.onerror(); }
    }
    vm.runInNewContext(source, {
        app, api: { apiURL: url => url }, ruiT: zh => zh, URLSearchParams,
        Image: PreviewImage, document: { addEventListener() {} },
        LiteGraph: { NODE_TITLE_HEIGHT: 30 },
    });
    class Node {
        constructor(id = 24) {
            this.id = id;
            this.type = "RuiImageCompare";
            this.size = [400, 450];
            this.pos = [0, 0];
            this.widgets = [{ name: "reduce_lag", value: false }, { name: "show_line", value: true }];
            this.onNodeCreated();
        }
        addCustomWidget(widget) { this.widgets.push(widget); return widget; }
        setSize(size) { this.size = size; }
        setDirtyCanvas() {}
        getWidgetOnPos() {}
        serialize() {
            const data = {
                id: this.id, type: this.type, size: this.size,
                widgets_values: this.widgets.map((w, i) => w.serializeValue ? w.serializeValue(this, i) : w.value),
            };
            this.onSerialize?.(data);
            return plain(data);
        }
        configure(data) {
            this.setSize(data.size);
            data.widgets_values.forEach((value, i) => { this.widgets[i].value = value; });
        }
    }
    await extension.beforeRegisterNodeDef(Node, { name: "RuiImageCompare" });
    function graph(nodes, id = "workflow") {
        const result = { id, _nodes: nodes, subgraphs: new Map() };
        nodes.forEach(node => { node.graph = result; });
        return result;
    }
    function activate(rootGraph, outputs) {
        app.rootGraph = rootGraph;
        app.nodeOutputs = outputs;
        extension.onNodeOutputsUpdated(outputs);
    }
    return { Node, graph, activate, extension, requests };
}

function canvas() {
    return {
        texts: [], images: [],
        measureText(text) { return { width: text.length * 7 }; },
        fillText(text) { this.texts.push(text); },
        drawImage(image) { this.images.push(image.url); },
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        save() {}, restore() {}, rect() {}, clip() {}, setLineDash() {},
    };
}

function choose(node, name) {
    node.canvasWidget.draw(canvas(), node, node.size[0], 70);
    const area = node.canvasWidget.hitAreas[name];
    area.onDown({}, [], node, area);
}

test("switching workflows restores each workflow's cached pair for the same node ID", async () => {
    const r = await runtime();
    const a = new r.Node();
    a.onExecuted(output("first"));
    const saved = a.serialize();
    const b = new r.Node();
    r.activate(r.graph([b], "second"), { 24: output("second") });
    assert.equal(b.canvasWidget.selected[0].source.filename, "second-a0.jpg");

    const restored = new r.Node();
    restored.configure(saved);
    assert.equal(restored.canvasWidget.selected.length, 0);
    r.activate(r.graph([restored], "first"), { 24: output("first") });
    assert.deepEqual(plain(restored.canvasWidget.selected.map(d => d.source.filename)), ["first-a0.jpg", "first-b0.jpg"]);
    restored.canvasWidget.selected.forEach(d => d.img.load());
    const ctx = canvas();
    restored.canvasWidget.draw(ctx, restored, 400, 70);
    assert.match(ctx.images[0], /first-a0.jpg/);
});

test("batch selection and swapped direction survive reconstruction and further selection", async () => {
    const r = await runtime();
    const node = new r.Node();
    node.onExecuted(output("batch", 3));
    choose(node, "A2");
    choose(node, "B3");
    node.canvasWidget._swapAB();
    choose(node, "B2");
    node.widgets[0].value = true;
    node.widgets[1].value = false;
    node.setSize([520, 610]);
    const saved = node.serialize();
    assert.deepEqual(saved.widgets_values[2], { images: [], selection: ["B2", "A2"] });
    assert.doesNotMatch(JSON.stringify(saved), /filename|\/view|naturalWidth/);

    const restored = new r.Node();
    restored.configure(saved);
    r.activate(r.graph([restored]), { 24: output("batch", 3) });
    assert.deepEqual(plain(restored.canvasWidget.selected.map(d => d.name)), ["B2", "A2"]);
    assert.equal(restored.widgets[0].value, true);
    assert.equal(restored.widgets[1].value, false);
    assert.deepEqual(plain(restored.size), [520, 610]);
    choose(restored, "A3");
    assert.deepEqual(plain(restored.canvasWidget.selected.map(d => d.name)), ["B2", "A3"]);
});

test("root and nested subgraphs resolve results by their containing graph", async () => {
    const r = await runtime();
    const root = new r.Node();
    const child = new r.Node();
    const nested = new r.Node();
    const rootGraph = r.graph([root, { type: "OtherNode" }]);
    const childGraph = r.graph([child], "11111111-1111-4111-8111-111111111111");
    const nestedGraph = r.graph([nested], "22222222-2222-4222-8222-222222222222");
    rootGraph.subgraphs.set(childGraph.id, childGraph);
    rootGraph.subgraphs.set(nestedGraph.id, nestedGraph);
    r.activate(rootGraph, {
        24: output("root"),
        [`${childGraph.id}:24`]: output("child"),
        [`${nestedGraph.id}:24`]: output("nested"),
    });
    assert.equal(root.canvasWidget.selected[0].source.filename, "root-a0.jpg");
    assert.equal(child.canvasWidget.selected[0].source.filename, "child-a0.jpg");
    assert.equal(nested.canvasWidget.selected[0].source.filename, "nested-a0.jpg");
});

test("empty or missing cached results clear previous images", async () => {
    const r = await runtime();
    const node = new r.Node();
    const graph = r.graph([node]);
    node.onExecuted(output("old"));
    r.activate(graph, { 24: { a_images: [], b_images: [] } });
    assert.equal(node.canvasWidget.selected.length, 0);
    assert.equal(node.canvasWidget.value.images.length, 0);
    node.onExecuted(output("old"));
    r.activate(graph, {});
    assert.equal(node.canvasWidget.selected.length, 0);
});

test("a new execution replaces the previous batch and resets selection", async () => {
    const r = await runtime();
    const node = new r.Node();
    node.onExecuted(output("old", 3));
    choose(node, "A3");
    node.canvasWidget._swapAB();
    node.onExecuted(output("new"));
    assert.deepEqual(plain(node.canvasWidget.selected.map(d => d.name)), ["A", "B"]);
    assert.deepEqual(plain(node.canvasWidget.selected.map(d => d.source.filename)), ["new-a0.jpg", "new-b0.jpg"]);
});

test("failed previews show a readable message and a later result recovers", async () => {
    const r = await runtime();
    const node = new r.Node();
    node.onExecuted(output("expired"));
    node.canvasWidget.selected[0].img.fail();
    const failed = canvas();
    node.canvasWidget.draw(failed, node, 400, 70);
    assert.ok(failed.texts.includes("预览加载失败，请重新运行"));
    assert.equal(failed.images.length, 0);
    node.onExecuted(output("new"));
    node.canvasWidget.selected.forEach(d => d.img.load());
    const recovered = canvas();
    node.canvasWidget.draw(recovered, node, 400, 70);
    assert.ok(!recovered.texts.includes("预览加载失败，请重新运行"));
    assert.match(recovered.images[0], /new-a0.jpg/);
});

test("late image callbacks cannot replace a newer result", async () => {
    const r = await runtime();
    const node = new r.Node();
    node.onExecuted(output("old"));
    const oldImages = [...r.requests];
    node.onExecuted(output("new"));
    oldImages[0].fail();
    oldImages[1].load();
    node.canvasWidget.selected.forEach(d => d.img.load());
    const ctx = canvas();
    node.canvasWidget.draw(ctx, node, 400, 70);
    assert.ok(!ctx.texts.includes("预览加载失败，请重新运行"));
    assert.match(ctx.images[0], /new-a0.jpg/);
});

test("workflows saved with the former empty preview value still restore", async () => {
    const r = await runtime();
    for (const value of [[], { images: [] }]) {
        const node = new r.Node();
        node.configure({ size: [400, 450], widgets_values: [false, true, value] });
        r.activate(r.graph([node]), { 24: output("legacy") });
        assert.deepEqual(plain(node.canvasWidget.selected.map(d => d.name)), ["A", "B"]);
    }
});
