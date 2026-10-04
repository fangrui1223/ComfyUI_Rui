import { app } from "../../../scripts/app.js";

// ═══════════════════════════════════════════════
//  Rui选择器 · Canvas 绘制版
//  缩放任意大小都始终清晰
// ═══════════════════════════════════════════════

(function () {
    const ID = "rui-selector-css";
    if (document.getElementById(ID)) return;
    const s = document.createElement("style");
    s.id = ID;
    s.textContent = ``;
    document.head.appendChild(s);
})();

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

function rrect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawLinearGradient(ctx, x, y, w, h, direction, colors) {
    let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    if (direction === "90deg") { x1 = x + w; y1 = y; }
    else if (direction === "180deg") { x1 = x; y1 = y + h; }
    else if (direction === "270deg") { x0 = x + w; y0 = y; x1 = x; y1 = y + h; }
    else if (direction === "0deg") { x0 = x; y0 = y + h; x1 = x; y1 = y; }
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, colors.color1);
    grad.addColorStop(0.5, colors.color2);
    grad.addColorStop(1, colors.color3);
    return grad;
}

function drawRadialGradient(ctx, x, y, w, h, colors) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.max(w, h) / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, colors.color1);
    grad.addColorStop(0.5, colors.color2);
    grad.addColorStop(1, colors.color3);
    return grad;
}

function getNodeSettings(node, defaults) {
    const sw = node.widgets?.find(w => w.name === "_rui_settings");
    let parsed = {};
    if (sw && sw.value) {
        try { parsed = JSON.parse(sw.value); } catch (e) {}
    }
    const s = { ...defaults, ...parsed };
    const max = Math.max(1, s.count);
    s.columns = Math.max(1, Math.min(s.columns, max));
    s.btnWidth = clamp(s.btnWidth, 55, 300);
    s.btnHeight = clamp(s.btnHeight, 30, 80);
    s.fontSize = clamp(s.fontSize, 10, 24);
    s.btnGap = clamp(s.btnGap, 0, 20);
    s.scaleMode = s.scaleMode === "fixed" ? "fixed" : "auto";
    s.contentScale = clamp(Number(s.contentScale) || 1, 0.5, 3);
    if (!s.widths || typeof s.widths !== "object") {
        s.widths = {};
    }
    return s;
}

function setNodeSettings(node, settings) {
    const sw = node.widgets?.find(w => w.name === "_rui_settings");
    if (sw) sw.value = JSON.stringify(settings);
}

function getDisplayLabel(value, labels) {
    if (labels[value] && labels[value].trim()) return labels[value];
    return value;
}

function getButtonWidth(index, settings) {
    const key = String(index);
    if (settings.widths && settings.widths[key] !== undefined) {
        return clamp(settings.widths[key], 55, 300);
    }
    return clamp(settings.btnWidth, 55, 300);
}

function getBaseLayout(settings) {
    const count = settings.count;
    const cols = settings.columns;
    const gap = settings.btnGap;
    const btnH = settings.btnHeight;
    const rows = Math.ceil(count / cols);
    let maxRowWidth = 0;
    for (let r = 0; r < rows; r++) {
        const rowStartIdx = r * cols;
        const rowEndIdx = Math.min(rowStartIdx + cols, count);
        const rowCount = rowEndIdx - rowStartIdx;
        let rowWidth = 0;
        for (let i = rowStartIdx; i < rowEndIdx; i++) {
            rowWidth += getButtonWidth(i, settings);
        }
        rowWidth += (rowCount - 1) * gap;
        maxRowWidth = Math.max(maxRowWidth, rowWidth);
    }

    return { rows, contentW: maxRowWidth, contentH: rows * btnH + (rows - 1) * gap };
}

function getButtonRects(y, W, H, settings) {
    const base = getBaseLayout(settings);
    const availableW = Math.max(1, W - 12);
    const availableH = Math.max(1, H - 8);
    const fitScale = Math.min(availableW / base.contentW, availableH / base.contentH);
    const requestedScale = settings.scaleMode === "fixed" ? settings.contentScale : fitScale;
    const scale = clamp(Math.min(requestedScale, fitScale), 0.1, 4);
    const gap = settings.btnGap * scale;
    const btnH = settings.btnHeight * scale;
    const rows = base.rows;
    const contentW = base.contentW * scale;
    const contentH = base.contentH * scale;
    const startY = y + 4 + Math.max(0, (availableH - contentH) / 2);
    const rects = [];

    for (let row = 0; row < rows; row++) {
        const first = row * settings.columns;
        const end = Math.min(first + settings.columns, settings.count);
        let rowWidth = 0;
        for (let i = first; i < end; i++) rowWidth += getButtonWidth(i, settings) * scale;
        rowWidth += Math.max(0, end - first - 1) * gap;
        let x = Math.max(6, (W - rowWidth) / 2);
        for (let i = first; i < end; i++) {
            const width = getButtonWidth(i, settings) * scale;
            rects[i] = { x, y: startY + row * (btnH + gap), w: width, h: btnH };
            x += width + gap;
        }
    }
    return { rects, contentW, contentH, scale };
}

