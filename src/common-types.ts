import { Mesh, MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, 
  Uint32BufferAttribute, Float32BufferAttribute, Uint8BufferAttribute,  } from "three";

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

// #region types
export type MeshMergeType = "scene" | "model" | "model+" | null;

export type FastRenderType = "ch" | "aabb" | "ombb" | null;

export type MeshBgSm = Mesh<BufferGeometry, MeshStandardMaterial>;

export type MeshBgBm = Mesh<BufferGeometry, MeshBasicMaterial>;
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
// #endregion
