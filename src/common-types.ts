import { Mesh, Vector3, Material, MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, 
  Uint32BufferAttribute, Float32BufferAttribute, Uint8BufferAttribute } from "three";

// #region types
export type MeshMergeType = "scene" | "model" | "model+" | null;

export type FastRenderType = "ch" | "aabb" | "ombb" | null;

export type MeshBgSm = Mesh<BufferGeometry, MeshStandardMaterial>;

export type MeshBgBm = Mesh<BufferGeometry, MeshBasicMaterial>;

export type MeshBgAm = Mesh<BufferGeometry, Material>;

export type CornerName = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type AxisName = "x" | "y" | "z" | "-x" | "-y" | "-z";

export type ViewerInteractionMode = "select_mesh" | "select_vertex" | "select_sprite" | "measure_distance";

export type MarkerType = "warn_0" | "warn_1" | "warn_2" | "warn_3" | "photo";
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

export interface MarkerInfo {
  id: string;
  description: string;
  position: Vec4DoubleCS;
  type: MarkerType;
}

export interface SnapPoint {
  meshId: string;
  position: Vec4DoubleCS;
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
  
  constructor(x: number, y: number, z: number, w = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
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

export class Vec4DoubleCS {
  private _x: number;
  private _y: number;
  private _z: number;
  private _w: number;
  
  get x(): number {
    return this._x;
  }
  get w(): number {
    return this._w;
  }
  
  get y_Yup(): number {
    return this._y;
  }
  get z_Yup(): number {
    return this._z;
  }

  get y_Zup(): number {
    return -this._z;
  }
  get z_Zup(): number {
    return this._y;
  }

  constructor(isZup = false, x = 0, y = 0, z = 0, w = 0) {
    this._x = x;
    this._w = w;

    if (isZup) {      
      this._y = z;
      this._z = -y;
    } else {      
      this._y = y;
      this._z = z;
    }
  } 

  static fromVector3(vec: {x: number; y: number; z: number}, isZup = false): Vec4DoubleCS {
    return vec 
      ? new Vec4DoubleCS(isZup, vec.x, vec.y, vec.z)
      : new Vec4DoubleCS(isZup);
  }

  toVec4(isZup = false): Vec4 {
    return !isZup
      ? new Vec4(this._x, this._y, this._z, this._w)
      : new Vec4(this._x, -this._z, this._y, this._w);
  }

  equals(other: Vec4DoubleCS): boolean {
    if (!other) {
      return false;
    }
    return this._x === other._x
      && this._y === other._y
      && this._z === other._z
      && this._w === other._w;
  }
}

export class Distance {  
  start: Vec4;
  end: Vec4;
  distance: Vec4; 
  
  constructor (start: {x: number; y: number; z: number}, 
    end: {x: number; y: number; z: number}) {
    this.start = new Vec4(start.x, start.y, start.z);
    this.end = new Vec4(end.x, end.y, end.z);
    this.distance = Vec4.getDistance(this.start, this.end);
  }
}
// #endregion
