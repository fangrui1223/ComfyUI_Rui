import { app } from "../../../scripts/app.js";
import { ruiLang } from "./rui_i18n.js";

const NODE_NAME = "RuiGroupSwitchIndex";
const MODE_ENABLE = LiteGraph.ALWAYS ?? 0;
const MODE_NEVER = LiteGraph.NEVER ?? 2;
const MODE_BYPASS = LiteGraph.BYPASS ?? 4;
const INPUT_SELECTED_INDEX = "selected_index_value";

const PROP_FILTER = "rui_gsi_filter";
const PROP_COLOR_FILTER = "rui_gsi_color_filter";
const PROP_MODE = "rui_gsi_mode";
const PROP_SORT_MODE = "rui_gsi_sort_mode";
const PROP_SELECTED_TITLE = "rui_gsi_selected_title";
const PROP_SELECTED_GROUP = "rui_gsi_selected_group";
const PROP_SELECTED_INDEX = "rui_gsi_selected_index";
const PROP_ACTIVE_SET = "rui_gsi_active_set";
const PROP_ACTIVE_GROUPS = "rui_gsi_active_groups";
const PROP_THEME_COLOR = "rui_gsi_name_color";
const PROP_ORDER = "rui_gsi_order";
const PROP_CLOSE_WITH_NEVER = "rui_gsi_group_mode_sync";
const PROP_UI_SCALE = "rui_gsi_ui_scale";

const tr = (zh, en) => ruiLang() === "zh" ? zh : en;
const modeLabels = () => ({
  default: tr("默认（全部开启）", "Default (all enabled)"),
  always_one: tr("始终开启1个", "Always keep one enabled"),
  at_most_one: tr("最多开启1个", "At most one enabled"),
});
const sortLabels = () => ({
  manual: tr("手动固定", "Manual"),
  position: tr("按位置", "By position"),
  alphabet: tr("按标题", "By title"),
});

function ensureProperties(node) {
  node.properties ??= {};
  if (node.properties[PROP_FILTER] == null) node.properties[PROP_FILTER] = "";
  if (node.properties[PROP_COLOR_FILTER] == null) node.properties[PROP_COLOR_FILTER] = "none";
  if (node.properties[PROP_MODE] == null) node.properties[PROP_MODE] = "default";
  if (node.properties[PROP_SORT_MODE] == null) node.properties[PROP_SORT_MODE] = "manual";
  if (node.properties[PROP_SELECTED_TITLE] == null) node.properties[PROP_SELECTED_TITLE] = "";
  if (node.properties[PROP_SELECTED_GROUP] == null) node.properties[PROP_SELECTED_GROUP] = "";
  if (node.properties[PROP_SELECTED_INDEX] == null) node.properties[PROP_SELECTED_INDEX] = 0;
  if (node.properties[PROP_ACTIVE_SET] == null) node.properties[PROP_ACTIVE_SET] = null;
  if (node.properties[PROP_ACTIVE_GROUPS] == null) node.properties[PROP_ACTIVE_GROUPS] = null;
  if (node.properties[PROP_THEME_COLOR] == null) node.properties[PROP_THEME_COLOR] = "#00c91a";
  if (!Array.isArray(node.properties[PROP_ORDER])) node.properties[PROP_ORDER] = [];
  if (node.properties[PROP_CLOSE_WITH_NEVER] == null) node.properties[PROP_CLOSE_WITH_NEVER] = false;
  if (node.properties[PROP_UI_SCALE] == null) node.properties[PROP_UI_SCALE] = 1;
}

function asBool(value) {
  if (typeof value === "string") return !["", "0", "false", "no", "off"].includes(value.trim().toLowerCase());
  return !!value;
}

function getScale(node) {
  const value = Number(node.properties?.[PROP_UI_SCALE] ?? 1);
  return Math.min(3.5, Math.max(0.6, Number.isFinite(value) ? value : 1));
}

function scaled(node, value) {
  return Math.round(value * getScale(node));
}

function groupBounds(group) {
  if (Array.isArray(group?._bounding)) return [...group._bounding];
  if (Array.isArray(group?.bounding)) return [...group.bounding];
  const pos = group?.pos || group?._pos || [0, 0];
  const size = group?.size || group?._size || [0, 0];
  return [pos[0], pos[1], size[0], size[1]];
}

function nodeBounds(node) {
  const pos = node?.pos || [0, 0];
  if (node?.collapsed || node?._collapsed) {
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
    return [pos[0], pos[1], node?._collapsed_width || 120, titleHeight];
  }
  const size = node?.size || [100, 60];
  return [pos[0], pos[1], size[0], size[1]];
}

