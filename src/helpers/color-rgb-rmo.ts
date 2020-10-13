import { MeshStandardMaterial } from "three";
import { MeshBgSm } from "../common-types";

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
