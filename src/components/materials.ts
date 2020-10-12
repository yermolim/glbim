import { Color, DoubleSide, NormalBlending, CanvasTexture,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial,
  MeshBasicMaterial, LineBasicMaterial, SpriteMaterial } from "three";
import { MeshBgSm, ColorRgbRmo } from "../common-types";

export class Materials {
  private _isolationColor: ColorRgbRmo;
  private _selectionColor: Color;
  private _highlightColor: Color;

  private _globalMaterial: MeshStandardMaterial;
  private _simpleMaterial: MeshPhongMaterial;
  private _lineMaterials: LineBasicMaterial[];
  private _markerMaterials: MeshBasicMaterial[];
  private _axisMaterials: MeshBasicMaterial[];
  private _axisLabelMaterials: SpriteMaterial[];

  private _materials = new Map<string, MeshStandardMaterial>();

  get globalMaterial(): MeshStandardMaterial {
    return this._globalMaterial;
  }
  get simpleMaterial(): MeshPhongMaterial {
    return this._simpleMaterial;
  }
  get lineMaterials(): LineBasicMaterial[] {
    return this._lineMaterials;
  }
  get markerMaterials(): MeshBasicMaterial[] {
    return this._markerMaterials;
  }
  get axisMaterials(): MeshBasicMaterial[] {
    return this._axisMaterials;
  }
  get axisLabelMaterials(): SpriteMaterial[] {
    return this._axisLabelMaterials;
  }
  get materials(): MeshStandardMaterial[] {
    return [...this._materials.values()];
  }
  
  constructor(isolationColor: number, isolationOpacity: number, 
    selectionColor: number, highlightColor: number) {

    this._isolationColor = this.buildIsolationColor(isolationColor, isolationOpacity);
    this._selectionColor = new Color(selectionColor);
    this._highlightColor = new Color(highlightColor);

    this._globalMaterial = this.buildGlobalMaterial();
    this._simpleMaterial = this.buildPhongMaterial();

    this._lineMaterials = new Array(1);
    this._lineMaterials[0] = this.buildLineBasicMaterial(0x0000FF, 3);

    this._markerMaterials = new Array(3);
    this._markerMaterials[0] = this.buildBasicMaterial(0xFF00FF);
    this._markerMaterials[1] = this.buildBasicMaterial(0x391285);
    this._markerMaterials[2] = this.buildBasicMaterial(0x00FFFF);
    
    this._axisMaterials = new Array(3);
    this._axisMaterials[0] = this.buildBasicMaterial(0xFF3653);
    this._axisMaterials[1] = this.buildBasicMaterial(0x8adb00);
    this._axisMaterials[2] = this.buildBasicMaterial(0x2c8FFF);

    this._axisLabelMaterials = new Array(6);
    this._axisLabelMaterials[0] = this.buildSpriteMaterial(64, 0xFF3653, "X");
    this._axisLabelMaterials[1] = this.buildSpriteMaterial(64, 0xA32235, "-X");
    this._axisLabelMaterials[2] = this.buildSpriteMaterial(64, 0x8ADB00, "Y");
    this._axisLabelMaterials[3] = this.buildSpriteMaterial(64, 0x588C00, "-Y");
    this._axisLabelMaterials[4] = this.buildSpriteMaterial(64, 0x2C8FFF, "Z");
    this._axisLabelMaterials[5] = this.buildSpriteMaterial(64, 0x1C5BA3, "-Z");
  }

  updateColors(isolationColor: number, isolationOpacity: number, 
    selectionColor: number, highlightColor: number) {

    this._isolationColor = this.buildIsolationColor(isolationColor, isolationOpacity);
    this._selectionColor = new Color(selectionColor);
    this._highlightColor = new Color(highlightColor);
  }
  
  updateMaterials() {
    this._globalMaterial.needsUpdate = true;
    this._simpleMaterial.needsUpdate = true;
    this._materials.forEach(v => v.needsUpdate = true);
  }

  destroy() {
    this._globalMaterial.dispose();
    this._globalMaterial = null; 

    this._simpleMaterial.dispose();
    this._simpleMaterial = null;

    this._lineMaterials?.forEach(x => x.dispose());
    this._markerMaterials = null;

    this._markerMaterials?.forEach(x => x.dispose());
    this._markerMaterials = null;
    
    this._axisMaterials?.forEach(x => x.dispose());
    this._axisMaterials = null;

    this._axisLabelMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._axisLabelMaterials = null;

    this._materials.forEach(v => v.dispose());
    this._materials = null;
  }
  
  refreshMeshColors(mesh: MeshBgSm): {rgbRmo: ColorRgbRmo; opacityChanged: boolean} {     
    const initialRgbRmo = ColorRgbRmo.getFromMesh(mesh);       
    if (!mesh.userData.isolated) {
      ColorRgbRmo.deleteFromMesh(mesh);
    }
    const baseRgbRmo = ColorRgbRmo.getFromMesh(mesh);  

    let newRgbRmo: ColorRgbRmo;
    if (mesh.userData.highlighted) {  
      newRgbRmo = new ColorRgbRmo(        
        this._highlightColor.r,
        this._highlightColor.g,
        this._highlightColor.b,
        baseRgbRmo.roughness,
        baseRgbRmo.metalness,
        baseRgbRmo.opacity,  
      );
    } else if (mesh.userData.selected) {  
      newRgbRmo = new ColorRgbRmo(        
        this._selectionColor.r,
        this._selectionColor.g,
        this._selectionColor.b,
        baseRgbRmo.roughness,
        baseRgbRmo.metalness,
        baseRgbRmo.opacity,  
      );
    } else if (mesh.userData.isolated) { 
      newRgbRmo = this._isolationColor;
    } else {
      newRgbRmo = baseRgbRmo;
    }

    ColorRgbRmo.setToMesh(mesh, newRgbRmo);

    return {
      rgbRmo: newRgbRmo,
      opacityChanged: newRgbRmo.opacity !== initialRgbRmo.opacity,
    };
  }

  getMaterial(rgbRmo: ColorRgbRmo): MeshStandardMaterial {
    const key = rgbRmo.toString();
    if (this._materials.has(key)) {
      return this._materials.get(key);
    }
    const material = this.buildStandardMaterial(rgbRmo);     
    this._materials.set(key, material);
    return material;
  }
  
  private buildIsolationColor(hex: number, opacity: number): ColorRgbRmo {    
    const isolationColor = new Color(hex);
    const isolationColorRgbRmo = new ColorRgbRmo(
      isolationColor.r, isolationColor.g, isolationColor.b,
      1, 0, opacity);
    return isolationColorRgbRmo;
  }

  private buildGlobalMaterial(): MeshStandardMaterial {    
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

  private buildPhongMaterial(): MeshPhongMaterial {
    const material = new MeshPhongMaterial({
      color: 0x808080,
      transparent: false,
      flatShading: true,
      blending: NormalBlending,
      side: DoubleSide,
    });
    return material;
  }

  private buildStandardMaterial(rgbRmo: ColorRgbRmo): MeshStandardMaterial {
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

  private buildBasicMaterial(color: number): MeshBasicMaterial {
    return new MeshBasicMaterial({color});
  }
  
  private buildLineBasicMaterial(color: number, width: number): LineBasicMaterial {
    return new LineBasicMaterial({color, linewidth: width});
  }

  private buildSpriteMaterial(size: number, color: number, text: string) {
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
}