function intersects(a, b) {
  return !(a[0] + a[2] <= b[0] || a[0] >= b[0] + b[2] || a[1] + a[3] <= b[1] || a[1] >= b[1] + b[3]);
}

function inside(inner, outer) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[0] + inner[2] <= outer[0] + outer[2] && inner[1] + inner[3] <= outer[1] + outer[3];
}

function layoutSort(a, b) {
  const dy = a.bounds[1] - b.bounds[1];
  if (Math.abs(dy) > 24) return dy;
  const dx = a.bounds[0] - b.bounds[0];
  if (Math.abs(dx) > 1) return dx;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function normalizeColor(color) {
  if (typeof color === "number") return `#${color.toString(16).padStart(6, "0")}`;
  if (typeof color !== "string" || !color.startsWith("#")) return "";
  if (color.length === 4) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  return color.length === 7 ? color.toLowerCase() : "";
}

function legacyGroupKey(title, bounds) {
  return `legacy:${title}\u001f${bounds.map((value) => String(Number(value) || 0)).join(",")}`;
}

function groupKey(group, title, bounds) {
  const id = group?.id ?? group?._id;
  return id == null ? legacyGroupKey(title, bounds) : `id:${id}`;
}

function getRawGroups() {
  const graph = app.graph;
  if (!graph || !Array.isArray(graph._groups)) return [];
  return graph._groups.map((group) => {
    const title = String(group.title || "").trim() || "Unnamed";
    const bounds = groupBounds(group);
    return {
      key: groupKey(group, title, bounds),
      title,
      bounds,
      color: normalizeColor(group.color),
      ref: group,
    };
  });
}

function collectGroupNodes(group, selfId, allGroups = getRawGroups()) {
  group.ref?.recomputeInsideNodes?.();
  const graph = app.graph;
  if (!graph || !Array.isArray(graph._nodes)) return [];

  const rects = [group.bounds];
  for (const candidate of allGroups) {
    if (candidate.ref !== group.ref && inside(candidate.bounds, group.bounds)) rects.push(candidate.bounds);
  }
  return graph._nodes.filter((node) => node?.id !== selfId && rects.some((rect) => intersects(nodeBounds(node), rect)));
}

function ensureManualOrder(node, groups) {
  const remaining = [...groups];
  const ordered = [];
  for (const value of node.properties[PROP_ORDER]) {
    let index = remaining.findIndex((group) => group.key === value);
    if (index < 0) index = remaining.findIndex((group) => group.title === value);
    if (index < 0) continue;
    ordered.push(remaining[index]);
    remaining.splice(index, 1);
  }
  ordered.push(...remaining.sort(layoutSort));
  node.properties[PROP_ORDER] = ordered.map((group) => group.key);
  return ordered;
}

function getVisibleGroups(node) {
  ensureProperties(node);
  const allGroups = getRawGroups();
  const filter = String(node.properties[PROP_FILTER] || "").trim().toLowerCase();
  const colorFilter = String(node.properties[PROP_COLOR_FILTER] || "none").toLowerCase();

  let groups = allGroups.filter((group) => collectGroupNodes(group, node.id, allGroups).length > 0);
  if (filter) groups = groups.filter((group) => group.title.toLowerCase().includes(filter));
  if (colorFilter !== "none") {
    groups = groups.filter((group) => colorFilter === "transparent" ? !group.color : group.color === colorFilter);
  }

  const sortMode = node.properties[PROP_SORT_MODE];
  if (sortMode === "alphabet") return groups.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  if (sortMode === "position") return groups.sort(layoutSort);

  const manual = ensureManualOrder(node, allGroups);
  const visibleKeys = new Set(groups.map((group) => group.key));
  return manual.filter((group) => visibleKeys.has(group.key));
}

function getActiveGroups(node, groups) {
  const keys = groups.map((group) => group.key);
  if (node.properties[PROP_MODE] === "default") {
    const activeGroups = node.properties[PROP_ACTIVE_GROUPS];
    if (Array.isArray(activeGroups)) return new Set(activeGroups.filter((key) => keys.includes(key)));

    const activeSet = node.properties[PROP_ACTIVE_SET];
    if (!Array.isArray(activeSet)) return new Set(keys);
    return new Set(groups.filter((group) => activeSet.includes(group.title)).map((group) => group.key));
  }

  const selectedGroup = String(node.properties[PROP_SELECTED_GROUP] || "");
  if (selectedGroup && keys.includes(selectedGroup)) return new Set([selectedGroup]);

  const selectedTitle = String(node.properties[PROP_SELECTED_TITLE] || "");
  const legacyMatch = groups.find((group) => group.title === selectedTitle);
  if (legacyMatch) return new Set([legacyMatch.key]);
  if (node.properties[PROP_MODE] === "always_one" && keys.length) return new Set([keys[0]]);
  return new Set();
}

function selectedIndexForState(node, groups, activeGroups) {
  if (node.properties[PROP_MODE] === "default") return 0;
  const index = groups.findIndex((group) => activeGroups.has(group.key));
  return index >= 0 ? index + 1 : 0;
}

function findIndexWidget(node) {
  node.widgets ??= [];
  let widget = node.widgets.find((item) => item?.name === INPUT_SELECTED_INDEX);
  if (!widget && typeof node.addWidget === "function") {
    widget = node.addWidget("number", INPUT_SELECTED_INDEX, Number(node.properties?.[PROP_SELECTED_INDEX] || 0), () => {}, {
      min: 0,
      max: 1000000,
      step: 1,
      precision: 0,
    });
  }
  return widget || null;
}

function hideIndexWidget(node) {
  const widget = findIndexWidget(node);
  if (!widget) return;
  widget.hidden = true;
  widget.type = "hidden";
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.serializeValue = function () {
    return Number(node.properties?.[PROP_SELECTED_INDEX] || 0);
  };
}

function syncIndexInput(node) {
  const widget = findIndexWidget(node);
  if (widget) widget.value = Number(node.properties[PROP_SELECTED_INDEX] || 0);
}

function saveSelection(node, groups, activeGroups) {
  if (node.properties[PROP_MODE] === "default") {
    const active = groups.filter((group) => activeGroups.has(group.key));
    node.properties[PROP_ACTIVE_GROUPS] = active.map((group) => group.key);
    node.properties[PROP_ACTIVE_SET] = active.map((group) => group.title);
    node.properties[PROP_SELECTED_GROUP] = "";
    node.properties[PROP_SELECTED_TITLE] = "";
  } else {
    const activeGroup = groups.find((group) => activeGroups.has(group.key));
    node.properties[PROP_SELECTED_GROUP] = activeGroup?.key || "";
    node.properties[PROP_SELECTED_TITLE] = activeGroup?.title || "";
    node.properties[PROP_ACTIVE_GROUPS] = null;
    node.properties[PROP_ACTIVE_SET] = null;
  }
  node.properties[PROP_SELECTED_INDEX] = selectedIndexForState(node, groups, activeGroups);
  syncIndexInput(node);
}

function changeNodeModes(nodes, mode) {
  for (const child of nodes) {
    child.mode = mode;
    if (mode === MODE_ENABLE && child.flags?.disabled) delete child.flags.disabled;
  }
}

function refreshGraph() {
  app.graph?.change?.();
  app.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

function applyGroupModes(node, saveState = true) {
  const groups = getVisibleGroups(node);
  const activeGroups = getActiveGroups(node, groups);
  if (saveState) saveSelection(node, groups, activeGroups);

  const closedMode = asBool(node.properties[PROP_CLOSE_WITH_NEVER]) ? MODE_NEVER : MODE_BYPASS;
  const allGroups = getRawGroups();
  for (const group of groups) {
    const mode = activeGroups.has(group.key) ? MODE_ENABLE : closedMode;
    changeNodeModes(collectGroupNodes(group, node.id, allGroups), mode);
  }
  refreshGraph();
}

function renderNode(node) {
  node._ruiGsiRender?.();
  node.setDirtyCanvas?.(true, true);
}

function handleToggle(node, key) {
  const groups = getVisibleGroups(node);
  let activeGroups = getActiveGroups(node, groups);
  const mode = node.properties[PROP_MODE];

  if (mode === "default") {
    activeGroups = new Set(activeGroups);
    if (activeGroups.has(key)) activeGroups.delete(key);
    else activeGroups.add(key);
  } else if (mode === "always_one") {
    activeGroups = new Set([key]);
  } else {
    activeGroups = activeGroups.has(key) ? new Set() : new Set([key]);
  }

  saveSelection(node, groups, activeGroups);
  applyGroupModes(node, false);
  renderNode(node);
}

function moveGroup(node, key, delta) {
  if (node.properties[PROP_SORT_MODE] !== "manual") return;
  const groups = getVisibleGroups(node);
  const index = groups.findIndex((group) => group.key === key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= groups.length) return;

  const order = [...node.properties[PROP_ORDER]];
  const first = order.indexOf(key);
  const second = order.indexOf(groups[target].key);
  if (first < 0 || second < 0) return;
  [order[first], order[second]] = [order[second], order[first]];
  node.properties[PROP_ORDER] = order;

  const reordered = getVisibleGroups(node);
  saveSelection(node, reordered, getActiveGroups(node, reordered));
  applyGroupModes(node, false);
  renderNode(node);
}

function forwardWheelToCanvas(event) {
  event.preventDefault();
  event.stopPropagation();
  const canvas = app.canvas?.canvas || document.querySelector("canvas");
  canvas?.dispatchEvent(new WheelEvent("wheel", {
    clientX: event.clientX,
    clientY: event.clientY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    bubbles: true,
    cancelable: true,
  }));
}

function stopCanvasEvent(event) {
  event.stopPropagation();
}

function makeButton(text, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = title;
  Object.assign(button.style, {
    border: "0",
    background: "transparent",
    color: "#b8bec8",
    cursor: "pointer",
    padding: "0",
    lineHeight: "1",
  });
  return button;
}

function getUiHeight(node) {
  const count = Math.max(1, getVisibleGroups(node).length);
  return scaled(node, 36 + count * 44 + 8);
}

function getUiWidth(node) {
  return Math.max(350, scaled(node, 420));
}

function resizeNode(node) {
  const width = getUiWidth(node);
  const height = getUiHeight(node) + scaled(node, 42);
  node.size = [width, height];
  node.resizable = true;
  node.setDirtyCanvas?.(true, true);
}

function copyNodeSize(node) {
  const size = node?.size;
  if (!size || size.length < 2) return null;
  const width = Number(size[0]);
  const height = Number(size[1]);
  return Number.isFinite(width) && Number.isFinite(height) ? [width, height] : null;
}

function restoreNodeSize(node, savedSize) {
  if (!savedSize) return;
  node.size = [...savedSize];
  node.setDirtyCanvas?.(true, true);
}

function createNodeUi(node, savedSize = null) {
  if (node._ruiGsiRoot && node._ruiGsiRender) {
    node._ruiGsiRender();
    restoreNodeSize(node, savedSize);
    return;
  }

  node._ruiGsiCleanup?.();
  if (!Array.isArray(node.widgets) || typeof node.addDOMWidget !== "function") return;

  for (let index = node.widgets.length - 1; index >= 0; index--) {
    if (node.widgets[index]?.name !== "rui_group_switch_index_widget") continue;
    if (typeof node.removeWidget === "function") node.removeWidget(index);
    else node.widgets.splice(index, 1);
  }

  const root = document.createElement("div");
  node._ruiGsiRoot = root;
  Object.assign(root.style, {
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    userSelect: "none",
    pointerEvents: "auto",
    fontFamily: "inherit",
  });
  root.addEventListener("wheel", forwardWheelToCanvas, { passive: false });
  root.addEventListener("pointerdown", stopCanvasEvent);

  const widget = node.addDOMWidget("rui_group_switch_index_widget", "rui_gsi", root, {
    serialize: false,
    hideOnZoom: false,
  });
  widget.computeSize = () => [getUiWidth(node), getUiHeight(node)];

  node._ruiGsiRender = () => {
    const groups = getVisibleGroups(node);
    const activeGroups = getActiveGroups(node, groups);
    const scale = getScale(node);
    const theme = node.properties[PROP_THEME_COLOR] || "#00c91a";
    const manualSort = node.properties[PROP_SORT_MODE] === "manual";
    root.innerHTML = "";
    root.style.height = `${getUiHeight(node)}px`;

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: `${Math.round(8 * scale)}px`,
      height: `${Math.round(30 * scale)}px`,
      margin: `0 ${Math.round(14 * scale)}px ${Math.round(6 * scale)}px`,
    });

    const status = document.createElement("div");
    Object.assign(status.style, {
      minWidth: "0",
      flex: "1",
      height: `${Math.round(26 * scale)}px`,
      display: "flex",
      alignItems: "center",
      padding: `0 ${Math.round(10 * scale)}px`,
      boxSizing: "border-box",
      border: "1px solid #707781",
      borderRadius: `${Math.round(6 * scale)}px`,
      background: "#252932",
      color: "#aeb4bd",
      fontSize: `${Math.max(11, Math.round(13 * scale))}px`,
    });
    const statusLabel = document.createElement("span");
    statusLabel.textContent = tr("当前选择编号", "Selected index");
    statusLabel.style.flex = "1";
    statusLabel.style.overflow = "hidden";
    statusLabel.style.whiteSpace = "nowrap";
    const statusValue = document.createElement("span");
    statusValue.textContent = String(node.properties[PROP_SELECTED_INDEX] || 0);
    Object.assign(statusValue.style, {
      minWidth: `${Math.round(32 * scale)}px`,
      textAlign: "center",
      color: theme,
      fontWeight: "bold",
      fontSize: `${Math.max(12, Math.round(15 * scale))}px`,
    });
    status.append(statusLabel, statusValue);

    const gear = makeButton("⚙", tr("Rui 忽略组的选择 设置", "Rui Ignore Group Selector settings"));
    Object.assign(gear.style, {
      width: `${Math.round(26 * scale)}px`,
      height: `${Math.round(26 * scale)}px`,
      flex: "0 0 auto",
      fontSize: `${Math.max(14, Math.round(17 * scale))}px`,
      opacity: "0.75",
    });
    gear.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showSettings(node, event.clientX, event.clientY);
    });
    header.append(status, gear);
    root.appendChild(header);

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.textContent = tr("没有匹配到分组", "No matching groups");
      Object.assign(empty.style, {
        padding: `${Math.round(14 * scale)}px`,
        textAlign: "center",
        color: "#888",
        fontSize: `${Math.max(11, Math.round(13 * scale))}px`,
      });
      root.appendChild(empty);
      return;
    }

    groups.forEach((group, index) => {
      const active = activeGroups.has(group.key);
      const row = document.createElement("div");
      Object.assign(row.style, {
        height: `${Math.round(34 * scale)}px`,
        margin: `0 ${Math.round(14 * scale)}px ${Math.round(10 * scale)}px`,
        padding: `0 ${Math.round(14 * scale)}px`,
        display: "flex",
        alignItems: "center",
        gap: `${Math.round(8 * scale)}px`,
        boxSizing: "border-box",
        border: `1px solid ${active ? theme : "#6e7581"}`,
        borderRadius: `${Math.round(13 * scale)}px`,
        background: "#2b2f38",
        cursor: "pointer",
      });

      const label = document.createElement("div");
      label.textContent = `${index + 1}.  ${group.title}`;
      Object.assign(label.style, {
        flex: "1",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: active ? theme : "#9298a1",
        opacity: active ? "1" : "0.72",
        fontWeight: "bold",
        fontSize: `${Math.max(13, Math.round(18 * scale))}px`,
      });
      row.appendChild(label);

      if (manualSort) {
        const up = makeButton("▲", tr("上移", "Move up"));
        const down = makeButton("▼", tr("下移", "Move down"));
        for (const button of [up, down]) {
          Object.assign(button.style, {
            width: `${Math.round(18 * scale)}px`,
            height: `${Math.round(24 * scale)}px`,
            fontSize: `${Math.max(10, Math.round(13 * scale))}px`,
            flex: "0 0 auto",
          });
          button.addEventListener("mousedown", stopCanvasEvent);
        }
        up.disabled = index === 0;
        down.disabled = index === groups.length - 1;
        up.style.opacity = up.disabled ? "0.28" : "1";
        down.style.opacity = down.disabled ? "0.28" : "1";
        up.onclick = (event) => { event.stopPropagation(); moveGroup(node, group.key, -1); };
        down.onclick = (event) => { event.stopPropagation(); moveGroup(node, group.key, 1); };
        row.append(up, down);
      }

      const toggle = document.createElement("div");
      Object.assign(toggle.style, {
        width: `${Math.round(68 * scale)}px`,
        height: `${Math.round(26 * scale)}px`,
        borderRadius: `${Math.round(13 * scale)}px`,
        background: active ? theme : "#606060",
        position: "relative",
        flex: "0 0 auto",
        boxShadow: active ? `0 0 ${Math.round(7 * scale)}px ${theme}55` : "none",
      });
      const knobSize = Math.round(20 * scale);
      const knob = document.createElement("div");
      Object.assign(knob.style, {
        position: "absolute",
        top: `${Math.round(3 * scale)}px`,
        left: active ? `${Math.round(45 * scale)}px` : `${Math.round(3 * scale)}px`,
        width: `${knobSize}px`,
        height: `${knobSize}px`,
        borderRadius: "50%",
        background: active ? "#f1f1f1" : "#a0a0a0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
      });
      toggle.appendChild(knob);
      row.appendChild(toggle);
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleToggle(node, group.key);
      });
      root.appendChild(row);
    });
  };

  node._ruiGsiCleanup = () => {
    root.remove();
    node._ruiGsiRoot = null;
    node._ruiGsiRender = null;
  };
  node._ruiGsiRender();
  if (savedSize) {
    restoreNodeSize(node, savedSize);
  } else {
    resizeNode(node);
  }
}

