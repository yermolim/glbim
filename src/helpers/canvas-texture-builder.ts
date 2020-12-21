import { Color, CanvasTexture, Vector4 } from "three";

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

  static buildSpriteAtlasTexture(): {texture: CanvasTexture; uvMap: Map<string, Vector4>} {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    
    CanvasTextureBuilder.drawWarningSign(ctx, "gray", true, 64, 0, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "yellow", true, 64, 64, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "orange", true, 64, 128, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "red", true, 64, 192, 0);
    CanvasTextureBuilder.drawWarningSign(ctx, "gray", false, 64, 0, 64);
    CanvasTextureBuilder.drawWarningSign(ctx, "yellow", false, 64, 64, 64);
    CanvasTextureBuilder.drawWarningSign(ctx, "orange", false, 64, 128, 64);
    CanvasTextureBuilder.drawWarningSign(ctx, "red", false, 64, 192, 64);
    CanvasTextureBuilder.drawCameraLogo(ctx, "steelblue", 64, 0, 128);
    CanvasTextureBuilder.drawCameraLogo(ctx, "black", 64, 64, 128);

    const uvMap = new Map<string, Vector4>();
    uvMap.set("warn_0", new Vector4(0, 0.75, 0.25, 1));
    uvMap.set("warn_1", new Vector4(0.25, 0.75, 0.5, 1));
    uvMap.set("warn_2", new Vector4(0.5, 0.75, 0.75, 1));
    uvMap.set("warn_3", new Vector4(0.75, 0.75, 1, 1));
    uvMap.set("warn_0_selected", new Vector4(0, 0.5, 0.25, 0.75));
    uvMap.set("warn_1_selected", new Vector4(0.25, 0.5, 0.5, 0.75));
    uvMap.set("warn_2_selected", new Vector4(0.5, 0.5, 0.75, 0.75));
    uvMap.set("warn_3_selected", new Vector4(0.75, 0.5, 1, 0.75));
    uvMap.set("photo", new Vector4(0, 0.25, 0.25, 0.5));
    uvMap.set("photo_selected", new Vector4(0.25, 0.25, 0.5, 0.5));

    return {
      texture: new CanvasTexture(canvas),
      uvMap,
    };
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

  private static drawWarningSign(ctx: CanvasRenderingContext2D, color: string, drawInner: boolean,
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
    if (drawInner) {
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
    }
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

  private static drawCameraLogo(ctx: CanvasRenderingContext2D, color: string,
    size: number, offsetX: number, offsetY: number) {      
    ctx.moveTo(offsetX, offsetY);
    
    const mainPath = new Path2D(`
      M ${offsetX} ${0.3 * size + offsetY}
      H ${0.05 * size + offsetX}
      V ${0.25 * size + offsetY}
      H ${0.15 * size + offsetX}
      V ${0.30 * size + offsetY}
      H ${0.2 * size + offsetX}
      L ${0.3 * size + offsetX} ${0.15 * size + offsetY}
      H ${0.5 * size + offsetX}
      L ${0.6 * size + offsetX} ${0.3 * size + offsetY}
      H ${0.7 * size + offsetX}
      V ${0.25 * size + offsetY}
      H ${0.9 * size + offsetX}
      V ${0.3 * size + offsetY}
      H ${size + offsetX}
      V ${0.9 * size + offsetY}
      H ${offsetX}
      V ${0.3 * size + offsetY}
    `);
    ctx.fillStyle = color;
    ctx.fill(mainPath);
    
    const innerPath = new Path2D(`
    	M ${0.7 * size + offsetX} ${0.4 * size + offsetY}
      H ${0.85 * size + offsetX}
      V ${0.5 * size + offsetY}
      H ${0.7 * size + offsetX} 
      V ${0.4 * size + offsetY}
    `);
    ctx.fillStyle = "white";
    ctx.fill(innerPath);  
    
    ctx.beginPath();
    ctx.moveTo(0.4 * size + offsetX, 0.6 * size + offsetY);
    ctx.arc(0.4 * size + offsetX, 0.6 * size + offsetY, 0.2 * size, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(0.4 * size + offsetX, 0.6 * size + offsetY);
    ctx.arc(0.4 * size + offsetX, 0.6 * size + offsetY, 0.15 * size, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(0.1 * size + offsetX, 0.45 * size + offsetY);
    ctx.arc(0.1 * size + offsetX, 0.45 * size + offsetY, 0.05 * size, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();
  }
}