function getWidgetButtonRects(widget, node, width, y, settings) {
    const height = widget.computedHeight ?? (node.size[1] - y);
    return getButtonRects(y, width, Math.max(1, height - 4), settings);
}

const DEFAULT_SETTINGS = {
    labels: { "0": "", "1": "" },
    colors: { color1: "#000000", color2: "#FF0000", color3: "#000000", direction: "180deg" },
    count: 2,
    columns: 2,
    btnWidth: 60,
    btnHeight: 30,
    fontSize: 12,
    btnGap: 4,
    fontColor: "#aaa",
    inactiveColor: "#2a2a2a",
    scaleMode: "auto",
    contentScale: 1,
    widths: {}
};

app.registerExtension({
    name: "ComfyUI.rui.selector.canvas",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RuiSelector") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

            this.resizable = true;
            this.flags = this.flags || {};
            this.flags.resizable = true;

            const settingsWidget = this.widgets?.find(w => w.name === "_rui_settings");
            if (settingsWidget) settingsWidget.hidden = true;

            const tagWidget = this.widgets?.find(w => w.name === "label");
            if (!tagWidget) return;
            const widgetIndex = this.widgets.indexOf(tagWidget);

            tagWidget.type = "hidden";
            tagWidget.hidden = true;
            tagWidget.computeSize = () => [0, 0];

            const node = this;

            node.addCustomWidget({
                name: "rui_selector_ui",
                type: "rui_selector",

                draw(ctx, node, W, y, H) {
                    const settings = getNodeSettings(node, DEFAULT_SETTINGS);
                    const count = settings.count;
                    const { rects, contentH, scale } = getWidgetButtonRects(this, node, W, y, settings);
                    const currentValue = String(tagWidget.value ?? "0");

                    for (let i = 0; i < count; i++) {
                        const r = rects[i];
                        if (!r) continue;
                        const value = String(i);
                        const isActive = currentValue === value;

                        ctx.save();
                        if (isActive) {
                            if (settings.colors.direction === "radial") {
                                ctx.fillStyle = drawRadialGradient(ctx, r.x, r.y, r.w, r.h, settings.colors);
                            } else {
                                ctx.fillStyle = drawLinearGradient(ctx, r.x, r.y, r.w, r.h, settings.colors.direction, settings.colors);
                            }
                        } else {
                            ctx.fillStyle = settings.inactiveColor || "#2a2a2a";
                        }
                        rrect(ctx, r.x, r.y, r.w, r.h, 5 * scale);
                        ctx.fill();

                        ctx.strokeStyle = isActive ? settings.colors.color1 : "#444";
                        ctx.lineWidth = Math.max(1, scale);
                        ctx.stroke();

                        const label = getDisplayLabel(value, settings.labels);
                        ctx.fillStyle = settings.fontColor || "#aaa";
                        ctx.font = `${settings.fontSize * scale}px "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "SimHei", Arial, sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
                        ctx.restore();
                    }

                    node._ruiSelH = contentH + 8;
                },

                mouse(event, pos, node) {
                    if (event.type === "wheel") return false;
                    if (event.type !== "mousedown" && event.type !== "pointerdown") return false;
                    if (event.button !== 0 && event.type === "mousedown") return false;

                    const settings = getNodeSettings(node, DEFAULT_SETTINGS);
                    const W = this.width || node.size[0];
                    const y = this.last_y ?? this.y ?? 0;
                    const { rects } = getWidgetButtonRects(this, node, W, y, settings);

                    for (let i = 0; i < rects.length; i++) {
                        const r = rects[i];
                        if (!r) continue;
                        if (pos[0] >= r.x && pos[0] <= r.x + r.w &&
                            pos[1] >= r.y && pos[1] <= r.y + r.h) {
                            const value = String(i);
                            tagWidget.value = value;
                            if (tagWidget.callback) {
                                try { tagWidget.callback(value); } catch (e) {}
                            }
                            node.setDirtyCanvas(true, true);
                            return true;
                        }
                    }
                    return false;
                },

                computeLayoutSize() {
                    const settings = getNodeSettings(node, DEFAULT_SETTINGS);
                    const base = getBaseLayout(settings);
                    const scale = settings.scaleMode === "fixed" ? settings.contentScale : 1;
                    // Let LiteGraph allocate the remaining height to this widget,
                    // so enlarged buttons stay inside its mouse hit area.
                    return { minWidth: 0, minHeight: base.contentH * scale + 12 };
                },
            });

            const custom = this.widgets.pop();
            this.widgets.splice(widgetIndex + 1, 0, custom);

            const settings = getNodeSettings(this, DEFAULT_SETTINGS);
            const base = getBaseLayout(settings);
            const scale = settings.scaleMode === "fixed" ? settings.contentScale : 1;
            this.size[0] = Math.max(120, base.contentW * scale + 12);
            this.size[1] = Math.max(80, base.contentH * scale + 60);
        };
    },
});