function addSettingLabel(parent, text) {
  const label = document.createElement("div");
  label.textContent = text;
  Object.assign(label.style, { fontSize: "13px", fontWeight: "bold", marginBottom: "5px" });
  parent.appendChild(label);
}

function styleSettingControl(control, marginBottom = "14px") {
  Object.assign(control.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    marginBottom,
    background: "#1a1a1a",
    border: "1px solid #555",
    borderRadius: "4px",
    color: "#e0e0e0",
    outline: "none",
  });
}

function showSettings(node, x, y) {
  ensureProperties(node);
  document.getElementById("rui_gsi_overlay")?.remove();
  document.getElementById("rui_gsi_popup")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "rui_gsi_overlay";
  Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "99998", background: "transparent" });

  const popup = document.createElement("div");
  popup.id = "rui_gsi_popup";
  Object.assign(popup.style, {
    position: "fixed",
    left: `${Math.max(12, Math.min(x, innerWidth - 350))}px`,
    top: `${Math.max(12, Math.min(y, innerHeight - 620))}px`,
    zIndex: "99999",
    width: "310px",
    maxHeight: "calc(100vh - 24px)",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: "14px 18px",
    background: "#2a2a2a",
    border: "1px solid #555",
    borderRadius: "8px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    color: "#e0e0e0",
    fontFamily: "inherit",
  });
  popup.addEventListener("mousedown", stopCanvasEvent);
  popup.addEventListener("pointerdown", stopCanvasEvent);
  popup.addEventListener("wheel", stopCanvasEvent, { passive: true });

  const closePopup = () => {
    overlay.remove();
    popup.remove();
  };
  overlay.addEventListener("mousedown", closePopup);

  const title = document.createElement("div");
  title.textContent = tr("Rui 忽略组的选择 设置", "Rui Ignore Group Selector settings");
  Object.assign(title.style, { fontSize: "15px", fontWeight: "bold", marginBottom: "14px", borderBottom: "1px solid #444", paddingBottom: "8px" });
  popup.appendChild(title);

  addSettingLabel(popup, tr("路由控制", "Route control"));
  const routeRow = document.createElement("div");
  Object.assign(routeRow.style, { display: "flex", gap: "22px", alignItems: "center", marginBottom: "14px", fontSize: "13px" });
  const routeName = `rui_gsi_route_${node.id}`;
  const bypassLabel = document.createElement("label");
  const bypassRadio = document.createElement("input");
  bypassRadio.type = "radio";
  bypassRadio.name = routeName;
  bypassRadio.checked = !asBool(node.properties[PROP_CLOSE_WITH_NEVER]);
  bypassLabel.append(bypassRadio, document.createTextNode(tr(" 绕过", " Bypass")));
  const neverLabel = document.createElement("label");
  const neverRadio = document.createElement("input");
  neverRadio.type = "radio";
  neverRadio.name = routeName;
  neverRadio.checked = asBool(node.properties[PROP_CLOSE_WITH_NEVER]);
  neverLabel.append(neverRadio, document.createTextNode(tr(" 停用", " Disable")));
  routeRow.append(bypassLabel, neverLabel);
  popup.appendChild(routeRow);

  addSettingLabel(popup, tr("关键词筛选", "Keyword filter"));
  const filter = document.createElement("input");
  filter.type = "text";
  filter.value = node.properties[PROP_FILTER] || "";
  filter.placeholder = tr("留空 = 显示所有组", "Empty = show all groups");
  styleSettingControl(filter);
  popup.appendChild(filter);

  addSettingLabel(popup, tr("颜色筛选", "Color filter"));
  const colorFilterRow = document.createElement("div");
  Object.assign(colorFilterRow.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" });
  const colorSwatch = document.createElement("span");
  Object.assign(colorSwatch.style, { width: "34px", height: "24px", border: "1px solid #555", borderRadius: "3px", flex: "0 0 auto" });
  const colorFilter = document.createElement("select");
  styleSettingControl(colorFilter, "0");
  colorFilter.style.flex = "1";
  const colorOptions = new Map([["none", tr("无", "None")], ["transparent", tr("透明色", "Transparent")]]);
  for (const group of getRawGroups()) {
    if (group.color) colorOptions.set(group.color, group.color.toUpperCase());
  }
  for (const [value, label] of colorOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    colorFilter.appendChild(option);
  }
  colorFilter.value = node.properties[PROP_COLOR_FILTER] || "none";
  const updateFilterSwatch = () => {
    const value = colorFilter.value;
    colorSwatch.style.background = value.startsWith("#") ? value : "transparent";
    colorSwatch.style.backgroundImage = value === "transparent" ? "linear-gradient(135deg, transparent 45%, #777 46%, #777 54%, transparent 55%)" : "none";
  };
  colorFilter.addEventListener("change", updateFilterSwatch);
  updateFilterSwatch();
  colorFilterRow.append(colorSwatch, colorFilter);
  popup.appendChild(colorFilterRow);

  addSettingLabel(popup, tr("切换模式", "Switch mode"));
  const mode = document.createElement("select");
  for (const [value, label] of Object.entries(modeLabels())) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.appendChild(option);
  }
  mode.value = node.properties[PROP_MODE];
  styleSettingControl(mode);
  popup.appendChild(mode);

  addSettingLabel(popup, tr("排序", "Sort"));
  const sortMode = document.createElement("select");
  for (const [value, label] of Object.entries(sortLabels())) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sortMode.appendChild(option);
  }
  sortMode.value = node.properties[PROP_SORT_MODE];
  styleSettingControl(sortMode);
  popup.appendChild(sortMode);

  addSettingLabel(popup, tr("UI组件大小", "UI scale"));
  const scaleRow = document.createElement("div");
  Object.assign(scaleRow.style, { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" });
  const scaleInput = document.createElement("input");
  scaleInput.type = "range";
  scaleInput.min = "0.6";
  scaleInput.max = "3.5";
  scaleInput.step = "0.1";
  scaleInput.value = String(getScale(node));
  scaleInput.style.flex = "1";
  const scaleValue = document.createElement("span");
  scaleValue.textContent = `${getScale(node).toFixed(1)}x`;
  Object.assign(scaleValue.style, { minWidth: "38px", textAlign: "right", color: "#aaa", fontSize: "12px" });
  scaleInput.addEventListener("input", () => { scaleValue.textContent = `${Number(scaleInput.value).toFixed(1)}x`; });
  scaleRow.append(scaleInput, scaleValue);
  popup.appendChild(scaleRow);

  addSettingLabel(popup, tr("主题颜色", "Theme color"));
  const themeRow = document.createElement("div");
  Object.assign(themeRow.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" });
  const themeColor = document.createElement("input");
  themeColor.type = "color";
  themeColor.value = node.properties[PROP_THEME_COLOR] || "#00c91a";
  Object.assign(themeColor.style, { width: "40px", height: "30px", padding: "0", border: "1px solid #555", borderRadius: "4px", background: "#1a1a1a" });
  const themeText = document.createElement("input");
  themeText.type = "text";
  themeText.value = themeColor.value;
  styleSettingControl(themeText, "0");
  themeText.style.flex = "1";
  themeColor.addEventListener("input", () => { themeText.value = themeColor.value; });
  themeText.addEventListener("input", () => { if (/^#[0-9a-fA-F]{6}$/.test(themeText.value)) themeColor.value = themeText.value; });
  themeRow.append(themeColor, themeText);
  popup.appendChild(themeRow);

  const buttons = document.createElement("div");
  Object.assign(buttons.style, { display: "flex", justifyContent: "flex-end", gap: "12px" });
  const close = document.createElement("button");
  close.textContent = tr("关闭", "Close");
  const apply = document.createElement("button");
  apply.textContent = tr("应用", "Apply");
  for (const button of [close, apply]) {
    Object.assign(button.style, { border: "0", borderRadius: "6px", padding: "8px 18px", color: "#fff", fontWeight: "bold", cursor: "pointer" });
  }
  close.style.background = "#666";
  apply.style.background = "#4caf50";
  close.onclick = closePopup;
  apply.onclick = () => {
    const previousMode = node.properties[PROP_MODE];
    const previousSortMode = node.properties[PROP_SORT_MODE];
    let manualOrder = null;
    if (sortMode.value === "manual" && previousSortMode !== "manual") {
      const allGroups = getRawGroups();
      if (previousSortMode === "alphabet") {
        allGroups.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      } else {
        allGroups.sort(layoutSort);
      }
      manualOrder = allGroups.map((group) => group.key);
    }

    node.properties[PROP_FILTER] = filter.value;
    node.properties[PROP_COLOR_FILTER] = colorFilter.value;
    node.properties[PROP_SORT_MODE] = sortMode.value;
    if (manualOrder) node.properties[PROP_ORDER] = manualOrder;
    node.properties[PROP_CLOSE_WITH_NEVER] = neverRadio.checked;
    node.properties[PROP_UI_SCALE] = Number(scaleInput.value);
    node.properties[PROP_THEME_COLOR] = themeColor.value;
    node.properties[PROP_MODE] = mode.value;

    const groups = getVisibleGroups(node);
    if (mode.value !== previousMode) {
      if (mode.value === "default") {
        node.properties[PROP_ACTIVE_GROUPS] = groups.map((group) => group.key);
        node.properties[PROP_ACTIVE_SET] = groups.map((group) => group.title);
        node.properties[PROP_SELECTED_GROUP] = "";
        node.properties[PROP_SELECTED_TITLE] = "";
      } else {
        const visibleKeys = new Set(groups.map((group) => group.key));
        let selected = String(node.properties[PROP_SELECTED_GROUP] || "");
        if (!visibleKeys.has(selected) && Array.isArray(node.properties[PROP_ACTIVE_GROUPS])) {
          selected = node.properties[PROP_ACTIVE_GROUPS].find((key) => visibleKeys.has(key)) || "";
        }
        if (!visibleKeys.has(selected)) {
          const selectedTitle = String(node.properties[PROP_SELECTED_TITLE] || "");
          selected = groups.find((group) => group.title === selectedTitle)?.key || "";
        }
        if (!selected && Array.isArray(node.properties[PROP_ACTIVE_SET])) {
          selected = groups.find((group) => node.properties[PROP_ACTIVE_SET].includes(group.title))?.key || "";
        }
        if (mode.value === "always_one" && !selected) selected = groups[0]?.key || "";
        node.properties[PROP_SELECTED_GROUP] = selected;
        node.properties[PROP_SELECTED_TITLE] = groups.find((group) => group.key === selected)?.title || "";
        node.properties[PROP_ACTIVE_GROUPS] = null;
        node.properties[PROP_ACTIVE_SET] = null;
      }
    }

    const activeGroups = getActiveGroups(node, groups);
    saveSelection(node, groups, activeGroups);
    applyGroupModes(node, false);
    renderNode(node);
    closePopup();
  };
  buttons.append(close, apply);
  popup.appendChild(buttons);

  document.body.append(overlay, popup);
}

function setupNode(node, savedSize = null) {
  ensureProperties(node);
  hideIndexWidget(node);
  ensureManualOrder(node, getRawGroups());
  const groups = getVisibleGroups(node);
  saveSelection(node, groups, getActiveGroups(node, groups));
  createNodeUi(node, savedSize);
  requestAnimationFrame(() => applyGroupModes(node, true));
}

function scheduleSetup(node, delay = 30, preserveSize = false) {
  const savedSize = preserveSize ? copyNodeSize(node) : null;
  clearTimeout(node._ruiGsiSetupTimer);
  node._ruiGsiSetupTimer = setTimeout(() => {
    node._ruiGsiSetupTimer = null;
    if (!node.graph || node.graph !== app.graph) return;
    setupNode(node, savedSize);
  }, delay);
}

function syncNodeForPrompt(node) {
  ensureProperties(node);
  const groups = getVisibleGroups(node);
  saveSelection(node, groups, getActiveGroups(node, groups));
  applyGroupModes(node, false);
}

function syncAllNodes() {
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  for (const node of nodes) {
    if (node?.type === NODE_NAME || node?.constructor?.type === NODE_NAME) syncNodeForPrompt(node);
  }
}

function patchQueueSync() {
  if (!app._ruiGroupSwitchIndexGraphToPromptPatched && typeof app.graphToPrompt === "function") {
    const graphToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function (...args) {
      syncAllNodes();
      return await graphToPrompt.apply(this, args);
    };
    app._ruiGroupSwitchIndexGraphToPromptPatched = true;
  }

  if (!app._ruiGroupSwitchIndexQueuePromptPatched && typeof app.queuePrompt === "function") {
    const queuePrompt = app.queuePrompt;
    app.queuePrompt = async function (...args) {
      syncAllNodes();
      return await queuePrompt.apply(this, args);
    };
    app._ruiGroupSwitchIndexQueuePromptPatched = true;
  }
}

app.registerExtension({
  name: "Rui.GroupSwitchIndex",
  async setup() {
    patchQueueSync();
  },
  nodeCreated(node) {
    if (node?.type === NODE_NAME) scheduleSetup(node, 20);
  },
  loadedGraphNode(node) {
    if (node?.type === NODE_NAME) scheduleSetup(node, 50, true);
  },
  afterConfigureGraph() {
    const nodes = app.graph?._nodes || [];
    for (const node of nodes) {
      if (node?.type === NODE_NAME) scheduleSetup(node, 80, true);
    }
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    patchQueueSync();
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    const onConfigure = nodeType.prototype.onConfigure;
    const onRemoved = nodeType.prototype.onRemoved;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      scheduleSetup(this, 20);
      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = onConfigure?.apply(this, arguments);
      scheduleSetup(this, 50, true);
      return result;
    };

    nodeType.prototype.onRemoved = function () {
      clearTimeout(this._ruiGsiSetupTimer);
      this._ruiGsiCleanup?.();
      document.getElementById("rui_gsi_overlay")?.remove();
      document.getElementById("rui_gsi_popup")?.remove();
      return onRemoved?.apply(this, arguments);
    };

  },
  getNodeMenuItems(node) {
    if (node.comfyClass !== NODE_NAME && node.type !== NODE_NAME) return [];
    return [{
      content: tr("Rui 忽略组的选择 设置", "Rui Ignore Group Selector settings"),
      callback: () => showSettings(node, Math.round(innerWidth / 2 - 155), Math.round(innerHeight / 2 - 300)),
    }];
  },
});
