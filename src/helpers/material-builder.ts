import { Color, DoubleSide, NormalBlending, NoBlending, 
  Texture, Material,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial,
  MeshBasicMaterial, LineBasicMaterial, SpriteMaterial, RawShaderMaterial } from "three";
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
    
  static buildLineMaterial(color: number, width: number, dashed: boolean): LineMaterial {
    const material = new LineMaterial({
      color, 
      linewidth: width,
    });

    if (dashed) {      
      material.dashed = true;
      material.dashScale = 0.5;
      material.dashSize = 1;
      material.gapSize = 1;
      material.defines.USE_DASH = "";
      material.needsUpdate = true;
    }

    return material;
  }  

  static buildSpriteMaterial(texture: Texture): SpriteMaterial {
    return new SpriteMaterial({map: texture, toneMapped: false});
  }
}
