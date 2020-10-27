import { Color, CanvasTexture } from "three";

export class CanvasTextureBuilder { 

  static buildAxisLabelTexture(size: number, color: number, text: string): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size/2, size/2, size/4, 0, 2*Math.PI);
    ctx.closePath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fill();

    if (text) {
      ctx.font = size/3 + "px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000000";
      ctx.fillText(text, size/2, size/2 - size/6);
    }

    return new CanvasTexture(canvas);
  }  

  static buildWarningMarkersTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    
    CanvasTextureBuilder.drawWarningSign(ctx, "gray", 64, 0, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "yellow", 64, 64, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "orange", 64, 0, 64);
    CanvasTextureBuilder.drawWarningSign(ctx, "red", 64, 64, 64);

    return new CanvasTexture(canvas);
  }
    
  static buildCircleTexture(size: number, color: number): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, 2*Math.PI);
    ctx.closePath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fill();

    return new CanvasTexture(canvas);
  }

  private static drawWarningSign(ctx: CanvasRenderingContext2D, color: string, 
    size: number, offsetX: number, offsetY: number) {
    ctx.moveTo(offsetX, offsetY);
    // outer triangle
    ctx.fillStyle = color;
    const outerPath = new Path2D(`
      M ${0.09375 * size + offsetX} ${0.9375 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.0125 * size + offsetX} ${0.796875 * size + offsetY}
      L ${0.41875 * size + offsetX} ${0.07815 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.58046875 * size + offsetX} ${0.078125 * size + offsetY} 
      L ${0.9875 * size + offsetX} ${0.796875 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.90625 * size + offsetX} ${0.9375 * size + offsetY} 
      Z`);
    ctx.fill(outerPath);
    // inner triangle
    ctx.fillStyle = "white";
    const innerPath = new Path2D(`
      M ${0.1953125 * size + offsetX} ${0.8515625 * size + offsetY}
      A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.134375 * size + offsetX} ${0.74609375 * size + offsetY}
      L ${0.4390625 * size + offsetX} ${0.2109375 * size + offsetY} 
      A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.5609375 * size + offsetX} ${0.2109375 * size + offsetY}
      L ${0.865625 * size + offsetX} ${0.74609375 * size + offsetY}
      A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.8046875 * size + offsetX} ${0.8515625 * size + offsetY} 
      Z`);
    ctx.fill(innerPath);    
    // exclamation mark top
    ctx.fillStyle = "black";
    const exclamationPath = new Path2D(`
      M ${0.4375 * size + offsetX} ${0.3515625 * size + offsetY} 
      a ${0.0625 * size} ${0.0625 * size} 0 0 1 ${0.125 * size} 0
      L ${0.53125 * size + offsetX} ${0.625 * size + offsetY} 
      a ${0.0234375 * size} ${0.0234375 * size} 0 0 1 ${-0.046875 * size} 0`);
    ctx.fill(exclamationPath);    
    // exclamation mark bottom
    ctx.moveTo(0.5 * size + offsetX, 0.75 * size + offsetY);
    ctx.arc(0.5 * size + offsetX, 0.75 * size + offsetY, 0.0625 * size, 0, 2 * Math.PI);
    ctx.fill();  
  }
}
