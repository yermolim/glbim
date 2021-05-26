
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

    const { top, left } = container.getBoundingClientRect(); 
    this._element.style.left = xMin - left + "px";
    this._element.style.top = yMin - top + "px";
    this._element.style.width = xMax - xMin + "px";
    this._element.style.height = yMax - yMin + "px";

    container.append(this._element);
  }

  hide() {
    this._element.remove();
  }
}
