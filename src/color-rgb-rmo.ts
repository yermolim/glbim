import { Color, MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial,
  NormalBlending, DoubleSide } from "three";
import { MeshBgSm } from "./common-types";

export class ColorRgbRmo {
  private static readonly prop = "rgbrmo";
  private static readonly customProp = "rgbrmoC";
  private static readonly defaultProp = "rgbrmoD";

  r: number;
  g: number;
  b: number;
  roughness: number;
  metalness: number;
  opacity: number;

  get rByte(): number {
    return this.r * 255;
  }
  get gByte(): number {
    return this.g * 255;
  }
  get bByte(): number {
    return this.b * 255;
  }
  get roughnessByte(): number {
    return this.roughness * 255;
  }
  get metalnessByte(): number {
    return this.metalness * 255;
  }
  get opacityByte(): number {
    return this.opacity * 255;
  }

  constructor(r: number, g: number, b: number,
    roughness: number, metalness: number, opacity: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.roughness = roughness;
    this.metalness = metalness;
    this.opacity = opacity;
  }

  static createFromMaterial(material: MeshStandardMaterial): ColorRgbRmo {
    return new ColorRgbRmo(
      material.color.r,
      material.color.g,
      material.color.b,
      material.roughness,
      material.metalness,
      material.opacity);
  }

  static deleteFromMesh(mesh: MeshBgSm,
    deleteCustom = false, deleteDefault = false) {

    mesh[ColorRgbRmo.prop] = null;
    if (deleteCustom) {
      mesh[ColorRgbRmo.customProp] = null;
    }
    if (deleteDefault) {
      mesh[ColorRgbRmo.defaultProp] = null;
    }
  }

  static getDefaultFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    if (!mesh[ColorRgbRmo.defaultProp]) {      
      mesh[ColorRgbRmo.defaultProp] = ColorRgbRmo.createFromMaterial(mesh.material);
    }
    return mesh[ColorRgbRmo.defaultProp];
  }
  static getCustomFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    return mesh[ColorRgbRmo.customProp];
  }
  static getFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    if (mesh[ColorRgbRmo.prop]) {
      return mesh[ColorRgbRmo.prop];
    }
    if (mesh[ColorRgbRmo.customProp]) {      
      return mesh[ColorRgbRmo.customProp];
    }
    return ColorRgbRmo.getDefaultFromMesh(mesh);
  }

  static setCustomToMesh(mesh: MeshBgSm, rgbRmo: ColorRgbRmo) {
    mesh[ColorRgbRmo.customProp] = rgbRmo;
  }
  static setToMesh(mesh: MeshBgSm, rgbRmo: ColorRgbRmo) {
    mesh[ColorRgbRmo.prop] = rgbRmo;
  }  

  toString() {
    return `${this.r}|${this.g}|${this.b}|${this.roughness}|${this.metalness}|${this.opacity}`;
  }
}

export class ColorRgbRmoUtils {
  private _isolationColor: ColorRgbRmo;
  private _selectionColor: Color;
  private _highlightColor: Color;

  private _globalMaterial: MeshStandardMaterial;
  private _simpleMaterial: MeshPhongMaterial;
  private _materials = new Map<string, MeshStandardMaterial>();

  get globalMaterial(): MeshStandardMaterial {
    return this._globalMaterial;
  }
  get simpleMaterial(): MeshPhongMaterial {
    return this._simpleMaterial;
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
    this._simpleMaterial = this.buildSimpleMaterial();
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

  private buildSimpleMaterial(): MeshPhongMaterial {
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
}
