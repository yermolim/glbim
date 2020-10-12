import { Mesh, Line, Material, MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, 
  Uint32BufferAttribute, Float32BufferAttribute, Uint8BufferAttribute, LineBasicMaterial, Vector3 } from "three";

// #region types
export type MeshMergeType = "scene" | "model" | "model+" | null;

export type FastRenderType = "ch" | "aabb" | "ombb" | null;

export type MarkerType = "temp" | "start" | "end";

export type SegmentType = "distance";

export type MeshBgSm = Mesh<BufferGeometry, MeshStandardMaterial>;

export type MeshBgBm = Mesh<BufferGeometry, MeshBasicMaterial>;

export type MeshBgAm = Mesh<BufferGeometry, Material>;

export type LineBgBm = Line<BufferGeometry, LineBasicMaterial>;
// #endregion

// #region interfaces
export interface ModelFileInfo {
  url: string; 
  guid: string; 
  name: string;
}

export interface ModelLoadedInfo {
  url: string; 
  guid: string; 
  error?: Error;
}

export interface ModelLoadingInfo {
  url: string; 
  guid: string; 
  progress: number;
}

export interface ModelOpenedInfo {
  guid: string; 
  name: string; 
  handles: Set<string>;
}

export interface ColoringInfo {
  color: number; 
  opacity: number;
  ids: string[];
}

export interface ModelGeometryInfo {
  name: string;
  meshes: MeshBgSm[]; 
  handles: Set<string>; 
}

export interface RenderGeometry {  
  geometry: BufferGeometry;
  positions: Float32BufferAttribute;
  colors: Uint8BufferAttribute;
  rmos: Uint8BufferAttribute;
  indices: Uint32BufferAttribute;
  indicesBySourceMesh: Map<MeshBgSm, Uint32Array>;
}

export interface Marker {
  type: MarkerType;
  active: boolean;
  mesh: MeshBgBm;
}

export interface Segment {
  type: SegmentType;
  active: boolean;
  line: LineBgBm;
}
// #endregion

// #region helper classes
export class PointerEventHelper {
  downX: number; 
  downY: number; 
  maxDiff: number; 
  mouseMoveTimer: number;
  waitForDouble: boolean;

  static get default(): PointerEventHelper {
    return { 
      downX: null, 
      downY: null, 
      maxDiff: 10, 
      mouseMoveTimer: null, 
      waitForDouble: false 
    };
  }
}

export class Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
  
  constructor(x: number, y: number, z: number, w = 0, toZup = false) {
    this.x = x;
    if (toZup) {
      this.y = -z;
      this.z = y;
    } else {
      this.y = y;
      this.z = z;
    }
    this.w = w;
  }  

  static getDistance(start: Vec4, end: Vec4): Vec4 {    
    const distX = end.x - start.x;
    const distY = end.y - start.y;
    const distZ = end.z - start.z;
    const distW = Math.sqrt(distX * distX + distY * distY + distZ * distZ);
    return new Vec4(distX, distY, distZ, distW);
  }
}

export class Distance {  
  start: Vec4;
  end: Vec4;
  distance: Vec4; 
  
  constructor (start: Vector3, end: Vector3, toZup: boolean) {
    this.start = new Vec4(start.x, start.y, start.z, 0, toZup);
    this.end = new Vec4(end.x, end.y, end.z, 0, toZup);
    this.distance = Vec4.getDistance(this.start, this.end);
  }
}

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
// #endregion
