
export class SelectionFrame {
  private _element: HTMLElement;

  constructor() {
    const frame = document.createElement("div");
    frame.style.position = "absolute";
    frame.style.borderStyle = "dashed";
    frame.style.borderWidth = "2px";
    frame.style.borderColor = "dodgerblue";
    frame.style.background = "rgba(30, 144, 255, 0.1)";
    frame.style.pointerEvents = "none";

    this._element = frame;
  }

  destroy() {
    this._element.remove();
    this._element = null;
  }

  show(container: HTMLElement, x1: number, y1: number, x2: number, y2: number) {
    if (!this._element) {
      return;
    }

    const xMin = Math.min(x1, x2);
    const yMin = Math.min(y1, y2);
    const xMax = Math.max(x1, x2);
    const yMax = Math.max(y1, y2);

    const { top, left, width, height } = container.getBoundingClientRect(); 
    const frameLeft = Math.max(xMin - left, 0);
    const frameTop = Math.max(yMin - top, 0);
    const frameRight = Math.max(left + width - xMax, 0);
    const frameBottom = Math.max(top + height - yMax, 0);
    this._element.style.left = frameLeft + "px";
    this._element.style.top = frameTop + "px";
    this._element.style.right = frameRight + "px";
    this._element.style.bottom = frameBottom + "px";

    container.append(this._element);
  }

  hide() {
    this._element.remove();
  }
}
