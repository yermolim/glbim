import { Mesh, Vector3, Sprite, Material, MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, 
  Uint32BufferAttribute, Float32BufferAttribute, Uint8BufferAttribute } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2";

// #region types
export type MeshMergeType = "scene" | "model" | "model+" | null;

export type FastRenderType = "ch" | "aabb" | "ombb" | null;

export type MeshBgSm = Mesh<BufferGeometry, MeshStandardMaterial>;

export type MeshBgBm = Mesh<BufferGeometry, MeshBasicMaterial>;

export type MeshBgAm = Mesh<BufferGeometry, Material>;

export type CornerName = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type AxisName = "x" | "y" | "z" | "-x" | "-y" | "-z";
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
// #endregion

// #region small helper classes
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
// #endregion
