import { app } from "../../../scripts/app.js";
import { ruiLang } from "./rui_i18n.js";

const NODE_NAME = "RuiText";
const PROP_FONT_SIZE = "rui_text_font_size";
const DEFAULT_FONT_SIZE = 20;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 48;

const tr = (zh, en) => ruiLang() === "zh" ? zh : en;

function getFontSize(node) {
  node.properties ??= {};
  const value = Number(node.properties[PROP_FONT_SIZE]);
  const size = Number.isFinite(value) ? value : DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)));
}

function getTextWidget(node) {
  return node.widgets?.find((widget) => widget?.name === "text");
}

function applyFontSize(node, size = getFontSize(node)) {
  const input = getTextWidget(node)?.inputEl;
  if (!input?.style) return;
  input.style.fontSize = `${size}px`;
  input.style.lineHeight = "1.45";
  input.style.fontFamily = '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "Segoe UI", Arial, sans-serif';
}

function setFontSize(node, value) {
  const size = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(Number(value) || DEFAULT_FONT_SIZE)));
  node.properties ??= {};
  node.properties[PROP_FONT_SIZE] = size;
  applyFontSize(node, size);
  node._ruiTextUpdateControls?.(size);
  app.graph?.change?.();
  node.setDirtyCanvas?.(true, true);
}

function stopCanvasEvent(event) {
  event.stopPropagation();
}

function createToolbar(node) {
  if (node._ruiTextToolbar || typeof node.addDOMWidget !== "function") return;

  const root = document.createElement("div");
  Object.assign(root.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    height: "30px",
    boxSizing: "border-box",
    padding: "0 8px 6px",
    pointerEvents: "auto",
    userSelect: "none",
    fontFamily: "inherit",
  });
  root.addEventListener("pointerdown", stopCanvasEvent);
  root.addEventListener("wheel", stopCanvasEvent, { passive: true });

  const makeButton = (label, title) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    Object.assign(button.style, {
      width: "26px",
      height: "22px",
      border: "1px solid #4d4d4d",
      borderRadius: "4px",
      background: "#303030",
      color: "#aaa",
      cursor: "pointer",
      fontSize: "12px",
      lineHeight: "1",
      padding: "0",
    });
    return button;
  };

  const decrease = makeButton("A−", tr("缩小文字", "Decrease text size"));
  const increase = makeButton("A+", tr("放大文字", "Increase text size"));
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(MIN_FONT_SIZE);
  slider.max = String(MAX_FONT_SIZE);
  slider.step = "1";
  Object.assign(slider.style, { flex: "1", minWidth: "60px", accentColor: "#777" });

  const value = document.createElement("span");
  Object.assign(value.style, {
    minWidth: "34px",
    color: "#999",
    fontSize: "11px",
    textAlign: "right",
    whiteSpace: "nowrap",
  });

  const updateControls = (size) => {
    slider.value = String(size);
    value.textContent = `${size}px`;
  };
  node._ruiTextUpdateControls = updateControls;
  updateControls(getFontSize(node));

  decrease.onclick = (event) => {
    event.stopPropagation();
    setFontSize(node, getFontSize(node) - 1);
  };
  increase.onclick = (event) => {
    event.stopPropagation();
    setFontSize(node, getFontSize(node) + 1);
  };
  slider.addEventListener("input", () => setFontSize(node, slider.value));

  root.append(decrease, slider, value, increase);
  const widget = node.addDOMWidget("rui_text_font_size", "rui_text_font_size", root, {
    serialize: false,
    hideOnZoom: false,
  });
  widget.computeSize = () => [node.size?.[0] || 240, 36];
  node._ruiTextToolbar = root;
}

function setupNode(node) {
  applyFontSize(node);
  createToolbar(node);
  applyFontSize(node);
}

function scheduleSetup(node, attempt = 0) {
  requestAnimationFrame(() => {
    setupNode(node);
    if (!getTextWidget(node)?.inputEl && attempt < 4) scheduleSetup(node, attempt + 1);
  });
}

app.registerExtension({
  name: "Rui.Text",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    const onConfigure = nodeType.prototype.onConfigure;
    const onRemoved = nodeType.prototype.onRemoved;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      this.resizable = true;
      this.flags ??= {};
      this.flags.resizable = true;
      scheduleSetup(this);
      requestAnimationFrame(() => {
        if (!this._ruiTextConfigured) {
          this.size = [Math.max(this.size?.[0] || 0, 360), Math.max(this.size?.[1] || 0, 360)];
          this.setDirtyCanvas?.(true, true);
        }
      });
      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = onConfigure?.apply(this, arguments);
      this._ruiTextConfigured = true;
      scheduleSetup(this);
      return result;
    };

    nodeType.prototype.onRemoved = function () {
      this._ruiTextToolbar?.remove();
      this._ruiTextToolbar = null;
      this._ruiTextUpdateControls = null;
      return onRemoved?.apply(this, arguments);
    };
  },
});
