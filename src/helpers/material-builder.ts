import { Color, DoubleSide, NormalBlending, NoBlending, CanvasTexture,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial,
  MeshBasicMaterial, LineBasicMaterial, SpriteMaterial } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";

import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

export class MaterialBuilder {  
  static buildGlobalMaterial(): MeshStandardMaterial {    
    const material = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{
      vertexColors: true,
      flatShading: true,
      blending: NormalBlending,
      side: DoubleSide,
      transparent: true,
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 
        `
        attribute vec3 rmo;        
        varying float roughness;
        varying float metalness;
        varying float opacity;
        ` 
        + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("void main() {",
        `
        void main() {
          roughness = rmo.x;
          metalness = rmo.y;
          opacity = rmo.z;
        `
      );      
      shader.fragmentShader = shader.fragmentShader.replace("uniform float roughness;", "varying float roughness;");
      shader.fragmentShader = shader.fragmentShader.replace("uniform float metalness;", "varying float metalness;");
      shader.fragmentShader = shader.fragmentShader.replace("uniform float opacity;", "varying float opacity;");  
    };
    return material;
  }    
  
  static buildIsolationColor(hex: number, opacity: number): ColorRgbRmo {    
    const isolationColor = new Color(hex);
    const isolationColorRgbRmo = new ColorRgbRmo(
      isolationColor.r, isolationColor.g, isolationColor.b,
      1, 0, opacity);
    return isolationColorRgbRmo;
  }

  static buildStandardMaterial(rgbRmo: ColorRgbRmo): MeshStandardMaterial {
    const material = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{
      blending: NormalBlending,
      side: DoubleSide,
      flatShading: true,
      color: new Color(rgbRmo.r, rgbRmo.g, rgbRmo.b),
      transparent: rgbRmo.opacity !== 1,
      roughness: rgbRmo.roughness,
      metalness: rgbRmo.metalness,
      opacity: rgbRmo.opacity,
    });
    return material;
  }   

  static buildPhongMaterial(): MeshPhongMaterial {
    const material = new MeshPhongMaterial({
      color: 0x808080,
      transparent: false,
      flatShading: true,
      blending: NormalBlending,
      side: DoubleSide,
    });
    return material;
  }

  static buildBasicMaterial(color: number): MeshBasicMaterial {
    return new MeshBasicMaterial({ 
      color, 
      flatShading: true,
      blending: NoBlending,
      side: DoubleSide,
    });
  }
  
  static buildLineBasicMaterial(color: number, width: number): LineBasicMaterial {
    return new LineBasicMaterial({color, linewidth: width});
  }
    
  static buildLineMaterial(color: number, width: number): LineMaterial {
    return new LineMaterial({color, linewidth: width});
  }  

  static buildAxisSpriteMaterial(size: number, color: number, text: string): SpriteMaterial {
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

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({map: texture, toneMapped: false});
  }
  
  static buildCircleSpriteMaterial(size: number, color: number): SpriteMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, 2*Math.PI);
    ctx.closePath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fill();

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({map: texture, toneMapped: false});
  }
  
  static buildSquareSpriteMaterial(size: number, color: number): SpriteMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fillRect(0, 0, size, size);

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({map: texture, toneMapped: false});
  }
    
  static buildTriangleSpriteMaterial(size: number, color: number): SpriteMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size/2, 0);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fill();

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({map: texture, toneMapped: false});
  }

  static buildDiamondSpriteMaterial(size: number, color: number): SpriteMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(0, size/2);
    ctx.lineTo(size/2, 0);
    ctx.lineTo(size, size/2);
    ctx.lineTo(size/2, size);
    ctx.closePath();
    ctx.fillStyle = new Color(color).getStyle();
    ctx.fill();

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({map: texture, toneMapped: false});
  }
}
