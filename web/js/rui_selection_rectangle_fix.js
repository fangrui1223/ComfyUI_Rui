import { app } from "../../../scripts/app.js";

const OFFICIAL_SELECTOR = '[data-testid="selection-rectangle"]';
const RUI_RECTANGLE_ID = "rui-selection-rectangle";

function createRectangle() {
    const rectangle = document.createElement("div");
    rectangle.id = RUI_RECTANGLE_ID;
    rectangle.style.cssText = [
        "position:absolute",
        "display:none",
        "pointer-events:none",
        "z-index:9999",
        "box-sizing:border-box",
        "border:1px solid rgb(96, 165, 250)",
        "background:rgba(59, 130, 246, 0.2)",
    ].join(";");
    return rectangle;
}

function installSelectionRectangleFix() {
    const style = document.createElement("style");
    style.textContent = `${OFFICIAL_SELECTOR}{display:none!important;}`;
    document.head.appendChild(style);

    const rectangle = createRectangle();
    let frameId = null;

    const draw = () => {
        frameId = null;
        const canvas = app.canvas;
        if (!canvas?.dragging_rectangle) {
            rectangle.style.display = "none";
            return;
        }

        const official = document.querySelector(OFFICIAL_SELECTOR);
        if (official?.parentElement && rectangle.parentElement !== official.parentElement) {
            official.parentElement.appendChild(rectangle);
        }

        const down = canvas?.pointer?.eDown;
        const move = canvas?.pointer?.eMove;
        const x1 = down?.safeOffsetX;
        const y1 = down?.safeOffsetY;
        const x2 = move?.safeOffsetX;
        const y2 = move?.safeOffsetY;

        if (
            !rectangle.parentElement ||
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
        ) {
            rectangle.style.display = "none";
            return;
        }

        rectangle.style.left = `${Math.min(x1, x2)}px`;
        rectangle.style.top = `${Math.min(y1, y2)}px`;
        rectangle.style.width = `${Math.abs(x2 - x1)}px`;
        rectangle.style.height = `${Math.abs(y2 - y1)}px`;
        rectangle.style.display = "block";
    };

    const scheduleDraw = () => {
        if (frameId === null) frameId = requestAnimationFrame(draw);
    };
    document.addEventListener("pointermove", scheduleDraw, true);
    document.addEventListener("pointerup", scheduleDraw, true);
    document.addEventListener("pointercancel", scheduleDraw, true);
}

app.registerExtension({
    name: "ComfyUI.Rui.SelectionRectangleFix",
    setup() {
        installSelectionRectangleFix();
    },
});
