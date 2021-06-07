import { MeshStandardMaterial } from "three";
import { MeshBgSm } from "../common-types";

/**
 * R - Red
 * G - Green
 * B - blue
 * R - roughness
 * M - metalness
 * O - opacity
 */
export class ColorRgbRmo {
  private static readonly overrideColorProp = "rgbrmoOv";
  private static readonly paintColorProp = "rgbrmoP";
  private static readonly originalColorProp = "rgbrmoOr";

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
    roughness: number, metalness: number, opacity: number, byte = false) {
    if (byte) {
      this.r = r / 255;
      this.g = g / 255;
      this.b = b / 255;
      this.roughness = roughness / 255;
      this.metalness = metalness / 255;
      this.opacity = opacity / 255;      
    } else {
      this.r = r;
      this.g = g;
      this.b = b;
      this.roughness = roughness;
      this.metalness = metalness;
      this.opacity = opacity;
    }
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

  static deleteColorFromMesh(mesh: MeshBgSm,
    deleteCustom = false, deleteDefault = false) {

    mesh[ColorRgbRmo.overrideColorProp] = null;
    if (deleteCustom) {
      mesh[ColorRgbRmo.paintColorProp] = null;
    }
    if (deleteDefault) {
      mesh[ColorRgbRmo.originalColorProp] = null;
    }
  }

  static getOriginalColorFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    if (!mesh[ColorRgbRmo.originalColorProp]) {      
      mesh[ColorRgbRmo.originalColorProp] = ColorRgbRmo.createFromMaterial(mesh.material);
    }
    return mesh[ColorRgbRmo.originalColorProp];
  }
  static getPaintColorFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    return mesh[ColorRgbRmo.paintColorProp];
  }
  /**
   * get the resulting mesh color
   * in descending order of priority:
   * override color | paint color | mesh original color
   * @param mesh 
   * @returns 
   */
  static getFinalColorFromMesh(mesh: MeshBgSm): ColorRgbRmo {
    if (mesh[ColorRgbRmo.overrideColorProp]) {
      return mesh[ColorRgbRmo.overrideColorProp];
    }
    if (mesh[ColorRgbRmo.paintColorProp]) {      
      return mesh[ColorRgbRmo.paintColorProp];
    }
    return ColorRgbRmo.getOriginalColorFromMesh(mesh);
  }

  static setPaintColorToMesh(mesh: MeshBgSm, rgbRmo: ColorRgbRmo) {
    mesh[ColorRgbRmo.paintColorProp] = rgbRmo;
  }
  static setOverrideColorToMesh(mesh: MeshBgSm, rgbRmo: ColorRgbRmo) {
    mesh[ColorRgbRmo.overrideColorProp] = rgbRmo;
  }  

  clone(): ColorRgbRmo {
    const {r, g, b, roughness, metalness, opacity} = this;
    return new ColorRgbRmo(r, g, b, roughness, metalness, opacity);
  }

  toString() {
    return `${this.r}|${this.g}|${this.b}|${this.roughness}|${this.metalness}|${this.opacity}`;
  }
}
