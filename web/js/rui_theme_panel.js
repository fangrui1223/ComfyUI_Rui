
import { ruiT } from "./rui_i18n.js";

window.RUIThemePanel = {
    panel: null,
    colorPicker: null,
    isVisible: false,
    currentTheme: null,
    onThemeChange: null,
    onApply: null,
    onReset: null,
    onClose: null,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    positionKey: "rui_theme_panel_pos",
    isUpdatingFromNode: false,
    activeColorInput: null,
    pickerState: { h: 240, s: 80, l: 60, a: 1 },
    isDraggingSV: false,
    isDraggingHue: false,
    isDraggingAlpha: false,
    eyedropperActive: false,
    // 缓存最近使用颜色 (最多12个)
    recentColors: [],
    maxRecentColors: 12,

    defaults: {
        color1: "#e49c00",
        color2: "#000000",
        color3: "#005149",
        direction: "90",
        titleColor1: "#e49c00",
        titleColor2: "#000000",
        titleColor3: "#005149",
        titleDirection: "90",
        useTitleGradient: false,
        textColor: "#ffffff",
        useGradient: true,
        fontSize: 14,
        textAlign: "left",
        linkColor: "#888888"
    },

    defaultPresets: [
        {
            color1: "#ff6b6b", color2: "#feca57", color3: "#48dbfb",
            direction: "135",
            titleColor1: "#ee5a24", titleColor2: "#f368e0", titleColor3: "#ff9f43",
            titleDirection: "135", useTitleGradient: false,
            textColor: "#ffffff", fontSize: 14, textAlign: "left"
        },
        {
            color1: "#667eea", color2: "#764ba2", color3: "#f093fb",
            direction: "135",
            titleColor1: "#5f2c82", titleColor2: "#49a09d", titleColor3: "#6dd5ed",
            titleDirection: "135", useTitleGradient: false,
            textColor: "#ffffff", fontSize: 14, textAlign: "left"
        },
        {
            color1: "#11998e", color2: "#38ef7d", color3: "#56ab2f",
            direction: "0",
            titleColor1: "#134e5e", titleColor2: "#71b280", titleColor3: "#a8e063",
            titleDirection: "0", useTitleGradient: false,
            textColor: "#ffffff", fontSize: 14, textAlign: "left"
        },
        {
            color1: "#232526", color2: "#414345", color3: "#5d6d7e",
            direction: "0",
            titleColor1: "#0f0c29", titleColor2: "#302b63", titleColor3: "#24243e",
            titleDirection: "0", useTitleGradient: false,
            textColor: "#ffffff", fontSize: 14, textAlign: "left"
        },
        {
            color1: "#f093fb", color2: "#f5576c", color3: "#fa709a",
            direction: "90",
            titleColor1: "#ff758c", titleColor2: "#ff7eb3", titleColor3: "#fbc2eb",
            titleDirection: "90", useTitleGradient: false,
            textColor: "#ffffff", fontSize: 14, textAlign: "left"
        }
    ],

    create() {
        if (this.panel) return this.panel;

        const panel = document.createElement("div");
        panel.id = "rui-theme-panel";
        panel.className = "rui-theme-panel";
        // 加载最近颜色
        this.loadRecentColors();

        panel.innerHTML = `
            <div class="rui-theme-header">
                <span class="rui-theme-title">${ruiT('Rui','Rui')}</span>
                <div class="rui-theme-header-btns">
                    <button type="button" class="rui-theme-config-btn" id="rui-theme-export-btn">${ruiT('导出配置','Export Config')}</button>
                    <button type="button" class="rui-theme-config-btn" id="rui-theme-import-btn">${ruiT('导入配置','Import Config')}</button>
                    <input type="file" id="rui-theme-import-file" accept=".json,application/json" style="display:none;" />
                    <button type="button" class="rui-theme-shortcut-btn" id="rui-theme-shortcut-btn"></button>
                    <button type="button" class="rui-theme-close">×</button>
                </div>
            </div>
            <div class="rui-top-tabs">
                <button type="button" class="rui-top-tab active" data-top-tab="theme">${ruiT('主题','Theme')}</button>
                <button type="button" class="rui-top-tab" data-top-tab="menuhide">${ruiT('菜单隐藏','Menu Hide')}</button>
                <button type="button" class="rui-top-tab" data-top-tab="quicknodes">${ruiT('快速节点','Quick Nodes')}</button>
            </div>
            <div class="rui-tab-content" data-tab-content="theme">
            <div class="rui-picker-section">
                <div class="rui-sv-area" id="rui-sv-area">
                    <div class="rui-sv-white"></div>
                    <div class="rui-sv-black"></div>
                    <div class="rui-sv-cursor" id="rui-sv-cursor"><svg viewBox="0 0 18 18" width="18" height="18" style="position:absolute;left:-9px;top:-9px;pointer-events:none;"><circle cx="9" cy="9" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="9" cy="9" r="3" fill="none" stroke="#fff" stroke-width="1.5"/></svg></div>
                </div>
                <div class="rui-hue-row">
                    <div class="rui-hue-bar" id="rui-hue-bar">
                        <div class="rui-hue-cursor" id="rui-hue-cursor"></div>
                    </div>
                </div>

            </div>
            <div class="rui-theme-content">
                <div class="rui-theme-section">
                    <div class="rui-color-swatches">
                        <div class="rui-swatch-group">
                            <span class="rui-swatch-label">${ruiT('标题栏','Title Bar')}</span>
                            <button type="button" class="rui-toggle-switch rui-title-gradient-toggle" data-checked="false">
                                <span class="rui-toggle-slider"></span>
                                <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                            </button>
                        </div>
                        <div class="rui-swatch-group rui-title-swatch-section" style="display: none;">
                            <div class="rui-swatch-row">
                                <button type="button" class="rui-color-swatch" data-color="titleColor1" style="background-color: ${this.defaults.titleColor1}"></button>
                                <button type="button" class="rui-color-swatch" data-color="titleColor2" style="background-color: ${this.defaults.titleColor2}"></button>
                                <button type="button" class="rui-color-swatch" data-color="titleColor3" style="background-color: ${this.defaults.titleColor3}"></button>
                            </div>
                            <div class="rui-direction-buttons rui-title-dir-buttons" style="display:flex;gap:2px;margin-left:4px;">
                                <button type="button" class="rui-dir-btn" data-title-dir="0">↓</button>
                                <button type="button" class="rui-dir-btn" data-title-dir="90">→</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="rui-theme-separator"></div>
                    
                    <div class="rui-color-swatches">
                        <div class="rui-swatch-group">
                            <span class="rui-swatch-label">${ruiT('主体','Body')}</span>
                            <div class="rui-swatch-row">
                                <button type="button" class="rui-color-swatch" data-color="color1" style="background-color: ${this.defaults.color1}"></button>
                                <button type="button" class="rui-color-swatch" data-color="color2" style="background-color: ${this.defaults.color2}"></button>
                                <button type="button" class="rui-color-swatch" data-color="color3" style="background-color: ${this.defaults.color3}"></button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="rui-theme-direction-row">
                        <span class="rui-theme-label">${ruiT('主体方向','Body Direction')}</span>
                        <div class="rui-direction-buttons">
                            <button type="button" class="rui-dir-btn" data-dir="0">↓</button>
                            <button type="button" class="rui-dir-btn" data-dir="90">→</button>
                            <button type="button" class="rui-dir-btn" data-dir="45">↘</button>
                            <button type="button" class="rui-dir-btn" data-dir="315">↗</button>
                        </div>
                    </div>
                    
                    <div class="rui-theme-separator"></div>
                    
                    <div class="rui-swatch-group">
                        <span class="rui-swatch-label">${ruiT('文字颜色','Text Color')}</span>
                        <div class="rui-swatch-row">
                            <button type="button" class="rui-color-swatch rui-text-swatch" data-color="textColor" style="background-color: ${this.defaults.textColor}"></button>
                        </div>
                    </div>
                    
                    <div class="rui-theme-font-row">
                        <span class="rui-theme-label">${ruiT('文字大小','Font Size')}</span>
                        <div class="rui-font-size-control">
                            <button type="button" class="rui-font-btn" data-size-action="decrease">A-</button>
                            <span class="rui-font-size-value" id="rui-font-size-value">${this.defaults.fontSize}</span>
                            <button type="button" class="rui-font-btn" data-size-action="increase">A+</button>
                        </div>
                    </div>
                    
                    <div class="rui-theme-font-row">
                        <span class="rui-theme-label">${ruiT('文字位置','Text Align')}</span>
                        <div class="rui-align-buttons">
                            <button type="button" class="rui-align-btn" data-align="left">${ruiT('左','L')}</button>
                            <button type="button" class="rui-align-btn active" data-align="center">${ruiT('中','C')}</button>
                            <button type="button" class="rui-align-btn" data-align="right">${ruiT('右','R')}</button>
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button type="button" id="rui-apply-btn" class="rui-apply-btn" style="flex:1;margin:0;height:28px;padding:0 8px;line-height:28px;font-size:12px;">${ruiT('应用主题并关闭','Apply Theme & Close')}</button>
                        <button type="button" id="rui-reset-btn" class="rui-reset-btn" style="flex:1;margin:0;height:28px;padding:0 8px;line-height:28px;">${ruiT('恢复默认颜色','Reset Colors')}</button>
                    </div>
                    
                    <div class="rui-theme-separator"></div>
                    
                    <div class="rui-presets-section">
                        <div class="rui-presets-header">
                            <span class="rui-swatch-label">${ruiT('预设主题','Preset Themes')}</span>
                            <div class="rui-presets-row">
                                <div class="rui-preset-item" data-preset="0"></div>
                                <div class="rui-preset-item" data-preset="1"></div>
                                <div class="rui-preset-item" data-preset="2"></div>
                                <div class="rui-preset-item" data-preset="3"></div>
                                <div class="rui-preset-item" data-preset="4"></div>
                            </div>
                        </div>
                        <p class="rui-presets-tip">${ruiT('左键应用，右键保存当前设置','Left-click apply, right-click save current')}</p>
                    </div>

                    <div class="rui-theme-separator"></div>

                    <div class="rui-link-highlight-section">
                        <span class="rui-swatch-label">${ruiT('连线高亮','Link Highlight')}</span>
                        <button type="button" id="rui-link-highlight-btn" class="rui-toggle-switch rui-link-highlight-toggle" data-checked="false" title="${ruiT('开启后，选中节点的连线高亮，其他变暗','Highlight links of selected node, dim others')}">
                            <span class="rui-toggle-slider"></span>
                            <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                        </button>
                    </div>

                    <div class="rui-link-highlight-section">
                        <span class="rui-swatch-label">${ruiT('连线动画','Link Animation')}</span>
                        <button type="button" id="rui-link-anim-btn" class="rui-toggle-switch rui-link-anim-toggle" data-checked="false" title="${ruiT('开启后，所有连线显示动画效果','Show animation effect on all links')}">
                            <span class="rui-toggle-slider"></span>
                            <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                        </button>
                    </div>

                    <div class="rui-link-highlight-section" id="rui-link-anim-type-row" style="display:none;">
                        <span class="rui-swatch-label">${ruiT('动画类型','Anim Type')}</span>
                        <select id="rui-link-anim-type" style="background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:4px;padding:2px 6px;font-size:11px;">
                            <option value="sparkle">${ruiT('七彩星芒','Sparkle')}</option>
                            <option value="pulse">${ruiT('吃豆人','Pac-Man')}</option>
                            <option value="crystal">${ruiT('水晶溪流','Crystal Stream')}</option>
                            <option value="quantum">${ruiT('量子场','Quantum Field')}</option>
                            <option value="energy">${ruiT('能量脉冲','Energy Pulse')}</option>
                            <option value="lava">${ruiT('熔岩流','Lava Flow')}</option>
                            <option value="stellar">${ruiT('恒星等离子','Stellar Plasma')}</option>
                            <option value="transfer">${ruiT('高速穿梭','Simple Transfer')}</option>
                            <option value="randspark">${ruiT('随机闪烁','Random Sparkle')}</option>
                            <option value="diy1">${ruiT('金星流动','Gold Star Flow')}</option>
                            <option value="diy2">${ruiT('紫色箭头','Purple Arrow')}</option>
                        </select>
                    </div>

                    <div class="rui-link-highlight-section" id="rui-link-anim-speed-row" style="display:none;">
                        <span class="rui-swatch-label">${ruiT('动画速度','Anim Speed')}</span>
                        <input type="range" id="rui-link-anim-speed" min="0.1" max="3" step="0.1" value="1" style="flex:1;accent-color:#FFD700;">
                        <span id="rui-link-anim-speed-val" style="min-width:32px;text-align:right;font-size:11px;color:#FFD700;">1.0x</span>
                    </div>

                    <div class="rui-theme-separator"></div>

                    <div class="rui-wallpaper-section">
                        <div class="rui-wallpaper-header">
                            <span class="rui-swatch-label">${ruiT('画布壁纸','Canvas Wallpaper')}</span>
                            <button type="button" id="rui-wallpaper-btn" class="rui-toggle-switch rui-wallpaper-toggle" data-checked="false" title="${ruiT('开启画布壁纸背景','Enable canvas wallpaper background')}">
                                <span class="rui-toggle-slider"></span>
                                <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                            </button>
                        </div>

                        <div class="rui-wallpaper-controls" id="rui-wallpaper-controls" style="display:none;">
                            <div class="rui-wallpaper-upload-row">
                                <input type="file" id="rui-wallpaper-file-input" accept="image/*,video/*" style="display:none;">
                                <button type="button" id="rui-wallpaper-upload-btn" class="rui-wallpaper-btn">${ruiT('选择图片','Choose Image')}</button>
                                <button type="button" id="rui-wallpaper-clear-btn" class="rui-wallpaper-btn rui-wallpaper-clear">${ruiT('清除','Clear')}</button>
                            </div>

                            <div class="rui-wallpaper-row">
                                <span class="rui-swatch-label" style="font-size:12px;">${ruiT('透明度','Opacity')}</span>
                                <input type="range" id="rui-wallpaper-opacity" min="0" max="1" step="0.05" value="0.5" style="flex:1;">
                                <span class="rui-wallpaper-value" id="rui-wallpaper-opacity-val">50%</span>
                            </div>

                            <div class="rui-wallpaper-row">
                                <span class="rui-swatch-label" style="font-size:12px;">${ruiT('填充方式','Fill Mode')}</span>
                                <div class="rui-wallpaper-fit-btns">
                                    <button type="button" class="rui-wallpaper-fit-btn active" data-fit="cover">${ruiT('覆盖','Cover')}</button>
                                    <button type="button" class="rui-wallpaper-fit-btn" data-fit="contain">${ruiT('包含','Contain')}</button>
                                    <button type="button" class="rui-wallpaper-fit-btn" data-fit="fill">${ruiT('拉伸','Stretch')}</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- <div class="rui-link-highlight-section">
                        <span class="rui-swatch-label">连线颜色</span>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <button type="button" class="rui-color-swatch rui-linkcolor-swatch" data-color="linkColor" style="background-color: ${this.defaults.linkColor};width:18px;height:18px;min-width:18px;border-radius:3px;" title="连线颜色"></button>
                            <button type="button" id="rui-link-color-btn" class="rui-toggle-switch rui-link-color-toggle" data-checked="false" title="开启后，所有连线使用自定义颜色">
                                <span class="rui-toggle-slider"></span>
                                <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                            </button>
                        </div>
                    </div> -->

                    <!-- <div class="rui-link-highlight-section">
                        <span class="rui-swatch-label">连线动画</span>
                        <button type="button" id="rui-link-laser-btn" class="rui-toggle-switch rui-link-laser-toggle" data-checked="false" title="开启后，连线显示动画效果">
                            <span class="rui-toggle-slider"></span>
                            <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                        </button>
                    </div>

                    <div class="rui-link-highlight-section" id="rui-anim-type-section" style="display:none;">
                        <span class="rui-swatch-label" style="font-size:11px;color:#888;">动画风格</span>
                        <div style="display:flex;gap:3px;">
                            <button type="button" class="rui-anim-type-btn active" data-anim="flow" title="流光溢彩">✦</button>
                            <button type="button" class="rui-anim-type-btn" data-anim="gradient" title="颜色渐变">◆</button>
                            <button type="button" class="rui-anim-type-btn" data-anim="breath" title="亮度呼吸">●</button>
                            <button type="button" class="rui-anim-type-btn" data-anim="glow" title="辉光">☀</button>
                        </div>
                    </div> -->

                </div>
            </div>
            </div>
            <div class="rui-tab-content" data-tab-content="menuhide" style="display:none;">
                <div class="rui-menu-hide-full">
                    <div class="rui-menu-hide-tabs">
                        <button type="button" class="rui-menu-tab active" data-menu-tab="canvas">${ruiT('画布菜单','Canvas Menu')}</button>
                        <button type="button" class="rui-menu-tab" data-menu-tab="node">${ruiT('节点菜单','Node Menu')}</button>
                    </div>
                    <div class="rui-menu-search-box">
                        <input type="text" id="rui-menu-search-input" placeholder="${ruiT('🔍 搜索菜单项...','🔍 Search menu items...')}" />
                        <button type="button" class="rui-menu-search-clear" id="rui-menu-search-clear" title="${ruiT('清除搜索','Clear search')}" style="display: none;">✕</button>
                    </div>
                    <div class="rui-menu-hide-toolbar">
                        <button type="button" id="rui-menu-refresh-btn" class="rui-menu-tool-btn">${ruiT('刷新列表','Refresh List')}</button>
                        <button type="button" id="rui-menu-selectall-btn" class="rui-menu-tool-btn">${ruiT('隐藏全部','Hide All')}</button>
                        <button type="button" id="rui-menu-unselectall-btn" class="rui-menu-tool-btn">${ruiT('显示全部','Show All')}</button>
                    </div>
                    <div class="rui-menu-hide-list" id="rui-menu-hide-list">
                        <div class="rui-menu-empty-tip">${ruiT('点击「刷新列表」加载菜单项','Click "Refresh List" to load menu items')}<br><span style="font-size:11px;color:#888;">${ruiT('提示：先在画布上右键一次再刷新','Tip: right-click on canvas once before refreshing')}</span></div>
                    </div>
                    <button type="button" id="rui-menu-reset-btn" class="rui-menu-reset-btn">${ruiT('恢复所有隐藏菜单','Restore All Hidden Menus')}</button>
                </div>
            </div>
            <div class="rui-tab-content" data-tab-content="quicknodes" style="display:none;">
                <div class="rui-menu-hide-full">
                    <div class="rui-quick-nodes-count">${ruiT('已添加','Added')} <span id="rui-quick-count">0</span> / 20 ${ruiT('个快速节点','quick nodes')}</div>
                    <div class="rui-quick-setting-row">
                        <span>${ruiT('夺舍模式','Possession Mode')}</span>
                        <button type="button" id="rui-quick-hide-default-btn" class="rui-toggle-switch" data-checked="false" title="${ruiT('夺舍模式：开启后，连线菜单只显示快速节点','Possession mode: when on, link menu shows only quick nodes')}">
                            <span class="rui-toggle-slider"></span>
                            <span class="rui-toggle-label">${ruiT('关','Off')}</span>
                        </button>
                    </div>
                    <div class="rui-quick-setting-row">
                        <span>${ruiT('文字颜色','Text Color')}</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="color" id="rui-quick-text-color" value="#FFD700" style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;">
                            <span id="rui-quick-text-color-value" style="font-size:12px;color:#888;">#FFD700</span>
                        </div>
                    </div>
                    <div class="rui-menu-hide-toolbar" style="margin-bottom:6px;">
                        <button type="button" class="rui-menu-tool-btn" id="rui-quick-clear-btn">${ruiT('清空全部','Clear All')}</button>
                    </div>
                    <div class="rui-menu-hide-list" id="rui-quick-nodes-list">
                        <div class="rui-menu-empty-tip">${ruiT('暂无快速节点','No quick nodes yet')}<br><span style="font-size:11px;">${ruiT('右键节点可添加到快速节点','Right-click a node to add to quick nodes')}</span></div>
                    </div>
                    <p style="margin-top:8px;font-size:11px;color:#888;text-align:center;">${ruiT('拖拽可调整顺序，从节点拉出连线时搜索框顶部显示','Drag to reorder; shown atop the search box when dragging a link from a node')}</p>
                </div>
            </div>
        `;

        this.panel = panel;
        this.colorPicker = panel.querySelector(".rui-picker-section");
        this.bindEvents();
        document.body.appendChild(panel);
        
        const defaultDirBtn = panel.querySelector(`[data-dir="${this.defaults.direction}"]`);
        if (defaultDirBtn) defaultDirBtn.classList.add("active");

        const defaultTitleDirBtn = panel.querySelector(`[data-title-dir="${this.defaults.titleDirection}"]`);
        if (defaultTitleDirBtn) defaultTitleDirBtn.classList.add("active");

        const firstSwatch = panel.querySelector('.rui-color-swatch[data-color="color1"]');
        if (firstSwatch) {
            firstSwatch.classList.add("active");
            this.activeColorInput = "color1";
            this.setColorFromHex(this.defaults.color1, false);
        }

        this.updateShortcutDisplay();
        this.renderPresets();

        // 语言切换时重建面板，刷新所有静态文案（双语支持）
        try {
            const appRef = (typeof app !== "undefined" && app) || window.app;
            const lookup = appRef?.ui?.settings?.settingsLookup?.["Comfy.Locale"];
            if (lookup && !this.__rui_theme_lang_hooked) {
                this.__rui_theme_lang_hooked = true;
                const origOnChange = lookup.onChange;
                lookup.onChange = function () {
                    try {
                        const p = window.RUIThemePanel;
                        if (p && p.panel) { p.hide(); p.panel.remove(); p.panel = null; p.create(); p.show(); }
                    } catch (e) {}
                    return origOnChange?.apply(this, arguments);
                };
            }
        } catch (e) {}

        return panel;
    },

    bindEvents() {
        const panel = this.panel;
        const self = this;

        panel.querySelector(".rui-theme-close").addEventListener("click", () => {
            self.hide();
        });

        // 统一配置导出 / 导入（覆盖收藏 / 工作流 / 快速节点 / 隐藏菜单 / 主题等所有模块）
        const configExportBtn = panel.querySelector("#rui-theme-export-btn");
        const configImportBtn = panel.querySelector("#rui-theme-import-btn");
        const configImportFile = panel.querySelector("#rui-theme-import-file");

        if (configExportBtn) {
            configExportBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                self.exportAllConfig().catch(err => {
                    console.error("[RUI] Export error:", err);
                    alert(ruiT('导出失败：', 'Export failed: ') + err.message);
                });
            });
        }
        if (configImportBtn && configImportFile) {
            configImportBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                configImportFile.click();
            });
            configImportFile.addEventListener("change", (e) => {
                e.stopPropagation();
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const obj = JSON.parse(ev.target.result);
                        self.importAllConfig(obj).then((result) => {
                            if (result && result.applied) {
                                const parts = [];
                                if (result.appliedXzgConfig || result.appliedNotes) parts.push(ruiT('Rui配置', 'Rui config'));
                                if (result.appliedComfySettings) parts.push(ruiT('ComfyUI 设置', 'ComfyUI settings'));
                                const imported = parts.join(' + ');
                                alert(ruiT('导入成功（', 'Import succeeded (') + imported + ruiT('），正在刷新以应用全部配置…', '). Refreshing to apply all settings…'));
                                setTimeout(() => location.reload(), 300);
                            }
                            // 用户取消则不做任何操作
                        }).catch((err) => {
                            alert(ruiT('导入失败：配置文件无效', 'Import failed: invalid config file') + ' (' + err.message + ')');
                        });
                    } catch (err) {
                        alert(ruiT('导入失败：配置文件无效', 'Import failed: invalid config file') + ' (' + err.message + ')');
                    }
                };
                reader.readAsText(file);
                configImportFile.value = '';
            });
        }

        const shortcutBtn = panel.querySelector("#rui-theme-shortcut-btn");
        if (shortcutBtn) {
            shortcutBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                self.showShortcutDialog();
            });
        }

        const header = panel.querySelector(".rui-theme-header");
        header.style.cursor = "move";
        header.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("rui-theme-close") || 
                e.target.classList.contains("rui-theme-shortcut-btn") ||
                e.target.closest(".rui-theme-shortcut-btn")) return;
            self.isDragging = true;
            const rect = panel.getBoundingClientRect();
            self.dragOffsetX = e.clientX - rect.left;
            self.dragOffsetY = e.clientY - rect.top;
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener("mousemove", (e) => {
            if (!self.isDragging) return;
            let left = e.clientX - self.dragOffsetX;
            let top = e.clientY - self.dragOffsetY;
            const rect = panel.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) {
                left = window.innerWidth - rect.width;
            }
            if (top + rect.height > window.innerHeight) {
                top = window.innerHeight - rect.height;
            }
            if (left < 0) left = 0;
            if (top < 0) top = 0;
            panel.style.left = left + "px";
            panel.style.top = top + "px";
        });

        document.addEventListener("mouseup", () => {
            if (self.isDragging) {
                self.isDragging = false;
                self.savePosition();
            }
            self.isDraggingSV = false;
            self.isDraggingHue = false;
            self.isDraggingAlpha = false;
        });

        panel.querySelectorAll(".rui-color-swatch").forEach(swatch => {
            swatch.addEventListener("click", (e) => {
                e.stopPropagation();
                const colorKey = swatch.dataset.color;
                self.activeColorInput = colorKey;
                panel.querySelectorAll(".rui-color-swatch").forEach(s => s.classList.remove("active"));
                swatch.classList.add("active");
                const currentColor = self.getSwatchColor(colorKey);
                self.setColorFromHex(currentColor, false);
                requestAnimationFrame(() => {
                    self.syncPickerCursors();
                });
            });
        });

        panel.querySelectorAll(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                panel.querySelectorAll(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (self.isUpdatingFromNode) return;
                self.notifyChange();
            });
        });

        panel.querySelectorAll(".rui-title-dir-buttons .rui-dir-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                panel.querySelectorAll(".rui-title-dir-buttons .rui-dir-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (self.isUpdatingFromNode) return;
                self.notifyChange();
            });
        });

        const titleToggle = panel.querySelector(".rui-title-gradient-toggle");
        if (titleToggle) {
            titleToggle.addEventListener("click", () => {
                const isChecked = titleToggle.dataset.checked === "true";
                const newChecked = !isChecked;
                titleToggle.dataset.checked = String(newChecked);
                const label = titleToggle.querySelector(".rui-toggle-label");
                if (label) label.textContent = newChecked ? ruiT("开","On") : ruiT("关","Off");
                
                const titleSections = panel.querySelectorAll(".rui-title-swatch-section");
                titleSections.forEach(sec => {
                    sec.style.display = newChecked ? "" : "none";
                });
                
                if (self.isUpdatingFromNode) return;
                self.notifyChange();
            });
        }

        panel.querySelectorAll(".rui-font-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.sizeAction;
                const sizeEl = panel.querySelector("#rui-font-size-value");
                let size = parseInt(sizeEl.textContent) || 14;
                if (action === "increase") {
                    size = Math.min(24, size + 1);
                } else {
                    size = Math.max(10, size - 1);
                }
                sizeEl.textContent = size;
                if (self.isUpdatingFromNode) return;
                self.notifyChange();
            });
        });

        panel.querySelectorAll(".rui-align-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                panel.querySelectorAll(".rui-align-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (self.isUpdatingFromNode) return;
                self.notifyChange();
            });
        });

        panel.querySelector("#rui-apply-btn").addEventListener("click", () => {
            if (self.onApply) {
                self.onApply(self.getCurrentColors());
            }
            self.hide();
        });

        panel.querySelector("#rui-reset-btn").addEventListener("click", () => {
            if (self.onReset) {
                self.onReset();
            }
            self.hide();
        });

        panel.querySelectorAll(".rui-preset-item").forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                const index = parseInt(item.dataset.preset);
                self.applyPreset(index);
            });

            item.addEventListener("contextmenu", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = parseInt(item.dataset.preset);
                const confirmed = await self.showConfirmDialog(
                    ruiT('保存预设', 'Save Preset'),
                    ruiT(`确定要将当前主题设置保存到预设${index + 1}吗？`, `Are you sure you want to save current theme settings to preset ${index + 1}?`)
                );
                if (confirmed) {
                    self.saveCurrentToPreset(index);
                }
            });
        });

        const linkHighlightBtn = panel.querySelector("#rui-link-highlight-btn");
        if (linkHighlightBtn) {
            linkHighlightBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (window.RUIThemeManager) {
                    const active = window.RUIThemeManager.toggleLinkHighlight();
                    linkHighlightBtn.setAttribute("data-checked", active ? "true" : "false");
                    const label = linkHighlightBtn.querySelector(".rui-toggle-label");
                    if (label) label.textContent = active ? ruiT("开","On") : ruiT("关","Off");
                }
            });

            // 同步初始状态
            if (window.RUIThemeManager && window.RUIThemeManager.linkHighlightActive) {
                linkHighlightBtn.setAttribute("data-checked", "true");
                const label = linkHighlightBtn.querySelector(".rui-toggle-label");
                if (label) label.textContent = ruiT("开","On");
            }
        }

        const linkAnimBtn = panel.querySelector("#rui-link-anim-btn");
        const linkAnimTypeRow = panel.querySelector("#rui-link-anim-type-row");
        const linkAnimTypeSelect = panel.querySelector("#rui-link-anim-type");
        const linkAnimSpeedRow = panel.querySelector("#rui-link-anim-speed-row");
        const linkAnimSpeedSlider = panel.querySelector("#rui-link-anim-speed");
        const linkAnimSpeedVal = panel.querySelector("#rui-link-anim-speed-val");
        if (linkAnimBtn) {
            linkAnimBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (window.RUIThemeManager) {
                    const active = window.RUIThemeManager.toggleLinkAnim();
                    linkAnimBtn.setAttribute("data-checked", active ? "true" : "false");
                    const label = linkAnimBtn.querySelector(".rui-toggle-label");
                    if (label) label.textContent = active ? ruiT("开","On") : ruiT("关","Off");
                    if (linkAnimTypeRow) linkAnimTypeRow.style.display = active ? "" : "none";
                    if (linkAnimSpeedRow) linkAnimSpeedRow.style.display = active ? "" : "none";
                }
            });

            // 同步初始状态
            if (window.RUIThemeManager && window.RUIThemeManager.linkAnimActive) {
                linkAnimBtn.setAttribute("data-checked", "true");
                const label = linkAnimBtn.querySelector(".rui-toggle-label");
                if (label) label.textContent = ruiT("开","On");
                if (linkAnimTypeRow) linkAnimTypeRow.style.display = "";
                if (linkAnimSpeedRow) linkAnimSpeedRow.style.display = "";
            }
        }

        if (linkAnimTypeSelect) {
            // 同步初始值
            if (window.RUIThemeManager && window.RUIThemeManager.linkAnimType) {
                linkAnimTypeSelect.value = window.RUIThemeManager.linkAnimType;
            }
            linkAnimTypeSelect.addEventListener("change", (e) => {
                e.stopPropagation();
                if (window.RUIThemeManager) {
                    window.RUIThemeManager.setLinkAnimType(linkAnimTypeSelect.value);
                }
            });
        }

        if (linkAnimSpeedSlider) {
            // 同步初始值
            if (window.RUIThemeManager && window.RUIThemeManager.linkAnimSpeed) {
                const v = window.RUIThemeManager.linkAnimSpeed;
                linkAnimSpeedSlider.value = v;
                if (linkAnimSpeedVal) linkAnimSpeedVal.textContent = v.toFixed(1) + "x";
            }
            linkAnimSpeedSlider.addEventListener("input", (e) => {
                e.stopPropagation();
                const v = parseFloat(linkAnimSpeedSlider.value);
                if (window.RUIThemeManager) {
                    window.RUIThemeManager.setLinkAnimSpeed(v);
                }
                if (linkAnimSpeedVal) linkAnimSpeedVal.textContent = v.toFixed(1) + "x";
            });
        }

        // 壁纸开关
        const wallpaperBtn = panel.querySelector("#rui-wallpaper-btn");
        const wallpaperControls = panel.querySelector("#rui-wallpaper-controls");
        const wallpaperFileInput = panel.querySelector("#rui-wallpaper-file-input");
        const wallpaperUploadBtn = panel.querySelector("#rui-wallpaper-upload-btn");
        const wallpaperClearBtn = panel.querySelector("#rui-wallpaper-clear-btn");
        const wallpaperOpacity = panel.querySelector("#rui-wallpaper-opacity");
        const wallpaperOpacityVal = panel.querySelector("#rui-wallpaper-opacity-val");
        const wallpaperFitBtns = panel.querySelectorAll(".rui-wallpaper-fit-btn");

        if (wallpaperBtn) {
            wallpaperBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (window.RUIThemeManager) {
                    const current = window.RUIThemeManager.wallpaperActive;
                    const next = !current;
                    window.RUIThemeManager.setWallpaperActive(next);
                    wallpaperBtn.setAttribute("data-checked", next ? "true" : "false");
                    const label = wallpaperBtn.querySelector(".rui-toggle-label");
                    if (label) label.textContent = next ? ruiT("开","On") : ruiT("关","Off");
                    if (wallpaperControls) {
                        wallpaperControls.style.display = next ? "block" : "none";
                    }
                }
            });

            if (window.RUIThemeManager && window.RUIThemeManager.wallpaperActive) {
                wallpaperBtn.setAttribute("data-checked", "true");
                const label = wallpaperBtn.querySelector(".rui-toggle-label");
                if (label) label.textContent = ruiT("开","On");
                if (wallpaperControls) {
                    wallpaperControls.style.display = "block";
                }
            }
        }

        // 壁纸文件上传
        if (wallpaperUploadBtn && wallpaperFileInput) {
            wallpaperUploadBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                wallpaperFileInput.click();
            });

            wallpaperFileInput.addEventListener("change", (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    const isVideo = file.type.startsWith('video/');
                    const type = isVideo ? 'video' : 'image';
                    if (window.RUIThemeManager) {
                        window.RUIThemeManager.setWallpaperData(type, dataUrl);
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // 清除壁纸
        if (wallpaperClearBtn) {
            wallpaperClearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (window.RUIThemeManager) {
                    window.RUIThemeManager.clearWallpaper();
                    if (wallpaperBtn) {
                        wallpaperBtn.setAttribute("data-checked", "false");
                        const label = wallpaperBtn.querySelector(".rui-toggle-label");
                        if (label) label.textContent = ruiT("关","Off");
                    }
                    if (wallpaperControls) {
                        wallpaperControls.style.display = "none";
                    }
                }
            });
        }

        // 壁纸透明度
        if (wallpaperOpacity && wallpaperOpacityVal) {
            wallpaperOpacity.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                wallpaperOpacityVal.textContent = Math.round(val * 100) + "%";
                if (window.RUIThemeManager) {
                    window.RUIThemeManager.setWallpaperOpacity(val);
                }
            });

            if (window.RUIThemeManager) {
                const op = window.RUIThemeManager.wallpaperOpacity ?? 0.5;
                wallpaperOpacity.value = op;
                wallpaperOpacityVal.textContent = Math.round(op * 100) + "%";
            }
        }

        // 填充方式
        if (wallpaperFitBtns.length > 0) {
            wallpaperFitBtns.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const fit = btn.dataset.fit;
                    if (window.RUIThemeManager) {
                        window.RUIThemeManager.setWallpaperFit(fit);
                    }
                    wallpaperFitBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            if (window.RUIThemeManager) {
                const currentFit = window.RUIThemeManager.wallpaperFit || 'cover';
                wallpaperFitBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.fit === currentFit);
                });
            }
        }

        // 连线动画功能已取消
        // const linkLaserBtn = panel.querySelector("#rui-link-laser-btn");
        // const animTypeSection = panel.querySelector("#rui-anim-type-section");
        // if (linkLaserBtn) {
        //     linkLaserBtn.addEventListener("click", (e) => {
        //         e.stopPropagation();
        //         if (window.RUIThemeManager) {
        //             const active = window.RUIThemeManager.toggleLinkLaser();
        //             linkLaserBtn.setAttribute("data-checked", active ? "true" : "false");
        //             const label = linkLaserBtn.querySelector(".rui-toggle-label");
        //             if (label) label.textContent = active ? ruiT("开","On") : ruiT("关","Off");
        //             // 显示/隐藏动画风格选择
        //             if (animTypeSection) animTypeSection.style.display = active ? 'flex' : 'none';
        //         }
        //     });
        //
        //     // 同步初始状态
        //     if (window.RUIThemeManager && window.RUIThemeManager.linkLaserActive) {
        //         linkLaserBtn.setAttribute("data-checked", "true");
        //         const label = linkLaserBtn.querySelector(".rui-toggle-label");
        //         if (label) label.textContent = ruiT("开","On");
        //         if (animTypeSection) animTypeSection.style.display = 'flex';
        //     }
        // }

        // // 动画风格按钮事件
        // const animTypeBtns = panel.querySelectorAll('.rui-anim-type-btn');
        // animTypeBtns.forEach(btn => {
        //     btn.addEventListener('click', (e) => {
        //         e.stopPropagation();
        //         const type = btn.dataset.anim;
        //         if (window.RUIThemeManager) {
        //             window.RUIThemeManager.laserAnimType = type;
        //             try { localStorage.setItem('rui-laser-anim-type', type); } catch(e) {}
        //             if (app.canvas?.setDirty) app.canvas.setDirty(true, true);
        //         }
        //         animTypeBtns.forEach(b => b.classList.remove('active'));
        //         btn.classList.add('active');
        //     });
        // });
        // // 同步初始动画风格
        // if (window.RUIThemeManager) {
        //     const currentType = window.RUIThemeManager.laserAnimType || 'flow';
        //     animTypeBtns.forEach(btn => {
        //         btn.classList.toggle('active', btn.dataset.anim === currentType);
        //     });
        // }

        // 连线颜色功能已取消
        // const linkColorBtn = panel.querySelector("#rui-link-color-btn");
        // if (linkColorBtn) {
        //     linkColorBtn.addEventListener("click", (e) => {
        //         e.stopPropagation();
        //         if (window.RUIThemeManager) {
        //             const active = window.RUIThemeManager.toggleLinkColor();
        //             linkColorBtn.setAttribute("data-checked", active ? "true" : "false");
        //             const label = linkColorBtn.querySelector(".rui-toggle-label");
        //             if (label) label.textContent = active ? ruiT("开","On") : ruiT("关","Off");
        //         }
        //     });
        //
        //     // 同步初始状态
        //     if (window.RUIThemeManager && window.RUIThemeManager.linkColorActive) {
        //         linkColorBtn.setAttribute("data-checked", "true");
        //         const label = linkColorBtn.querySelector(".rui-toggle-label");
        //         if (label) label.textContent = ruiT("开","On");
        //     }
        // }

        // 菜单隐藏功能
        const menuHideBtn = panel.querySelector("#rui-menu-hide-btn");
        const menuHideControls = panel.querySelector("#rui-menu-hide-controls");
        const menuHideList = panel.querySelector("#rui-menu-hide-list");
        const menuTabs = panel.querySelectorAll(".rui-menu-tab");
        const menuRefreshBtn = panel.querySelector("#rui-menu-refresh-btn");
        const menuSelectAllBtn = panel.querySelector("#rui-menu-selectall-btn");
        const menuUnselectAllBtn = panel.querySelector("#rui-menu-unselectall-btn");
        const menuResetBtn = panel.querySelector("#rui-menu-reset-btn");
        const menuSearchInput = panel.querySelector("#rui-menu-search-input");
        const menuSearchClear = panel.querySelector("#rui-menu-search-clear");

        let currentMenuTab = 'canvas';
        let currentMenuSearch = '';

        const updateMenuSearchClearVisibility = () => {
            if (menuSearchClear && menuSearchInput) {
                menuSearchClear.style.display = menuSearchInput.value ? '' : 'none';
            }
        };

        const renderMenuList = () => {
            if (!window.RUIMenuHide || !menuHideList) return;
            const mh = window.RUIMenuHide;
            const hiddenMap = mh.config[currentMenuTab] || {};
            const items = mh._collectedItems?.[currentMenuTab] || [];

            if (items.length === 0) {
                menuHideList.innerHTML = '<div class="rui-menu-empty-tip">' + ruiT('点击「刷新列表」加载菜单项','Click "Refresh List" to load menu items') + '<br><span style="font-size:11px;color:#888;">' + ruiT('提示：先在画布上右键一次再刷新','Tip: right-click on canvas once before refreshing') + '</span></div>';
                return;
            }

            let filteredItems = items;
            if (currentMenuSearch) {
                const searchLower = currentMenuSearch.toLowerCase();
                filteredItems = items.filter(item => mh._searchMatch(item, searchLower));
            }

            if (filteredItems.length === 0) {
                menuHideList.innerHTML = '<div class="rui-menu-empty-tip">' + ruiT('没有匹配的菜单项','No matching menu items') + '</div>';
                return;
            }

            let html = '';
            filteredItems.forEach(item => {
                const isHidden = !!hiddenMap[item];
                const displayName = item.length > 28 ? item.substring(0, 28) + '...' : item;
                html += `
                    <label class="rui-menu-item" title="${item.replace(/"/g, '&quot;')}">
                        <input type="checkbox" data-menu-item="${item.replace(/"/g, '&quot;')}" ${isHidden ? 'checked' : ''}>
                        <span>${displayName}</span>
                    </label>
                `;
            });
            menuHideList.innerHTML = html;

            menuHideList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const item = cb.dataset.menuItem;
                    const checked = cb.checked;
                    if (window.RUIMenuHide) {
                        window.RUIMenuHide.setHidden(currentMenuTab, item, checked);
                    }
                });
            });
        };

        if (menuHideBtn && menuHideBtn.parentNode) {
            menuHideBtn.parentNode.removeChild(menuHideBtn);
        }

        const topTabs = panel.querySelectorAll(".rui-top-tab");
        const tabContents = panel.querySelectorAll(".rui-tab-content");
        let themeTabHeight = 0;

        const switchTopTab = (tabName) => {
            if (tabName === 'menuhide' || tabName === 'quicknodes') {
                const themeTab = panel.querySelector('.rui-tab-content[data-tab-content="theme"]');
                if (themeTab && themeTab.offsetHeight > 0) {
                    themeTabHeight = themeTab.offsetHeight;
                }
                const targetTab = panel.querySelector(`.rui-tab-content[data-tab-content="${tabName}"]`);
                if (targetTab && themeTabHeight > 0) {
                    targetTab.style.height = themeTabHeight + 'px';
                }
            }
            topTabs.forEach(t => t.classList.toggle('active', t.dataset.topTab === tabName));
            tabContents.forEach(c => {
                c.style.display = c.dataset.tabContent === tabName ? '' : 'none';
            });

            try { localStorage.setItem('rui-theme-panel-tab', tabName); } catch(e) {}

            if (tabName === 'menuhide') {
                if (window.RUIMenuHide) {
                    window.RUIMenuHide.setEnabled(true);
                    window.RUIMenuHide.init();
                }
                setTimeout(renderMenuList, 100);
            } else if (tabName === 'quicknodes') {
                setTimeout(renderQuickNodesList, 50);
            }
        };

        topTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                switchTopTab(tab.dataset.topTab);
            });
        });

        let savedTab = 'theme';
        try {
            const t = localStorage.getItem('rui-theme-panel-tab');
            if (t === 'menuhide' || t === 'theme' || t === 'quicknodes') savedTab = t;
        } catch(e) {}

        if (savedTab === 'menuhide' || savedTab === 'quicknodes') {
            const themeTab = panel.querySelector('.rui-tab-content[data-tab-content="theme"]');
            const targetTab = panel.querySelector(`.rui-tab-content[data-tab-content="${savedTab}"]`);
            if (themeTab && targetTab) {
                themeTab.style.display = '';
                targetTab.style.display = 'none';
                requestAnimationFrame(() => {
                    if (themeTab.offsetHeight > 0) {
                        targetTab.style.height = themeTab.offsetHeight + 'px';
                    }
                    switchTopTab(savedTab);
                });
            } else {
                switchTopTab(savedTab);
            }
        } else {
            switchTopTab(savedTab);
        }

        if (menuTabs && menuTabs.length > 0) {
            menuTabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentMenuTab = tab.dataset.menuTab;
                    menuTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    renderMenuList();
                });
            });
        }

        if (menuRefreshBtn) {
            menuRefreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.RUIMenuHide) {
                    window.RUIMenuHide.collectCurrentMenu(currentMenuTab);
                    renderMenuList();
                }
            });
        }

        if (menuSelectAllBtn) {
            menuSelectAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.RUIMenuHide) return;
                const mh = window.RUIMenuHide;
                const items = mh._collectedItems?.[currentMenuTab] || [];
                items.forEach(item => mh.setHidden(currentMenuTab, item, true));
                renderMenuList();
            });
        }

        if (menuUnselectAllBtn) {
            menuUnselectAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.RUIMenuHide) return;
                const mh = window.RUIMenuHide;
                const items = mh._collectedItems?.[currentMenuTab] || [];
                items.forEach(item => mh.setHidden(currentMenuTab, item, false));
                renderMenuList();
            });
        }

        if (menuResetBtn) {
            menuResetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.RUIMenuHide) return;
                if (confirm(ruiT('确定要恢复所有被隐藏的菜单项吗？','Sure to restore all hidden menu items?'))) {
                    window.RUIMenuHide.resetAll();
                    renderMenuList();
                }
            });
        }

        if (menuSearchInput) {
            menuSearchInput.addEventListener('input', (e) => {
                e.stopPropagation();
                currentMenuSearch = e.target.value;
                renderMenuList();
                updateMenuSearchClearVisibility();
            });
            menuSearchInput.addEventListener('click', (e) => e.stopPropagation());
            menuSearchInput.addEventListener('pointerdown', (e) => e.stopPropagation());
            menuSearchInput.addEventListener('mousedown', (e) => e.stopPropagation());
        }

        if (menuSearchClear) {
            menuSearchClear.addEventListener('click', (e) => {
                e.stopPropagation();
                if (menuSearchInput) {
                    menuSearchInput.value = '';
                    currentMenuSearch = '';
                    renderMenuList();
                    updateMenuSearchClearVisibility();
                    menuSearchInput.focus();
                }
            });
        }

        if (window.RUIMenuHide) {
            setTimeout(renderMenuList, 200);
        }

        this._menuListVisible = true;
        this._refreshMenuListUI = () => {
            if (this._menuListVisible && panel.style.display !== 'none') {
                const menuContent = panel.querySelector('.rui-tab-content[data-tab-content="menuhide"]');
                if (menuContent && menuContent.style.display !== 'none') {
                    renderMenuList();
                }
            }
        };

        function renderQuickNodesList() {
            const listEl = panel.querySelector('#rui-quick-nodes-list');
            const countEl = panel.querySelector('#rui-quick-count');
            if (!listEl || !countEl) return;

            const quickNodes = window.RUIQuickNodes?.getQuickNodeList() || [];
            countEl.textContent = quickNodes.length;

            if (quickNodes.length === 0) {
                listEl.innerHTML = '<div class="rui-menu-empty-tip">' + ruiT('暂无快速节点','No quick nodes yet') + '<br><span style="font-size:11px;">' + ruiT('右键节点可添加到快速节点','Right-click a node to add to quick nodes') + '</span></div>';
                return;
            }

            listEl.innerHTML = '';
            quickNodes.forEach((node, index) => {
                const item = document.createElement('div');
                item.className = 'rui-quick-node-manage-item';
                item.draggable = true;
                item.dataset.index = index;
                item.dataset.type = node.type;

                const dragHandle = document.createElement('span');
                dragHandle.className = 'rui-quick-drag-handle';
                dragHandle.textContent = '⠿';
                item.appendChild(dragHandle);

                const info = document.createElement('div');
                info.className = 'rui-quick-node-info';
                
                const name = document.createElement('div');
                name.className = 'rui-quick-node-name';
                name.textContent = node.title;
                info.appendChild(name);

                const type = document.createElement('div');
                type.className = 'rui-quick-node-type';
                type.textContent = node.type;
                info.appendChild(type);

                item.appendChild(info);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'rui-quick-node-remove-btn';
                removeBtn.textContent = ruiT('移除','Remove');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.RUIQuickNodes) {
                        window.RUIQuickNodes.removeQuickNode(node.type);
                        renderQuickNodesList();
                    }
                });
                item.appendChild(removeBtn);

                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index.toString());
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    document.querySelectorAll('.rui-quick-node-manage-item').forEach(i => {
                        i.classList.remove('drag-over');
                    });
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    item.classList.add('drag-over');
                });

                item.addEventListener('dragleave', () => {
                    item.classList.remove('drag-over');
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    item.classList.remove('drag-over');
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIndex = parseInt(item.dataset.index);
                    if (!isNaN(fromIndex) && !isNaN(toIndex) && fromIndex !== toIndex) {
                        if (window.RUIQuickNodes) {
                            window.RUIQuickNodes.moveQuickNode(fromIndex, toIndex);
                            renderQuickNodesList();
                        }
                    }
                });

                listEl.appendChild(item);
            });
        }

        const quickClearBtn = panel.querySelector('#rui-quick-clear-btn');
        if (quickClearBtn) {
            quickClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.RUIQuickNodes && confirm(ruiT('确定要清空所有快速节点吗？','Sure to clear all quick nodes?'))) {
                    const nodes = window.RUIQuickNodes.getQuickNodeList();
                    nodes.forEach(n => window.RUIQuickNodes.removeQuickNode(n.type));
                    renderQuickNodesList();
                }
            });
        }

        const quickHideDefaultBtn = panel.querySelector('#rui-quick-hide-default-btn');

        if (quickHideDefaultBtn) {
            if (window.RUIQuickNodes) {
                const checked = window.RUIQuickNodes.isHideDefaultMenu();
                quickHideDefaultBtn.setAttribute("data-checked", checked ? "true" : "false");
                const label = quickHideDefaultBtn.querySelector(".rui-toggle-label");
                if (label) label.textContent = checked ? ruiT("开","On") : ruiT("关","Off");
            }
            quickHideDefaultBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.RUIQuickNodes) {
                    const checked = window.RUIQuickNodes.isHideDefaultMenu();
                    const newChecked = !checked;
                    window.RUIQuickNodes.setHideDefaultMenu(newChecked);
                    quickHideDefaultBtn.setAttribute("data-checked", newChecked ? "true" : "false");
                    const label = quickHideDefaultBtn.querySelector(".rui-toggle-label");
                    if (label) label.textContent = newChecked ? ruiT("开","On") : ruiT("关","Off");
                }
            });
        }

        const quickTextColorInput = panel.querySelector('#rui-quick-text-color');
        const quickTextColorValue = panel.querySelector('#rui-quick-text-color-value');
        if (quickTextColorInput && quickTextColorValue) {
            if (window.RUIQuickNodes) {
                const color = window.RUIQuickNodes.getTextColor();
                quickTextColorInput.value = color;
                quickTextColorValue.textContent = color.toUpperCase();
            }
            quickTextColorInput.addEventListener('input', (e) => {
                const color = e.target.value;
                quickTextColorValue.textContent = color.toUpperCase();
                if (window.RUIQuickNodes) {
                    window.RUIQuickNodes.setTextColor(color);
                }
            });
        }

        window.RUIThemePanel = window.RUIThemePanel || {};
        window.RUIThemePanel.refreshQuickNodesTab = () => {
            if (panel.style.display !== 'none') {
                const quickTab = panel.querySelector('.rui-tab-content[data-tab-content="quicknodes"]');
                if (quickTab && quickTab.style.display !== 'none') {
                    renderQuickNodesList();
                    if (quickHideDefaultBtn && window.RUIQuickNodes) {
                        const checked = window.RUIQuickNodes.isHideDefaultMenu();
                        quickHideDefaultBtn.setAttribute("data-checked", checked ? "true" : "false");
                        const label = quickHideDefaultBtn.querySelector(".rui-toggle-label");
                        if (label) label.textContent = checked ? ruiT("开","On") : ruiT("关","Off");
                    }
                    if (quickTextColorInput && quickTextColorValue && window.RUIQuickNodes) {
                        const color = window.RUIQuickNodes.getTextColor();
                        quickTextColorInput.value = color;
                        quickTextColorValue.textContent = color.toUpperCase();
                    }
                }
            }
        };

        panel.addEventListener("pointerdown", (e) => e.stopPropagation());
        panel.addEventListener("mousedown", (e) => e.stopPropagation());
        panel.addEventListener("contextmenu", (e) => e.stopPropagation());

        this.bindPickerEvents();
    },

    bindPickerEvents() {
        const picker = this.colorPicker;
        const self = this;

        const svArea = picker.querySelector("#rui-sv-area");
        
        const startSV = (e) => {
            self.isDraggingSV = true;
            self.updateSVFromEvent(e);
            e.preventDefault();
        };
        svArea.addEventListener("mousedown", startSV);
        
        document.addEventListener("mousemove", (e) => {
            if (self.isDraggingSV) {
                self.updateSVFromEvent(e);
            }
            if (self.isDraggingHue) {
                self.updateHueFromEvent(e);
            }
            if (self.isDraggingAlpha) {
                self.updateAlphaFromEvent(e);
            }
        });

        const hueBar = picker.querySelector("#rui-hue-bar");
        const startHue = (e) => {
            self.isDraggingHue = true;
            self.updateHueFromEvent(e);
            e.preventDefault();
        };
        hueBar.addEventListener("mousedown", startHue);

        // Alpha slider events
        const alphaBar = picker.querySelector("#rui-alpha-bar");
        if (alphaBar) {
            const startAlpha = (e) => {
                self.isDraggingAlpha = true;
                self.updateAlphaFromEvent(e);
                e.preventDefault();
            };
            alphaBar.addEventListener("mousedown", startAlpha);
        }

        // Hex input events
        const hexInput = picker.querySelector("#rui-hex-input");
        if (hexInput) {
            hexInput.addEventListener("input", (e) => {
                e.stopPropagation();
            });
            hexInput.addEventListener("change", () => {
                const val = hexInput.value.trim();
                if (/^#?[0-9a-fA-F]{3,8}$/.test(val)) {
                    const hex = val.startsWith('#') ? val : '#' + val;
                    self.setColorFromHex(hex, true);
                    if (self.isVisible) requestAnimationFrame(() => self.syncPickerCursors());
                }
            });
            hexInput.addEventListener("keydown", (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    hexInput.blur();
                }
            });
        }

        // Eyedropper events
        const eyedropperBtn = picker.querySelector("#rui-eyedropper-btn");
        if (eyedropperBtn) {
            eyedropperBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                self.startEyedropper();
            });
        }

        picker.addEventListener("pointerdown", (e) => e.stopPropagation());
        picker.addEventListener("mousedown", (e) => e.stopPropagation());
        picker.addEventListener("contextmenu", (e) => e.stopPropagation());
    },

    updateSVFromEvent(e) {
        const svArea = this.colorPicker.querySelector("#rui-sv-area");
        const svCursor = this.colorPicker.querySelector("#rui-sv-cursor");
        const rect = svArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        x = Math.max(0, Math.min(rect.width, x));
        y = Math.max(0, Math.min(rect.height, y));
        
        svCursor.style.left = x + "px";
        svCursor.style.top = y + "px";
        
        const hsvS = (x / rect.width) * 100;
        const hsvV = 100 - (y / rect.height) * 100;
        
        const hsl = this.hsvToHsl(this.pickerState.h, hsvS, hsvV);
        this.pickerState.s = hsl.s;
        this.pickerState.l = hsl.l;
        
        this.applyColorFromPicker();
    },

    updateHueFromEvent(e) {
        const hueBar = this.colorPicker.querySelector("#rui-hue-bar");
        const hueCursor = this.colorPicker.querySelector("#rui-hue-cursor");
        const rect = hueBar.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(rect.width, x));
        
        hueCursor.style.left = x + "px";
        
        const h = (x / rect.width) * 360;
        this.pickerState.h = h;
        
        const svArea = this.colorPicker.querySelector("#rui-sv-area");
        svArea.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
        
        // Update alpha bar gradient color
        this.updateAlphaBarPreview();
        
        this.applyColorFromPicker();
    },

    updateAlphaFromEvent(e) {
        const alphaBar = this.colorPicker.querySelector("#rui-alpha-bar");
        const alphaCursor = this.colorPicker.querySelector("#rui-alpha-cursor");
        const rect = alphaBar.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(rect.width, x));
        
        alphaCursor.style.left = x + "px";
        
        this.pickerState.a = x / rect.width;
        
        this.applyColorFromPicker();
    },

    updateAlphaBarPreview() {
        const { h, s, l } = this.pickerState;
        const rgb = this.hslToRgb(h, s, l);
        const color = `hsl(${h}, ${s}%, ${l}%)`;
        const alphaColor = this.colorPicker.querySelector("#rui-alpha-color");
        if (alphaColor) {
            alphaColor.style.background = `linear-gradient(to right, transparent, ${color})`;
        }
    },

    hsvToHsl(h, s, v) {
        s = s / 100;
        v = v / 100;
        const l = v * (1 - s / 2);
        const hslS = v === 0 ? 0 : (v - l) / Math.min(l, 1 - l);
        return { h: h, s: hslS * 100, l: l * 100 };
    },

    hslToHsv(h, s, l) {
        s = s / 100;
        l = l / 100;
        const v = l + s * Math.min(l, 1 - l);
        const hsvS = v === 0 ? 0 : 2 * (1 - l / v);
        return { h: h, s: hsvS * 100, v: v * 100 };
    },

    setColorFromHex(hex, updateSwatch = true, fromRgb = false) {
        const rgb = this.hexToRgb(hex);
        if (!rgb) return;
        
        const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
        this.pickerState.h = hsl.h;
        this.pickerState.s = hsl.s;
        this.pickerState.l = hsl.l;
        
        if (updateSwatch && this.activeColorInput) {
            this.setActiveColor(hex);
        }
    },

    applyColorFromPicker() {
        if (!this.activeColorInput) return;
        const { h, s, l } = this.pickerState;
        const rgb = this.hslToRgb(h, s, l);
        const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
        this.setActiveColor(hex);
    },

    setActiveColor(color) {
        if (!this.activeColorInput) return;
        
        const swatch = this.panel.querySelector(`[data-color="${this.activeColorInput}"]`);
        if (swatch) {
            swatch.style.backgroundColor = color;
        }
        
        // 连线颜色功能已取消
        // 连线颜色特殊处理：同步到 RUIThemeManager 并保存
        // if (this.activeColorInput === 'linkColor') {
        //     if (window.RUIThemeManager) {
        //         window.RUIThemeManager.linkColor = color;
        //     }
        //     try {
        //         localStorage.setItem('rui-link-color', color);
        //     } catch(e) {}
        //     // 触发重绘以更新连线颜色
        //     if (window.app?.canvas?.setDirty) {
        //         app.canvas.setDirty(true, true);
        //     }
        // }
        
        // Update hex input
        this.updateHexInput();
        // Update gradient preview
        this.updateGradientPreview();
        // Add to recent colors
        if (this.isVisible) this.addRecentColor(color);
        
        if (this.isUpdatingFromNode) return;
        // 连线颜色不需要触发节点主题变更（功能已取消）
        // if (this.activeColorInput === 'linkColor') return;
        this.notifyChange();
    },

    updateHexInput() {
        if (!this.activeColorInput) return;
        const hexInput = this.colorPicker.querySelector("#rui-hex-input");
        if (hexInput) {
            const swatch = this.panel.querySelector(`[data-color="${this.activeColorInput}"]`);
            if (swatch) {
                const bg = swatch.style.backgroundColor;
                const rgbMatch = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgbMatch) {
                    hexInput.value = this.rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
                } else if (bg.startsWith('#')) {
                    hexInput.value = bg;
                }
            }
        }
    },

    updateGradientPreview() {
        const preview = this.panel?.querySelector("#rui-gradient-preview");
        if (!preview) return;
        
        const colors = this.getCurrentColors();
        const cssDeg = this.presetDirToCssDeg(colors.direction);
        const useTitleGradient = colors.useTitleGradient;
        
        if (useTitleGradient) {
            preview.style.background = `
                linear-gradient(${cssDeg}deg, ${colors.color1} 0%, ${colors.color2} 50%, ${colors.color3} 100%),
                linear-gradient(to bottom, ${colors.titleColor1}, ${colors.titleColor2}, ${colors.titleColor3})
            `;
            // Show split preview: top 40% title, bottom 60% body
            const titleDeg = this.presetDirToCssDeg(colors.titleDirection);
            preview.style.background = `linear-gradient(${titleDeg}deg, ${colors.titleColor1} 0%, ${colors.titleColor2} 50%, ${colors.titleColor3} 100%)`;
            preview.style.borderBottom = `2px solid ${colors.titleColor3}`;
        } else {
            preview.style.background = `linear-gradient(${cssDeg}deg, ${colors.color1} 0%, ${colors.color2} 50%, ${colors.color3} 100%)`;
            preview.style.borderBottom = 'none';
        }
    },

    hslToRgb(h, s, l) {
        h = h / 360;
        s = s / 100;
        l = l / 100;
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return { r: r * 255, g: g * 255, b: b * 255 };
    },

    rgbToHsl(r, g, b) {
        r = r / 255;
        g = g / 255;
        b = b / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        
        return { h: h * 360, s: s * 100, l: l * 100 };
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    rgbToHex(r, g, b) {
        r = Math.round(Math.max(0, Math.min(255, r)));
        g = Math.round(Math.max(0, Math.min(255, g)));
        b = Math.round(Math.max(0, Math.min(255, b)));
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    getSwatchColor(colorKey) {
        const swatch = this.panel.querySelector(`[data-color="${colorKey}"]`);
        if (swatch) {
            const bg = swatch.style.backgroundColor || swatch.style.background || "#667eea";
            const rgbMatch = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
                return this.rgbToHex(
                    parseInt(rgbMatch[1]),
                    parseInt(rgbMatch[2]),
                    parseInt(rgbMatch[3])
                );
            }
            return bg || "#667eea";
        }
        return "#667eea";
    },

    notifyChange() {
        const colors = this.getCurrentColors();
        const theme = {
            id: "custom",
            name: "自定义",
            colors: {
                titleText: colors.textColor,
                color1: colors.color1,
                color2: colors.color2,
                color3: colors.color3,
                direction: colors.direction,
                titleColor1: colors.titleColor1,
                titleColor2: colors.titleColor2,
                titleColor3: colors.titleColor3,
                titleDirection: colors.titleDirection,
                useTitleGradient: colors.useTitleGradient,
                useGradient: colors.useGradient,
                fontSize: colors.fontSize,
                textAlign: colors.textAlign
            }
        };

        if (this.onThemeChange) {
            this.onThemeChange(theme);
        }
    },

    savePosition() {
        if (!this.panel) return;
        const rect = this.panel.getBoundingClientRect();
        try {
            localStorage.setItem(this.positionKey, JSON.stringify({
                left: rect.left,
                top: rect.top
            }));
        } catch(e) {}
    },

    loadPosition() {
        try {
            const saved = localStorage.getItem(this.positionKey);
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return null;
    },

    getCurrentColors() {
        const panel = this.panel;
        const color1 = this.getSwatchColor("color1");
        const color2 = this.getSwatchColor("color2");
        const color3 = this.getSwatchColor("color3");
        const titleColor1 = this.getSwatchColor("titleColor1");
        const titleColor2 = this.getSwatchColor("titleColor2");
        const titleColor3 = this.getSwatchColor("titleColor3");
        const textColor = this.getSwatchColor("textColor");
        const direction = panel.querySelector(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn.active")?.dataset.dir || "135";
        const titleDirection = panel.querySelector(".rui-title-dir-buttons .rui-dir-btn.active")?.dataset.titleDir || "135";
        const fontSize = parseInt(panel.querySelector("#rui-font-size-value")?.textContent) || 14;
        const textAlign = panel.querySelector(".rui-align-btn.active")?.dataset.align || "left";
        const titleToggle = panel.querySelector(".rui-title-gradient-toggle");
        const useTitleGradient = titleToggle ? titleToggle.dataset.checked === "true" : false;

        return { 
            color1, color2, color3, 
            titleColor1, titleColor2, titleColor3,
            textColor, 
            direction, 
            titleDirection,
            useGradient: true, 
            useTitleGradient: useTitleGradient,
            fontSize, 
            textAlign 
        };
    },

    resetToDefault() {
        const panel = this.panel;
        if (!panel) return;

        this.isUpdatingFromNode = true;

        const c1 = panel.querySelector('[data-color="color1"]');
        const c2 = panel.querySelector('[data-color="color2"]');
        const c3 = panel.querySelector('[data-color="color3"]');
        const tc1 = panel.querySelector('[data-color="titleColor1"]');
        const tc2 = panel.querySelector('[data-color="titleColor2"]');
        const tc3 = panel.querySelector('[data-color="titleColor3"]');
        const ct = panel.querySelector('[data-color="textColor"]');
        // const lkc = panel.querySelector('[data-color="linkColor"]');
        if (c1) c1.style.backgroundColor = this.defaults.color1;
        if (c2) c2.style.backgroundColor = this.defaults.color2;
        if (c3) c3.style.backgroundColor = this.defaults.color3;
        if (tc1) tc1.style.backgroundColor = this.defaults.titleColor1;
        if (tc2) tc2.style.backgroundColor = this.defaults.titleColor2;
        if (tc3) tc3.style.backgroundColor = this.defaults.titleColor3;
        if (ct) ct.style.backgroundColor = this.defaults.textColor;
        // if (lkc) lkc.style.backgroundColor = this.defaults.linkColor;
        // 连线颜色功能已取消
        // if (window.RUIThemeManager) {
        //     window.RUIThemeManager.linkColor = this.defaults.linkColor;
        // }
        // try {
        //     localStorage.setItem('rui-link-color', this.defaults.linkColor);
        // } catch(e) {}

        panel.querySelectorAll(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const defaultDir = panel.querySelector(`[data-dir="${this.defaults.direction}"]`);
        if (defaultDir) defaultDir.classList.add("active");

        panel.querySelectorAll(".rui-title-dir-buttons .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const defaultTitleDir = panel.querySelector(`[data-title-dir="${this.defaults.titleDirection}"]`);
        if (defaultTitleDir) defaultTitleDir.classList.add("active");

        const titleToggle = panel.querySelector(".rui-title-gradient-toggle");
        if (titleToggle) {
            titleToggle.dataset.checked = String(this.defaults.useTitleGradient);
            const label = titleToggle.querySelector(".rui-toggle-label");
            if (label) label.textContent = this.defaults.useTitleGradient ? ruiT("开","On") : ruiT("关","Off");
        }
        const titleSections = panel.querySelectorAll(".rui-title-swatch-section");
        titleSections.forEach(sec => {
            sec.style.display = this.defaults.useTitleGradient ? "" : "none";
        });

        const fontSizeEl = panel.querySelector("#rui-font-size-value");
        if (fontSizeEl) fontSizeEl.textContent = this.defaults.fontSize;

        panel.querySelectorAll(".rui-align-btn").forEach(b => b.classList.remove("active"));
        const defaultAlign = panel.querySelector(`[data-align="${this.defaults.textAlign}"]`);
        if (defaultAlign) defaultAlign.classList.add("active");

        panel.querySelectorAll(".rui-color-swatch").forEach(s => s.classList.remove("active"));
        const firstSwatch = panel.querySelector('[data-color="color1"]');
        if (firstSwatch) {
            firstSwatch.classList.add("active");
            this.activeColorInput = "color1";
        }
        this.setColorFromHex(this.defaults.color1, false);
        if (this.isVisible) {
            requestAnimationFrame(() => {
                this.syncPickerCursors();
            });
        }

        this.isUpdatingFromNode = false;
    },

    setCurrentTheme(themeData) {
        const panel = this.panel;
        if (!panel || !themeData || !themeData.colors) return;

        this.isUpdatingFromNode = true;

        const c = themeData.colors;
        const c1 = panel.querySelector('[data-color="color1"]');
        const c2 = panel.querySelector('[data-color="color2"]');
        const c3 = panel.querySelector('[data-color="color3"]');
        const tc1 = panel.querySelector('[data-color="titleColor1"]');
        const tc2 = panel.querySelector('[data-color="titleColor2"]');
        const tc3 = panel.querySelector('[data-color="titleColor3"]');
        const ct = panel.querySelector('[data-color="textColor"]');
        if (c1 && c.color1) c1.style.backgroundColor = c.color1;
        if (c2 && c.color2) c2.style.backgroundColor = c.color2;
        if (c3 && c.color3) c3.style.backgroundColor = c.color3;
        if (tc1 && c.titleColor1) tc1.style.backgroundColor = c.titleColor1;
        if (tc2 && c.titleColor2) tc2.style.backgroundColor = c.titleColor2;
        if (tc3 && c.titleColor3) tc3.style.backgroundColor = c.titleColor3;
        if (ct && c.titleText) ct.style.backgroundColor = c.titleText;

        const dir = c.direction || "135";
        panel.querySelectorAll(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const dirBtn = panel.querySelector(`[data-dir="${dir}"]`);
        if (dirBtn) dirBtn.classList.add("active");

        const titleDir = c.titleDirection || "135";
        panel.querySelectorAll(".rui-title-dir-buttons .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const titleDirBtn = panel.querySelector(`[data-title-dir="${titleDir}"]`);
        if (titleDirBtn) titleDirBtn.classList.add("active");

        const useTitleGradient = c.useTitleGradient === true;
        const titleToggle = panel.querySelector(".rui-title-gradient-toggle");
        if (titleToggle) {
            titleToggle.dataset.checked = String(useTitleGradient);
            const label = titleToggle.querySelector(".rui-toggle-label");
            if (label) label.textContent = useTitleGradient ? ruiT("开","On") : ruiT("关","Off");
        }
        const titleSections = panel.querySelectorAll(".rui-title-swatch-section");
        titleSections.forEach(sec => {
            sec.style.display = useTitleGradient ? "" : "none";
        });

        if (c.fontSize !== undefined) {
            const fontSizeEl = panel.querySelector("#rui-font-size-value");
            if (fontSizeEl) fontSizeEl.textContent = c.fontSize;
        }

        const align = c.textAlign || "left";
        panel.querySelectorAll(".rui-align-btn").forEach(b => b.classList.remove("active"));
        const alignBtn = panel.querySelector(`[data-align="${align}"]`);
        if (alignBtn) alignBtn.classList.add("active");

        this.isUpdatingFromNode = false;
        
        if (this.isVisible) {
            const activeColor = this.getSwatchColor(this.activeColorInput || "color1");
            this.setColorFromHex(activeColor, false);
            requestAnimationFrame(() => {
                this.syncPickerCursors();
            });
        }
    },

    show(x, y) {
        if (!this.panel) this.create();
        this.isVisible = true;
        this.panel.style.display = "block";
        
        const rect = this.panel.getBoundingClientRect();
        let left, top;

        const savedPos = this.loadPosition();
        if (savedPos) {
            left = savedPos.left;
            top = savedPos.top;
        } else if (x !== undefined && y !== undefined) {
            left = x;
            top = y;
        } else {
            left = window.innerWidth - rect.width - 10;
            top = Math.max(10, (window.innerHeight - rect.height) / 2);
        }

        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 10;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 10;
        }
        if (left < 10) left = 10;
        if (top < 10) top = 10;

        this.panel.style.left = left + "px";
        this.panel.style.top = top + "px";
        
        requestAnimationFrame(() => {
            this.syncPickerCursors();
            this.updateGradientPreview();
            this.updateRecentDisplay();
        });

        // 点击空白画布关闭面板
        this._setupCanvasBgClose();

        // Bind clear recent colors button (re-bind on each show for safety)
        const clearBtn = document.getElementById("rui-clear-recent");
        if (clearBtn && !clearBtn._bound) {
            clearBtn._bound = true;
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.clearRecentColors();
            });
        }
    },

    _setupCanvasBgClose() {
        if (this._canvasBgCloseHandler) return;
        const self = this;
        this._canvasBgCloseHandler = (e) => {
            if (!self.isVisible) return;
            // 点击面板内部 → 不关闭
            if (self.panel && self.panel.contains(e.target)) return;
            // 点击面板的弹出层（取色器 / 对话框）→ 不关闭
            if (e.target.closest(".rui-dialog-overlay") || e.target.closest(".rui-color-picker-popup") || e.target.closest(".rui-wf-dialog-overlay")) return;
            // 点击菜单 / 右键菜单 → 不关闭
            if (e.target.closest(".comfy-menu") || e.target.closest(".litecontextmenu") || e.target.closest(".context-menu")) return;

            // 判断点击位置是否在画布区域内
            const graphCanvas = document.getElementById("graph-canvas");
            if (!graphCanvas) return;
            const canvasRect = graphCanvas.getBoundingClientRect();
            if (e.clientX < canvasRect.left || e.clientX > canvasRect.right ||
                e.clientY < canvasRect.top || e.clientY > canvasRect.bottom) {
                return; // 不在画布区域
            }

            // 判断是否点击在节点上：优先使用 DOM 检测，再尝试 LiteGraph API
            const nodeEl = e.target.closest(".comfy-node") || e.target.closest(".litegraph .node");
            if (nodeEl) return;
            if (app?.canvas?.graph) {
                try {
                    const pos = app.canvas.convertEventToCanvasOffset(e);
                    const node = app.canvas.graph.getNodeOnPos(pos[0], pos[1]);
                    if (node) return;
                } catch (_) {}
            }

            // 点击在空白画布上 → 关闭面板
            self.hide();
        };
        document.addEventListener("pointerdown", this._canvasBgCloseHandler, true);
    },

    _removeCanvasBgClose() {
        if (this._canvasBgCloseHandler) {
            document.removeEventListener("pointerdown", this._canvasBgCloseHandler, true);
            this._canvasBgCloseHandler = null;
        }
    },

    syncPickerCursors() {
        const picker = this.colorPicker;
        const { h, s, l, a } = this.pickerState;
        
        const svArea = picker.querySelector("#rui-sv-area");
        const svCursor = picker.querySelector("#rui-sv-cursor");
        const hueBar = picker.querySelector("#rui-hue-bar");
        const hueCursor = picker.querySelector("#rui-hue-cursor");
        const alphaBar = picker.querySelector("#rui-alpha-bar");
        const alphaCursor = picker.querySelector("#rui-alpha-cursor");
        
        if (svArea) svArea.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
        
        if (svCursor) {
            const hsv = this.hslToHsv(h, s, l);
            const svRect = svArea.getBoundingClientRect();
            const cursorX = (hsv.s / 100) * svRect.width;
            const cursorY = (1 - hsv.v / 100) * svRect.height;
            svCursor.style.left = cursorX + "px";
            svCursor.style.top = cursorY + "px";
        }
        
        if (hueCursor) {
            const hueRect = hueBar.getBoundingClientRect();
            hueCursor.style.left = (h / 360) * hueRect.width + "px";
        }
        
        // Sync alpha cursor
        if (alphaCursor && alphaBar) {
            const alphaRect = alphaBar.getBoundingClientRect();
            alphaCursor.style.left = ((a !== undefined ? a : 1) * alphaRect.width) + "px";
        }
        
        // Update alpha bar color preview
        this.updateAlphaBarPreview();
        
        // Update hex input
        this.updateHexInput();
    },

    hide() {
        this.isVisible = false;
        if (this.panel) {
            this.panel.style.display = "none";
        }
        this._removeCanvasBgClose();
        if (this.onClose) {
            this.onClose();
        }
    },

    getShortcut() {
        try {
            const stored = localStorage.getItem("rui_theme_shortcut");
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {}
        return { key: "c", ctrl: false, alt: false, shift: false, meta: false };
    },

    saveShortcut(shortcut) {
        localStorage.setItem("rui_theme_shortcut", JSON.stringify(shortcut));
    },

    updateShortcutDisplay() {
        const display = this.panel?.querySelector("#rui-theme-shortcut-btn");
        if (!display) return;

        const shortcut = this.getShortcut();
        const parts = [];
        if (shortcut.ctrl) parts.push("Ctrl");
        if (shortcut.alt) parts.push("Alt");
        if (shortcut.shift) parts.push("Shift");
        parts.push(shortcut.key.toUpperCase());
        display.textContent = ruiT('快捷键','Shortcut') + ": " + parts.join("+");
    },

    showShortcutDialog() {
        const self = this;
        const originalShortcut = this.getShortcut();
        let pendingShortcut = null;
        const dialog = document.createElement("div");
        dialog.className = "rui-dialog-overlay";
        dialog.innerHTML = `
            <div class="rui-dialog">
                <div class="rui-dialog-title">${ruiT('设置快捷键','Set Shortcut')}</div>
                <div class="rui-dialog-body">
                    <p style="margin-bottom: 16px; color: #888; font-size: 12px; text-align: center;">${ruiT('请按下你想要的快捷键','Press the shortcut keys you want')}</p>
                    <div style="text-align: center; margin-bottom: 16px;">
                        <div id="rui-listen-display" style="
                            padding: 16px 24px;
                            background: #667eea;
                            border: 2px solid #667eea;
                            border-radius: 6px;
                            color: #fff;
                            font-size: 16px;
                            font-weight: bold;
                            min-width: 180px;
                            display: inline-block;
                        ">${ruiT('请按快捷键...','Press keys...')}</div>
                    </div>
                </div>
                <div class="rui-dialog-footer">
                    <button class="rui-btn rui-btn-cancel" id="rui-dialog-cancel" type="button">${ruiT('取消','Cancel')}</button>
                    <button class="rui-btn rui-btn-ok" id="rui-dialog-ok" type="button" disabled>${ruiT('确定','OK')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const display = dialog.querySelector("#rui-listen-display");
        const okBtn = dialog.querySelector("#rui-dialog-ok");
        let isListening = true;
        let keydownHandler = null;

        const cleanup = () => {
            isListening = false;
            document.removeEventListener("keydown", keydownHandler, true);
            dialog.remove();
        };

        const showPreview = (shortcut) => {
            const parts = [];
            if (shortcut.ctrl) parts.push("Ctrl");
            if (shortcut.alt) parts.push("Alt");
            if (shortcut.shift) parts.push("Shift");
            parts.push(shortcut.key.toUpperCase());
            display.textContent = parts.join(" + ");
            display.style.background = "#2a2a2a";
            display.style.color = "#667eea";
            okBtn.disabled = false;
        };

        keydownHandler = (e) => {
            if (!isListening) return;
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") return;

            const key = e.key.toLowerCase();
            if (key === "control" || key === "alt" || key === "shift" || key === "meta") {
                return;
            }

            pendingShortcut = {
                key: key,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                shift: e.shiftKey,
                meta: e.metaKey
            };

            showPreview(pendingShortcut);
        };

        document.addEventListener("keydown", keydownHandler, true);

        // 取消：不做任何变更
        dialog.querySelector("#rui-dialog-cancel").addEventListener("click", () => {
            cleanup();
        });

        // 确定：保存并生效
        okBtn.addEventListener("click", () => {
            if (!pendingShortcut) return;
            this.saveShortcut(pendingShortcut);
            this.updateShortcutDisplay();
            cleanup();
            setTimeout(() => {
                if (this.onShortcutChange) {
                    this.onShortcutChange(pendingShortcut);
                }
            }, 100);
        });


    },

    getPresets() {
        try {
            const stored = localStorage.getItem("rui_theme_presets");
            if (stored) {
                const presets = JSON.parse(stored);
                if (Array.isArray(presets) && presets.length === 5) {
                    return presets;
                }
            }
        } catch (e) {}
        return JSON.parse(JSON.stringify(this.defaultPresets));
    },

    savePresets(presets) {
        localStorage.setItem("rui_theme_presets", JSON.stringify(presets));
    },

    // ====== ComfyUI 设置（含快捷键）导出导入辅助方法 ======
    // 需要导出的 ComfyUI 设置键的前缀（匹配这些前缀的设置会被导出）
    comfySettingsKeyPrefixes: [
        "Comfy.Keybinding.",     // 快捷键设置（最核心）
        "Comfy.Locale",          // 语言设置
        "Comfy.ColorPalette",    // 颜色主题
        "Comfy.CustomColor",     // 自定义颜色
        "Comfy.LinkRenderMode",  // 连线渲染模式
        "Comfy.Workflow.",       // 工作流相关设置
        "Comfy.NodeLibrary.",    // 节点库收藏等
        "Comfy.RightSidePanel.", // 右侧面板
        "Comfy.Minimap.",        // 小地图
        "Comfy.LinkRenderMode",  // 连线渲染模式
        "Comfy.Validation.",     // 工作流校验
        "Comfy.Tutorial",        // 教程完成状态
        "Comfy.VueNodes.",       // Vue节点开关
        "Comfy.MaskEditor.",     // 遮罩编辑器
        "Comfy.Pointer.",        // 指针交互
        "LiteGraph.",            // LiteGraph 画布设置
        "AddNodeMenu.",          // 添加节点菜单
        "AutoLayout.",           // 自动布局
        "FastLink.",             // 快速连线
        "AlignLayout.",          // 对齐布局
        "pysssss.",              // pysssss 扩展设置
        "HAIGC.",                // HAIGC 扩展设置
        "PromptAssistant.",      // 提示词助手
        "Crystools.",            // Crystools 扩展
        "zml.",                  // 悬浮球等扩展
        "WOSAI.",                // 万赛扩展
    ],

    /**
     * 获取 API 基础路径（兼容不同版本的 ComfyUI）
     */
    getApiBaseUrl() {
        // 优先使用全局 api 对象
        if (typeof api !== "undefined" && api && api.apiURL) {
            return "";
        }
        // 否则使用当前页面的相对路径
        return "";
    },

    /**
     * 从 ComfyUI 服务器获取全部设置
     */
    async getComfySettings() {
        try {
            // 优先使用全局 api 对象（如果存在）
            if (typeof api !== "undefined" && api && typeof api.fetchApi === "function") {
                const resp = await api.fetchApi("/settings", { method: "GET", cache: "no-store" });
                if (!resp.ok) return null;
                return await resp.json();
            }
            // 降级使用原生 fetch
            const resp = await fetch("/settings", {
                method: "GET",
                cache: "no-store",
                headers: { "Content-Type": "application/json" }
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.warn("[RUI] Failed to fetch comfy settings:", e);
            return null;
        }
    },

    /**
     * 筛选需要导出的 ComfyUI 设置（只导出匹配前缀的设置项）
     */
    filterComfySettingsForExport(allSettings) {
        if (!allSettings || typeof allSettings !== "object") return {};
        const filtered = {};
        const prefixes = this.comfySettingsKeyPrefixes;
        for (const key in allSettings) {
            if (prefixes.some(p => key.startsWith(p))) {
                filtered[key] = allSettings[key];
            }
        }
        return filtered;
    },

    /**
     * 将 ComfyUI 设置写回服务器
     */
    async applyComfySettings(settings) {
        if (!settings || typeof settings !== "object") return false;
        try {
            // 优先使用全局 api 对象（如果存在）
            if (typeof api !== "undefined" && api && typeof api.fetchApi === "function") {
                const resp = await api.fetchApi("/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(settings)
                });
                return resp.ok;
            }
            // 降级使用原生 fetch
            const resp = await fetch("/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });
            return resp.ok;
        } catch (e) {
            console.warn("[RUI] Failed to apply comfy settings:", e);
            return false;
        }
    },

    /**
     * 显示导出选项对话框
     */
    showExportDialog() {
        return new Promise((resolve) => {
            const self = this;
            self._ensureGlobalDialogCSS();
            const overlay = document.createElement("div");
            overlay.className = "rui-modal-overlay";
            overlay.style.zIndex = "2000001";
            overlay.innerHTML = `
                <div class="rui-modal-dialog">
                    <div class="rui-modal-title">${ruiT('导出配置', 'Export Config')}</div>
                    <div class="rui-modal-body">
                        <label class="rui-modal-checkbox">
                            <input type="checkbox" id="rui-export-include-rui" checked />
                            <span>${ruiT('包含Rui配置（完整收藏与缩略图 / 主题 / 使用频率 / 菜单隐藏 / 快速节点 / 记事本）', 'Include Rui config (complete favorites and thumbnails / theme / usage / menu hide / quick nodes / notepad)')}</span>
                        </label>
                        <label class="rui-modal-checkbox">
                            <input type="checkbox" id="rui-export-include-comfy" checked />
                            <span>${ruiT('包含 ComfyUI 设置（快捷键、界面主题、布局偏好等）', 'Include ComfyUI settings (keybindings, UI theme, layout preferences, etc.)')}</span>
                        </label>
                        <div class="rui-modal-hint">${ruiT('提示：ComfyUI 设置包含您自定义的快捷键、颜色主题、界面布局偏好等。', 'Tip: ComfyUI settings include your custom keybindings, color theme, UI layout preferences, etc.')}</div>
                    </div>
                    <div class="rui-modal-footer">
                        <button type="button" class="rui-modal-btn rui-modal-cancel">${ruiT('取消', 'Cancel')}</button>
                        <button type="button" class="rui-modal-btn rui-modal-confirm">${ruiT('导出', 'Export')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.querySelector(".rui-modal-cancel").addEventListener("click", () => close(null));
            overlay.querySelector(".rui-modal-confirm").addEventListener("click", () => {
                const includeXzg = overlay.querySelector("#rui-export-include-rui").checked;
                const includeComfy = overlay.querySelector("#rui-export-include-comfy").checked;
                // 备注/记事本已合并到Rui配置
                close({ includeXzgConfig: includeXzg, includeNotes: includeXzg, includeComfySettings: includeComfy });
            });
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) close(null);
            });
        });
    },

    /**
     * 显示导入选项对话框
     */
    showImportDialog(hasComfySettings, hasXzg, hasFavorites) {
        return new Promise((resolve) => {
            const self = this;
            self._ensureGlobalDialogCSS();
            const overlay = document.createElement("div");
            overlay.className = "rui-modal-overlay";
            overlay.style.zIndex = "2000001";
            const comfyCheckbox = hasComfySettings ? `
                <label class="rui-modal-checkbox">
                    <input type="checkbox" id="rui-import-include-comfy" checked />
                    <span>${ruiT('导入 ComfyUI 设置（快捷键、界面主题、布局偏好等）', 'Import ComfyUI settings (keybindings, UI theme, layout preferences, etc.)')}</span>
                </label>
            ` : `
                <div class="rui-modal-hint">${ruiT('此配置文件不包含 ComfyUI 设置。', 'This config file does not contain ComfyUI settings.')}</div>
            `;
            const ruiHint = hasXzg ? `` : `
                <div class="rui-modal-hint">${ruiT('此配置文件不包含Rui配置。', 'This config file does not contain Rui config.')}</div>
            `;
            overlay.innerHTML = `
                <div class="rui-modal-dialog">
                    <div class="rui-modal-title">${ruiT('导入配置', 'Import Config')}</div>
                    <div class="rui-modal-body">
                        <label class="rui-modal-checkbox" style="${hasXzg ? '' : 'opacity:0.5;pointer-events:none;'}">
                            <input type="checkbox" id="rui-import-include-rui" ${hasXzg ? 'checked' : 'disabled'} />
                            <span>${ruiT('导入Rui配置（完整收藏与缩略图 / 主题 / 使用频率 / 菜单隐藏 / 快速节点 / 记事本）', 'Import Rui config (complete favorites and thumbnails / theme / usage / menu hide / quick nodes / notepad)')}</span>
                        </label>
                        ${ruiHint}
                        ${hasFavorites ? `
                            <div style="margin:10px 0 4px;color:#ddd;font-size:13px;">${ruiT('收藏导入方式', 'Favorites import mode')}</div>
                            <label class="rui-modal-checkbox">
                                <input type="radio" name="rui-favorites-mode" value="replace" checked />
                                <span>${ruiT('覆盖恢复（与备份完全一致）', 'Replace (exactly match the backup)')}</span>
                            </label>
                            <label class="rui-modal-checkbox">
                                <input type="radio" name="rui-favorites-mode" value="merge" />
                                <span>${ruiT('合并收藏（保留当前内容）', 'Merge (keep current favorites)')}</span>
                            </label>
                        ` : ''}
                        ${comfyCheckbox}
                        <div class="rui-modal-warning">${ruiT('警告：导入将覆盖当前的对应设置，建议先导出备份。', 'Warning: Importing will overwrite current corresponding settings. Export a backup first is recommended.')}</div>
                    </div>
                    <div class="rui-modal-footer">
                        <button type="button" class="rui-modal-btn rui-modal-cancel">${ruiT('取消', 'Cancel')}</button>
                        <button type="button" class="rui-modal-btn rui-modal-confirm">${ruiT('导入', 'Import')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.querySelector(".rui-modal-cancel").addEventListener("click", () => close(null));
            overlay.querySelector(".rui-modal-confirm").addEventListener("click", () => {
                const includeXzgEl = overlay.querySelector("#rui-import-include-rui");
                const includeXzg = includeXzgEl && !includeXzgEl.disabled ? includeXzgEl.checked : false;
                const includeComfyEl = overlay.querySelector("#rui-import-include-comfy");
                const includeComfy = includeComfyEl ? includeComfyEl.checked : false;
                const favoritesMode = overlay.querySelector('input[name="rui-favorites-mode"]:checked')?.value || "replace";
                // 备注/记事本已合并到Rui配置
                close({ includeXzgConfig: includeXzg, includeNotes: includeXzg, includeComfySettings: includeComfy, favoritesMode });
            });
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) close(null);
            });
        });
    },

    _mergeFavoritesData(current, incoming) {
        const currentData = current && typeof current === "object" ? current : {};
        const incomingData = incoming && typeof incoming === "object" ? incoming : {};
        const mergeBy = (base, added, keyFn) => {
            const merged = new Map();
            for (const item of Array.isArray(base) ? base : []) {
                if (item && keyFn(item)) merged.set(keyFn(item), item);
            }
            for (const item of Array.isArray(added) ? added : []) {
                if (item && keyFn(item)) merged.set(keyFn(item), item);
            }
            return Array.from(merged.values());
        };
        return {
            ...currentData,
            ...incomingData,
            categories: mergeBy(currentData.categories, incomingData.categories, item => item.id || item.name),
            nodes: mergeBy(currentData.nodes, incomingData.nodes, item => item.type),
            workflows: mergeBy(currentData.workflows, incomingData.workflows, item => item.id || item._typeSignature),
        };
    },

    // ====== Rui统一配置导出 / 导入（覆盖收藏 / 工作流 / 快速节点 / 隐藏菜单 / 主题 / 备注 / ComfyUI设置 等所有模块） ======
    async exportAllConfig() {
        // 1) 先弹导出选项，等用户确认各模块的勾选
        const opt = await this.showExportDialog();
        if (!opt) return; // 用户取消
        const includeXzg = opt.includeXzgConfig !== false;    // 默认true
        const includeNotes = opt.includeNotes !== false;      // 默认true
        const includeComfy = opt.includeComfySettings !== false;

        const NOTES_KEY = "rui.notes";

        const prefixes = ["rui_", "rui-", "rui."];
        const extraKeys = ["comfyui_rui"];
        let ls = {};
        if (includeXzg) {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                // 备注单独处理（根据 includeNotes 决定）
                if (!includeNotes && k === NOTES_KEY) continue;
                if (prefixes.some(p => k.startsWith(p)) || extraKeys.includes(k)) {
                    try { ls[k] = localStorage.getItem(k); } catch (e) {}
                }
            }
        } else if (includeNotes) {
            // 不导出Rui配置，但导出备注时只带 notes 键
            try {
                const v = localStorage.getItem(NOTES_KEY);
                if (v !== null) ls[NOTES_KEY] = v;
            } catch (e) {}
        }

        // 顶层 notes 字段（结构化，方便未来扩展和跨工具识别）
        let notesTop = null;
        if (includeNotes) {
            try {
                const raw = localStorage.getItem(NOTES_KEY);
                if (raw !== null) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed && Array.isArray(parsed.groups) && parsed.groups.length > 0) {
                            notesTop = parsed;
                        } else {
                            // 旧版单字符串或空结构 → 包一层兼容
                            notesTop = {
                                groups: [{ id: "rui_nt_migrated", name: ruiT("导入的笔记","Imported Notes"), content: (typeof raw === "string" ? raw : ""), color: "#FF5252", order: 0 }],
                                activeId: "rui_nt_migrated",
                            };
                        }
                    } catch (_) {
                        // parse失败，按纯字符串包装成一组
                        notesTop = {
                            groups: [{ id: "rui_nt_imported", name: ruiT("导入的笔记","Imported Notes"), content: raw || "", color: "#FF5252", order: 0 }],
                            activeId: "rui_nt_imported",
                        };
                    }
                }
            } catch (e) {}
        }

        // 收藏截图存于 IndexedDB，单独收集（仅当 includeXzg 时）
        let favoritesData = null;
        let favoritesPreviews = null;
        if (includeXzg) {
            try {
                const raw = localStorage.getItem("comfyui_rui");
                if (raw) favoritesData = JSON.parse(raw);
            } catch (e) {}
            try {
                const fav = window.ruiFavorites;
                if (fav && typeof fav._getAllPreviewImages === "function") {
                    favoritesPreviews = await fav._getAllPreviewImages();
                }
            } catch (e) {}
        }

        // 导出 ComfyUI 设置（含快捷键）
        let comfySettings = null;
        if (includeComfy) {
            try {
                const allSettings = await this.getComfySettings();
                if (allSettings) {
                    comfySettings = this.filterComfySettingsForExport(allSettings);
                }
            } catch (e) {
                console.warn("[RUI] Failed to export comfy settings:", e);
            }
        }

        const cfg = {
            format: "rui-config",
            version: 5,
            exportedAt: new Date().toISOString(),
            flags: { includeXzgConfig: includeXzg, includeNotes: includeNotes, includeComfySettings: includeComfy },
            localStorage: ls,
            notes: notesTop,
            favorites: includeXzg ? { data: favoritesData, previews: favoritesPreviews || {} } : null,
            favoritesPreviews: favoritesPreviews,
            comfySettings: comfySettings
        };
        const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
        a.href = url;
        a.download = `rui-config-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async importAllConfig(obj) {
        if (!obj || typeof obj !== "object") throw new Error("not an object");
        if (obj.format && obj.format !== "rui-config") {
            throw new Error("unknown format: " + obj.format);
        }

        const NOTES_KEY = "rui.notes";

        // 先检测此文件是否包含两类可选模块（用于弹窗显示复选框）
        const hasComfy = !!(obj.comfySettings && typeof obj.comfySettings === "object" && Object.keys(obj.comfySettings).length > 0);
        let favoritesData = obj.favorites?.data || null;
        if (!favoritesData && obj.localStorage?.["comfyui_rui"]) {
            try { favoritesData = JSON.parse(obj.localStorage["comfyui_rui"]); } catch (e) {}
        }
        const favoritesPreviews = (obj.favorites?.previews && typeof obj.favorites.previews === "object")
            ? obj.favorites.previews
            : ((obj.favoritesPreviews && typeof obj.favoritesPreviews === "object") ? obj.favoritesPreviews : {});
        const hasFavorites = !!(
            (favoritesData && typeof favoritesData === "object") ||
            Object.keys(favoritesPreviews).length > 0
        );
        // hasXzg：只要文件包含 localStorage / notes / favorites / workflowUsage 之一，就视为包含Rui配置
        const hasXzg = !!(
            (obj.localStorage && typeof obj.localStorage === "object" && Object.keys(obj.localStorage).length > 0) ||
            (obj.notes && typeof obj.notes === "object" && Array.isArray(obj.notes.groups)) ||
            hasFavorites ||
            (obj.workflowUsage && typeof obj.workflowUsage === "object" && Object.keys(obj.workflowUsage).length > 0)
        );
        const hasNotes = !!(
            (obj.notes && typeof obj.notes === "object") ||
            (obj.localStorage && obj.localStorage["rui.notes"])
        );

        // 弹导入选项（备注/记事本已合并进Rui配置，不再单独复选）
        const opt = await this.showImportDialog(hasComfy, hasXzg, hasFavorites);
        if (!opt) return { applied: false };
        const includeXzg = opt.includeXzgConfig !== false;
        const includeNotes = opt.includeNotes !== false;
        const includeComfy = opt.includeComfySettings !== false;
        const favoritesMode = opt.favoritesMode === "merge" ? "merge" : "replace";

        // ============ 1) 导入备注（优先从顶层 notes，回退到 localStorage[NOTES_KEY]） ============
        let importedNotes = false;
        if (includeNotes && hasNotes) {
            let notesObj = null;
            if (obj.notes && typeof obj.notes === "object") {
                notesObj = obj.notes;
            } else if (obj.localStorage && obj.localStorage[NOTES_KEY]) {
                try {
                    const parsed = JSON.parse(obj.localStorage[NOTES_KEY]);
                    if (parsed && (Array.isArray(parsed.groups) || typeof parsed === "string")) {
                        notesObj = parsed;
                    }
                } catch (_) {
                    // 旧版字符串格式
                    notesObj = {
                        groups: [{ id: "rui_nt_imported", name: ruiT("导入的笔记","Imported Notes"), content: obj.localStorage[NOTES_KEY], color: "#FF5252", order: 0 }],
                        activeId: "rui_nt_imported",
                    };
                }
            }
            if (notesObj) {
                try {
                    if (typeof notesObj === "string") {
                        // 单字符串兼容
                        localStorage.setItem(NOTES_KEY, notesObj);
                    } else {
                        localStorage.setItem(NOTES_KEY, JSON.stringify(notesObj));
                    }
                    importedNotes = true;
                } catch (e) {
                    console.warn("[RUI] Failed to import notes:", e);
                }
            }
        }

        // ============ 2) 导入Rui配置（除 notes 外的所有 localStorage，以及收藏预览） ============
        let importedXzg = false;
        if (includeXzg) {
            if (obj.localStorage && typeof obj.localStorage === "object") {
                for (const k in obj.localStorage) {
                    // notes 已在上面单独按 includeNotes 决策导入，此处跳过避免强制覆盖
                    if (k === NOTES_KEY || (k === "comfyui_rui" && favoritesData)) continue;
                    try { localStorage.setItem(k, obj.localStorage[k]); } catch (e) {}
                }
                importedXzg = true;
            }
            if (favoritesData) {
                try {
                    let nextFavorites = favoritesData;
                    if (favoritesMode === "merge") {
                        let currentFavorites = {};
                        try { currentFavorites = JSON.parse(localStorage.getItem("comfyui_rui") || "{}"); } catch (e) {}
                        nextFavorites = this._mergeFavoritesData(currentFavorites, favoritesData);
                    }
                    localStorage.setItem("comfyui_rui", JSON.stringify(nextFavorites));
                    importedXzg = true;
                } catch (e) {
                    console.warn("[RUI] Failed to import favorites:", e);
                }
            }
            if (hasFavorites && window.ruiFavorites && typeof window.ruiFavorites._saveAllPreviewImages === "function") {
                try {
                    await window.ruiFavorites._saveAllPreviewImages(favoritesPreviews, { replace: favoritesMode === "replace" });
                    importedXzg = true;
                } catch (e) {}
            }
            // 兼容旧版（仅使用次数）配置
            if (obj.workflowUsage && typeof obj.workflowUsage === "object") {
                try {
                    const raw = localStorage.getItem("rui_workflows_meta");
                    const meta = raw ? JSON.parse(raw) : { workflows: {} };
                    if (!meta.workflows) meta.workflows = {};
                    for (const path in obj.workflowUsage) {
                        const cnt = parseInt(obj.workflowUsage[path], 10);
                        if (!meta.workflows[path]) meta.workflows[path] = { useCount: 0, lastUsed: 0, categoryId: null, createdAt: Date.now() };
                        meta.workflows[path].useCount = isNaN(cnt) ? 0 : cnt;
                    }
                    localStorage.setItem("rui_workflows_meta", JSON.stringify(meta));
                    importedXzg = true;
                } catch (e) {}
            }
        }

        // ============ 3) 导入备注即使没勾选RUI也允许单独生效（因此 notes 独立）===========
        // 最终 importedXzg 只反映非 notes 的模块；而 importedNotes 单独记录
        const anyXzgApplied = importedXzg;

        // ============ 4) 导入 ComfyUI 设置（含快捷键） ============
        let importedComfy = false;
        if (includeComfy && hasComfy) {
            try {
                const ok = await this.applyComfySettings(obj.comfySettings);
                importedComfy = !!ok;
            } catch (e) {
                console.warn("[RUI] Failed to import comfy settings:", e);
            }
        }

        return {
            applied: anyXzgApplied || importedNotes || importedComfy,
            appliedXzgConfig: anyXzgApplied,
            appliedNotes: importedNotes,
            appliedComfySettings: importedComfy
        };
    },

    renderPresets() {
        const presets = this.getPresets();
        const items = this.panel?.querySelectorAll(".rui-preset-item");
        if (!items) return;

        items.forEach((item, index) => {
            const preset = presets[index];
            if (preset) {
                const cssDeg = this.presetDirToCssDeg(preset.direction);
                item.style.background = `linear-gradient(${cssDeg}deg, ${preset.color1} 0%, ${preset.color2} 50%, ${preset.color3} 100%)`;
            }
        });
    },

    presetDirToCssDeg(deg) {
        const map = {
            '0': 180, '90': 90, '180': 0, '270': 270,
            '45': 135, '135': 225, '225': 315, '315': 45
        };
        return map[String(deg)] !== undefined ? map[String(deg)] : 135;
    },

    applyPreset(index) {
        const presets = this.getPresets();
        const preset = presets[index];
        if (!preset) return;

        this.isUpdatingFromNode = true;

        const panel = this.panel;
        const c1 = panel.querySelector('[data-color="color1"]');
        const c2 = panel.querySelector('[data-color="color2"]');
        const c3 = panel.querySelector('[data-color="color3"]');
        const tc1 = panel.querySelector('[data-color="titleColor1"]');
        const tc2 = panel.querySelector('[data-color="titleColor2"]');
        const tc3 = panel.querySelector('[data-color="titleColor3"]');
        const ct = panel.querySelector('[data-color="textColor"]');

        if (c1 && preset.color1) c1.style.backgroundColor = preset.color1;
        if (c2 && preset.color2) c2.style.backgroundColor = preset.color2;
        if (c3 && preset.color3) c3.style.backgroundColor = preset.color3;
        if (tc1 && preset.titleColor1) tc1.style.backgroundColor = preset.titleColor1;
        if (tc2 && preset.titleColor2) tc2.style.backgroundColor = preset.titleColor2;
        if (tc3 && preset.titleColor3) tc3.style.backgroundColor = preset.titleColor3;
        if (ct && preset.textColor) ct.style.backgroundColor = preset.textColor;

        panel.querySelectorAll(".rui-direction-buttons:not(.rui-title-dir-buttons) .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const dirBtn = panel.querySelector(`[data-dir="${preset.direction || '135'}"]`);
        if (dirBtn) dirBtn.classList.add("active");

        panel.querySelectorAll(".rui-title-dir-buttons .rui-dir-btn").forEach(b => b.classList.remove("active"));
        const titleDirBtn = panel.querySelector(`[data-title-dir="${preset.titleDirection || '135'}"]`);
        if (titleDirBtn) titleDirBtn.classList.add("active");

        const useTitleGradient = preset.useTitleGradient === true;
        const titleToggle = panel.querySelector(".rui-title-gradient-toggle");
        if (titleToggle) {
            titleToggle.dataset.checked = String(useTitleGradient);
            const label = titleToggle.querySelector(".rui-toggle-label");
            if (label) label.textContent = useTitleGradient ? ruiT("开","On") : ruiT("关","Off");
        }
        const titleSections = panel.querySelectorAll(".rui-title-swatch-section");
        titleSections.forEach(sec => {
            sec.style.display = useTitleGradient ? "" : "none";
        });

        if (preset.fontSize !== undefined) {
            const fontSizeEl = panel.querySelector("#rui-font-size-value");
            if (fontSizeEl) fontSizeEl.textContent = preset.fontSize;
        }

        panel.querySelectorAll(".rui-align-btn").forEach(b => b.classList.remove("active"));
        const alignBtn = panel.querySelector(`[data-align="${preset.textAlign || 'left'}"]`);
        if (alignBtn) alignBtn.classList.add("active");

        panel.querySelectorAll(".rui-color-swatch").forEach(s => s.classList.remove("active"));
        const firstSwatch = panel.querySelector('[data-color="color1"]');
        if (firstSwatch) {
            firstSwatch.classList.add("active");
            this.activeColorInput = "color1";
        }
        this.setColorFromHex(preset.color1, false);

        this.isUpdatingFromNode = false;
        this.notifyChange();

        if (this.isVisible) {
            requestAnimationFrame(() => {
                this.syncPickerCursors();
            });
        }
    },

    /** 一次性注入全局模态框样式：rui-modal-*（导出/导入对话框）+ rui-wf-dialog-* */
    _ensureGlobalDialogCSS() {
        if (document.getElementById("rui-dialog-global-css")) return;
        const s = document.createElement("style");
        s.id = "rui-dialog-global-css";
        s.textContent = `
            /* ========= rui-modal：导出/导入配置对话框 ========= */
            .rui-modal-overlay {
                position: fixed;top: 0;left: 0;right: 0;bottom: 0;
                background: rgba(0, 0, 0, 0.65);
                display: flex;align-items: center;justify-content: center;
                z-index: 2000000;
            }
            .rui-modal-dialog {
                background: var(--comfy-menu-bg, #2a2a2a);
                border: 1px solid var(--border-color, #555);
                border-radius: 10px;
                min-width: 380px;
                max-width: 520px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
                color: #ddd;
                font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
                animation: ruiModalPop 0.35s cubic-bezier(0.25, 0.8, 0.3, 1);
            }
            @keyframes ruiModalPop {
                from { opacity: 0; transform: scale(0.97); }
                to   { opacity: 1; transform: scale(1); }
            }
            .rui-modal-title {
                display: flex;align-items: center;justify-content: center;
                padding: 14px 16px;font-size: 15px;font-weight: bold;color: #FFD700;
                border-bottom: 1px solid var(--border-color, #444);
            }
            .rui-modal-body { padding: 16px 18px;display: flex;flex-direction: column;gap: 12px; }
            .rui-modal-footer {
                padding: 12px 16px;border-top: 1px solid var(--border-color, #444);
                display: flex;justify-content: center;gap: 10px;
            }
            .rui-modal-btn {
                padding: 6px 18px;font-size: 13px;
                background: var(--comfy-input-bg, #3a3a3a);
                color: var(--fg, #ddd);
                border: 1px solid var(--border-color, #555);
                border-radius: 4px;cursor: pointer;transition: all 0.15s;
            }
            .rui-modal-btn:hover { background: rgba(255,255,255,0.1); }
            .rui-modal-cancel {
                background: #3a3a3a; color: #ccc;
            }
            .rui-modal-confirm {
                background: #FFD700;color: #333;border-color: #FFD700;font-weight: bold;
            }
            .rui-modal-confirm:hover:not(:disabled) { background: #FFC700; }
            .rui-modal-confirm:disabled { opacity: 0.4;cursor: not-allowed; }
            .rui-modal-checkbox {
                display: flex;align-items: flex-start;gap: 8px;cursor: pointer;
                padding: 6px 4px;border-radius: 4px;
                font-size: 13px;color: #ddd;line-height: 1.4;
                user-select: none;
            }
            .rui-modal-checkbox:hover { background: rgba(255,255,255,0.05); }
            .rui-modal-checkbox > input[type="checkbox"] {
                margin-top: 3px;
                width: 14px;height: 14px;
                accent-color: #FFD700;
                cursor: pointer;flex-shrink: 0;
            }
            .rui-modal-hint {
                font-size: 11px;color: #888;padding: 2px 4px;line-height: 1.5;
            }
            .rui-modal-warning {
                font-size: 11px;color: #FF6B6B;padding: 8px 10px;
                background: rgba(255,82,82,0.08);
                border: 1px dashed rgba(255,82,82,0.35);
                border-radius: 4px;line-height: 1.5;
            }

            /* ========= rui-wf-dialog：通用确认对话框 ========= */
            .rui-wf-dialog-overlay {
                position: fixed;top: 0;left: 0;right: 0;bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;align-items: center;justify-content: center;
                z-index: 100002;
            }
            .rui-wf-dialog {
                background: var(--comfy-menu-bg, #2a2a2a);
                border: 1px solid var(--border-color, #555);
                border-radius: 8px;min-width: 320px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            }
            .rui-wf-dialog-title {
                position: relative;display: flex;align-items: center;justify-content: center;
                padding: 14px 16px;font-size: 15px;font-weight: bold;color: #fff;
                border-bottom: 1px solid var(--border-color, #444);text-align: center;
            }
            .rui-wf-dialog-body { padding: 20px 16px; }
            .rui-wf-dialog-footer {
                padding: 12px 16px;border-top: 1px solid var(--border-color, #444);
                display: flex;justify-content: center;gap: 10px;
            }
            .rui-wf-dialog-btn {
                padding: 6px 16px;font-size: 13px;
                background: var(--comfy-input-bg, #3a3a3a);
                color: var(--fg, #ddd);
                border: 1px solid var(--border-color, #555);
                border-radius: 4px;cursor: pointer;transition: all 0.15s;
            }
            .rui-wf-dialog-btn:hover { background: rgba(255, 255, 255, 0.1); }
            .rui-wf-dialog-btn-cancel {
                background: var(--comfy-input-bg, #3a3a3a);color: var(--fg, #ddd);
            }
            .rui-wf-dialog-btn-confirm {
                background: #4a4a4a;color: #fff;border-color: #666;font-weight: bold;
            }
            .rui-wf-dialog-btn-confirm:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
            .rui-wf-dialog-btn-confirm:disabled { opacity: 0.4;cursor: not-allowed; }
        `;
        document.head.appendChild(s);
    },

    showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            const self = this;
            self._ensureGlobalDialogCSS();
            const escapeAttr = (v) => String(v == null ? "" : v)
                .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                .replace(/</g, "&lt;").replace(/>/g, "&gt;");

            const overlay = document.createElement("div");
            overlay.className = "rui-wf-dialog-overlay";
            overlay.style.zIndex = "100003";
            overlay.innerHTML = `
                <div class="rui-wf-dialog" style="min-width:320px;max-width:420px;">
                    <div class="rui-wf-dialog-title" style="color:#FFD700;">${escapeAttr(title)}</div>
                    <div class="rui-wf-dialog-body" style="padding:18px 20px;font-size:13px;color:#ddd;line-height:1.6;">
                        ${escapeAttr(message)}
                    </div>
                    <div class="rui-wf-dialog-footer">
                        <button class="rui-wf-dialog-btn rui-wf-dialog-btn-cancel" id="rui-confirm-cancel">${ruiT('取消','Cancel')}</button>
                        <button class="rui-wf-dialog-btn rui-wf-dialog-btn-confirm" id="rui-confirm-ok" style="background:#FFD700;color:#333;border-color:#FFD700;">${ruiT('确认','Confirm')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const dialogEl = overlay.querySelector(".rui-wf-dialog");

            const stopAll = (e) => { e.stopPropagation(); e.preventDefault(); };
            overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) { e.stopPropagation(); } });
            if (dialogEl) {
                dialogEl.addEventListener("mousedown", stopAll);
                dialogEl.addEventListener("pointerdown", stopAll);
                dialogEl.addEventListener("click", (e) => e.stopPropagation());
            }

            const finish = (result) => {
                document.removeEventListener("keydown", onKey, true);
                overlay.remove();
                resolve(result);
            };

            const onKey = (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(false);
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(true);
                }
            };
            document.addEventListener("keydown", onKey, true);

            overlay.querySelector("#rui-confirm-cancel").addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); finish(false); });
            overlay.querySelector("#rui-confirm-ok").addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); finish(true); });
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) { e.stopPropagation(); e.preventDefault(); finish(false); }
            });
        });
    },

    saveCurrentToPreset(index) {
        const presets = this.getPresets();
        const colors = this.getCurrentColors();
        presets[index] = {
            color1: colors.color1,
            color2: colors.color2,
            color3: colors.color3,
            direction: colors.direction,
            titleColor1: colors.titleColor1,
            titleColor2: colors.titleColor2,
            titleColor3: colors.titleColor3,
            titleDirection: colors.titleDirection,
            useTitleGradient: colors.useTitleGradient,
            textColor: colors.textColor,
            fontSize: colors.fontSize,
            textAlign: colors.textAlign
        };
        this.savePresets(presets);
        this.renderPresets();
    },

    /* ── 最近颜色 ── */
    addRecentColor(hex) {
        if (!hex || typeof hex !== 'string') return;
        hex = hex.toUpperCase();
        // 移除重复
        this.recentColors = this.recentColors.filter(c => c !== hex);
        // 添加到开头
        this.recentColors.unshift(hex);
        // 限制数量
        if (this.recentColors.length > this.maxRecentColors) {
            this.recentColors = this.recentColors.slice(0, this.maxRecentColors);
        }
        this.saveRecentColors();
        this.updateRecentDisplay();
    },

    loadRecentColors() {
        try {
            const stored = localStorage.getItem("rui_recent_colors");
            if (stored) {
                this.recentColors = JSON.parse(stored);
                if (!Array.isArray(this.recentColors)) this.recentColors = [];
            }
        } catch (e) { this.recentColors = []; }
    },

    saveRecentColors() {
        try {
            localStorage.setItem("rui_recent_colors", JSON.stringify(this.recentColors));
        } catch (e) {}
    },

    updateRecentDisplay() {
        const section = document.getElementById("rui-recent-section");
        const row = document.getElementById("rui-recent-row");
        if (!section || !row) return;
        
        if (this.recentColors.length === 0) {
            section.style.display = "none";
            return;
        }
        section.style.display = "";
        row.innerHTML = this.recentColors.map((c, i) => `
            <div class="rui-recent-swatch" data-color="${c}" style="width:22px;height:22px;border-radius:3px;cursor:pointer;background:${c};border:1px solid rgba(255,255,255,0.2);transition:transform 0.15s;" title="${c}"></div>
        `).join("");
        
        // Bind clicks
        row.querySelectorAll(".rui-recent-swatch").forEach(sw => {
            sw.addEventListener("click", (e) => {
                e.stopPropagation();
                const hex = sw.dataset.color;
                if (this.activeColorInput) {
                    this.setActiveColor(hex);
                    this.setColorFromHex(hex, true);
                    if (this.isVisible) requestAnimationFrame(() => this.syncPickerCursors());
                }
            });
        });
    },

    clearRecentColors() {
        this.recentColors = [];
        this.saveRecentColors();
        this.updateRecentDisplay();
    },

    /* ── 取色吸管 ── */
    startEyedropper() {
        if (this.eyedropperActive) {
            this.stopEyedropper();
            return;
        }
        
        this.eyedropperActive = true;
        
        // 高亮吸管按钮
        const eyedropperBtn = document.getElementById("rui-eyedropper-btn");
        if (eyedropperBtn) {
            eyedropperBtn.style.background = "#667eea";
            eyedropperBtn.style.color = "#fff";
        }
        
        // 在canvas上显示十字光标
        const canvas = document.getElementById("graph-canvas") || document.querySelector("canvas");
        if (canvas) {
            canvas.style.cursor = "crosshair";
        }
        
        const self = this;
        
        // 鼠标移动时预览颜色（不选，仅预览）
        this._eyedropperMove = (e) => {
            self._eyedropperPreview(e);
        };
        
        // 点击取色
        this._eyedropperClick = (e) => {
            self._eyedropperPick(e);
        };
        
        // Esc取消
        this._eyedropperEsc = (e) => {
            if (e.key === 'Escape') self.stopEyedropper();
        };
        
        document.addEventListener("mousemove", this._eyedropperMove);
        document.addEventListener("click", this._eyedropperClick, true);
        document.addEventListener("keydown", this._eyedropperEsc);
    },

    stopEyedropper() {
        this.eyedropperActive = false;
        
        const eyedropperBtn = document.getElementById("rui-eyedropper-btn");
        if (eyedropperBtn) {
            eyedropperBtn.style.background = "#2a2a2a";
            eyedropperBtn.style.color = "#aaa";
        }
        
        const canvas = document.getElementById("graph-canvas") || document.querySelector("canvas");
        if (canvas) {
            canvas.style.cursor = "";
        }
        
        if (this._eyedropperMove) {
            document.removeEventListener("mousemove", this._eyedropperMove);
            this._eyedropperMove = null;
        }
        if (this._eyedropperClick) {
            document.removeEventListener("click", this._eyedropperClick, true);
            this._eyedropperClick = null;
        }
        if (this._eyedropperEsc) {
            document.removeEventListener("keydown", this._eyedropperEsc);
            this._eyedropperEsc = null;
        }
    },

    _eyedropperPreview(e) {
        // 使用canvas截图方式取色
        const canvas = document.getElementById("graph-canvas") || document.querySelector("canvas");
        if (!canvas) return;
        
        // 简单方式：在canvas上用临时overlay显示放大镜效果
        // 由于canvas跨域等限制，这里用简化方式
    },

    _eyedropperPick(e) {
        if (!this.activeColorInput) return;
        
        const canvas = document.getElementById("graph-canvas") || document.querySelector("canvas");
        if (!canvas) return;
        
        try {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // 尝试用浏览器的 EyeDropper API
            if (window.EyeDropper) {
                const dropper = new EyeDropper();
                dropper.open().then(result => {
                    const hex = result.sRGBHex;
                    const swatch = this.panel.querySelector(`[data-color="${this.activeColorInput}"]`);
                    if (swatch) swatch.style.backgroundColor = hex;
                    this.setColorFromHex(hex, false);
                    this.setActiveColor(hex);
                    if (this.isVisible) requestAnimationFrame(() => this.syncPickerCursors());
                }).catch(() => {}).finally(() => this.stopEyedropper());
            } else {
                // Fallback: 用 canvas 取色
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const hex = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
                    const swatch = this.panel.querySelector(`[data-color="${this.activeColorInput}"]`);
                    if (swatch) swatch.style.backgroundColor = hex;
                    this.setColorFromHex(hex, false);
                    this.setActiveColor(hex);
                    if (this.isVisible) requestAnimationFrame(() => this.syncPickerCursors());
                }
                this.stopEyedropper();
            }
        } catch (err) {
            this.stopEyedropper();
        }
    }
};
