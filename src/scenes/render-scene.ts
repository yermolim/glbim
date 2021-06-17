import { Light, Scene, Mesh, Color, MeshStandardMaterial,
  BufferGeometry, Uint32BufferAttribute, Uint8BufferAttribute, 
  Float32BufferAttribute, InterleavedBufferAttribute} from "three";

import { MeshMergeType, Mesh_BG, MergedGeometry, ModelGeometryInfo } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

interface RefreshMeshColorsResult {
  rgbRmo: ColorRgbRmo; 
  opacityChanged: boolean;
}

export interface RenderSceneColors {
  selectionColor: number;
  highlightColor: number;
  isolationColor: number;
  isolationOpacity: number; 
};

export class RenderScene {
  private _currentMergeType: MeshMergeType;  
  private _isolationDefaultOpacity: number;
  private _isolationColorsByOpacity = new Map<number, ColorRgbRmo>();
  private _selectionColor: Color;
  private _highlightColor: Color;

  private _scene: Scene;
  private _geometries: MergedGeometry[] = [];
  private _globalMaterial: MeshStandardMaterial;
  private _materials = new Map<string, MeshStandardMaterial>();
  
  private _geometryIndexBySourceMesh = new Map<Mesh_BG, number>();
  private _sourceMeshesByGeometryIndex = new Map<number, Mesh_BG[]>();
  private _renderMeshBySourceMesh = new Map<Mesh_BG, Mesh_BG>();  
  private _geometryIndicesNeedSort = new Set<number>();
  
  get scene(): Scene {
    return this._scene;
  }    
  get geometries(): MergedGeometry[] {
    return this._geometries;
  }
  get meshes(): Mesh_BG[] {
    return [...this._renderMeshBySourceMesh.values()];
  }

  constructor(colors: RenderSceneColors) {
    this.updateCommonColors(colors);
    this._globalMaterial = MaterialBuilder.buildGlobalMaterial();
  }

  destroy() {    
    this.deleteScene();
    this.destroyMaterials();
  }
  
  async updateSceneAsync(lights: Light[], meshes: Mesh_BG[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<void> {

    this.deleteScene();
    await this.createSceneAsync(lights, meshes, models, meshMergeType);
    this.updateMeshColors(new Set<Mesh_BG>(meshes));
  }    

  /**
   * force materials to refresh on the next render call
   */
  updateSceneMaterials() {
    this._globalMaterial.needsUpdate = true;
    this._materials.forEach(v => v.needsUpdate = true);
  }
  
  /**
   * apply the actual coloring to meshes based on current mesh states 
   * @param sourceMeshes 
   */
  updateMeshColors(sourceMeshes: Set<Mesh_BG>) {
    if (this._currentMergeType) {
      this.updateMeshGeometryColors(sourceMeshes);
    } else {
      this.updateMeshMaterials(sourceMeshes);
    }
    this.sortGeometryIndicesByOpacity();
  }  

  /**
   * update the colors used for mesh highlighting, selection, isolation
   * @param colors 
   */
  updateCommonColors(colors: RenderSceneColors) {
    if (!colors) {
      throw new Error("Colors are not defined");
    }
    const {isolationColor, isolationOpacity, selectionColor, highlightColor} = colors;

    this._isolationDefaultOpacity = isolationOpacity;
    this._isolationColorsByOpacity.clear();
    this._isolationColorsByOpacity.set(isolationOpacity, MaterialBuilder.buildIsolationColor(isolationColor, isolationOpacity));

    this._selectionColor = new Color(selectionColor);
    this._highlightColor = new Color(highlightColor);
  }
  // // #endregion

  // #region private scene methods 
  private deleteScene() {   
    this._geometries.forEach(x => x.geometry.dispose());
    this._geometries.length = 0;
    this._geometryIndexBySourceMesh.clear();   
    this._sourceMeshesByGeometryIndex.clear(); 
    this._renderMeshBySourceMesh.clear();  
    this._geometryIndicesNeedSort.clear();  
    this._scene = null;
  }

  private async createSceneAsync(lights: Light[], meshes: Mesh_BG[], 
    models: ModelGeometryInfo[], meshMergeType: MeshMergeType): Promise<void> {      
    const scene = new Scene();
    scene.add(...lights);

    if (meshMergeType) {
      const meshGroups = await this.groupModelMeshesByMergeType(meshes, 
        models, meshMergeType);

      for (const meshGroup of meshGroups) {
        if (!meshGroup.length) {
          continue;
        }
        
        const geometry = await this.buildMergedGeometryAsync(meshGroup);        
        if (!geometry) {
          continue;
        }
        this._geometries.push(geometry);
        const lastGeomIndex = this._geometries.length - 1;
        this._sourceMeshesByGeometryIndex.set(lastGeomIndex, meshGroup);
        this._geometryIndicesNeedSort.add(lastGeomIndex);

        for (const mesh of meshGroup) {
          this._geometryIndexBySourceMesh.set(mesh, lastGeomIndex);
        }
      }

      for (const renderGeometry of this._geometries) {
        const mesh = new Mesh(renderGeometry.geometry, this._globalMaterial);
        scene.add(mesh);
      }

    } else {
      for (const sourceMesh of meshes) {
        const rgbRmo = ColorRgbRmo.getFinalColorFromMesh(sourceMesh);
        const material = this.getMaterialByColor(rgbRmo);
        const renderMesh = new Mesh(sourceMesh.geometry, material);
        renderMesh.applyMatrix4(sourceMesh.matrixWorld);
        this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
        scene.add(renderMesh); 
      }
    } 

    this._currentMergeType = meshMergeType;
    this._scene = scene;
  }

  private async groupModelMeshesByMergeType(meshes: Mesh_BG[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<Mesh_BG[][]> {

    let grouppedMeshes: Mesh_BG[][];
    switch (meshMergeType) {
      case "scene":
        grouppedMeshes = [meshes];
        break;
      case "model":
        grouppedMeshes = models.map(x => x.meshes).filter(x => x.length);
        break;
      case "model+":
        grouppedMeshes = [];  
        const chunkSize = 1000;
        models.map(x => x.meshes).filter(x => x.length).forEach(x => {
          if (x.length <= chunkSize) {
            grouppedMeshes.push(x);
          } else {
            for (let i = 0; i < x.length; i += chunkSize) {
              const chunk = x.slice(i, i + chunkSize);
              grouppedMeshes.push(chunk);
            }
          }
        });
        break;
      default:
        grouppedMeshes = [];
    }   

    return grouppedMeshes;
  }

  /**
   * merge meshes geometries into the single one
   * @param meshes 
   * @returns 
   */
  private async buildMergedGeometryAsync(meshes: Mesh_BG[]): Promise<MergedGeometry> {
    let positionsLen = 0;
    let indicesLen = 0;

    meshes.forEach(x => {
      positionsLen += x.geometry.getAttribute("position").count * 3;
      indicesLen += x.geometry.getIndex().count;;      
    });

    if (positionsLen === 0) {
      return null;
    }

    const mergedIndexAttr = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
    const mergedColorAttr = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
    const mergedRmoAttr = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
    const mergedPositionAttr = new Float32BufferAttribute(new Float32Array(positionsLen), 3);

    const mergedIndexArray = mergedIndexAttr.array as Uint32Array;
    const mergedColorArray = mergedColorAttr.array as Uint8Array;
    const mergedRmoArray = mergedRmoAttr.array as Uint8Array;
    const mergedPositionArray = mergedPositionAttr.array as Float32Array;

    const indicesBySourceMesh = new Map<Mesh_BG, Uint32Array>();    
    
    let positionsCursor = 0; 
    let positionsOffset = 0; 
    let positionsStride = 3; 
    let indicesCursor = 0;
    let mesh: Mesh_BG;
    let index: number;

    let rgbRmo: ColorRgbRmo;
    let r: number;
    let g: number;
    let b: number;
    let roughness: number;
    let metalness: number;
    let opacity: number;

    let m: number;
    let n: number;

    let p1: number;
    let p2: number;
    let p3: number;

    let lastBreakTime = performance.now();

    // splitting into chunks to UI remain responsible
    for (let i = 0; i < meshes.length; i++) {

      if (performance.now() - lastBreakTime > 100) {
        // break on timeout every 100ms to keep UI responsive
        await new Promise<void>((resolve) => { 
          setTimeout(() => {
            resolve();
          }, 0);
        });
        lastBreakTime = performance.now();
      }

      mesh = meshes[i];

      // get the mesh current positions and indices
      const geometry = <BufferGeometry>mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld);

      const positionAttr = geometry.getAttribute("position");
      if (positionAttr instanceof InterleavedBufferAttribute) {
        positionsOffset = positionAttr.offset;
        positionsStride = positionAttr.data.stride;
      }
      const positionArray = positionAttr.array;
      const indexArray = geometry.getIndex().array;

      // get colors
      rgbRmo = ColorRgbRmo.getFinalColorFromMesh(mesh);
      r = rgbRmo.rByte;
      g = rgbRmo.gByte;
      b = rgbRmo.bByte;
      roughness = rgbRmo.roughnessByte;
      metalness = rgbRmo.metalnessByte;
      opacity = rgbRmo.opacityByte;

      // fill indices
      const meshIndices = new Uint32Array(indexArray.length);
      indicesBySourceMesh.set(mesh, meshIndices);
      for (m = 0; m < indexArray.length; m++) {
        index = indexArray[m] + positionsCursor;
        meshIndices[m] = index;
        mergedIndexArray[indicesCursor++] = index;
      }

      // fill positions and colors        
      for (n = positionsOffset; n < positionArray.length;) {   
        p1 = positionsCursor * 3;
        p2 = p1 + 1;
        p3 = p2 + 1;

        mergedColorArray[p1] = r;
        mergedColorArray[p2] = g;
        mergedColorArray[p3] = b;

        mergedRmoArray[p1] = roughness;
        mergedRmoArray[p2] = metalness;
        mergedRmoArray[p3] = opacity;

        mergedPositionArray[p1] = positionArray[n];
        mergedPositionArray[p2] = positionArray[n + 1];
        mergedPositionArray[p3] = positionArray[n + 2];

        positionsCursor++;
        n += positionsStride;
      }
      
      geometry.dispose();
    }

    const mergedBufferGeometry = new BufferGeometry();
    mergedBufferGeometry.setIndex(mergedIndexAttr);   
    mergedBufferGeometry.setAttribute("color", mergedColorAttr);      
    mergedBufferGeometry.setAttribute("rmo", mergedRmoAttr); 
    mergedBufferGeometry.setAttribute("position", mergedPositionAttr); 
    
    return {
      geometry: mergedBufferGeometry,
      positions: mergedPositionAttr,
      colors: mergedColorAttr,
      rmos: mergedRmoAttr,
      indices: mergedIndexAttr,
      indicesBySourceMesh,
    };
  }   

  private updateMeshMaterials(sourceMeshes: Set<Mesh_BG> | Mesh_BG[]) {
    sourceMeshes.forEach((sourceMesh: Mesh_BG) => { 
      const { rgbRmo } = this.refreshMeshColors(sourceMesh);      
      const material = this.getMaterialByColor(rgbRmo);
      const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
      if (renderMesh) {
        renderMesh.material = material;
      }
    });
  } 

  /**
   * apply the actual coloring to meshes based on current mesh states 
   * @param sourceMeshes 
   */
  private updateMeshGeometryColors(sourceMeshes: Set<Mesh_BG> | Mesh_BG[]) {
    const meshesByRgIndex = new Map<number, Mesh_BG[]>();
    sourceMeshes.forEach((mesh: Mesh_BG) => {
      const rgIndex = this._geometryIndexBySourceMesh.get(mesh);
      if (meshesByRgIndex.has(rgIndex)) {
        meshesByRgIndex.get(rgIndex).push(mesh);
      } else {
        meshesByRgIndex.set(rgIndex, [mesh]);
      }
    });

    meshesByRgIndex.forEach((v, k) => {
      this.updateGeometryColors(k, v);
    });
  }

  /**
   * apply the actual coloring to geometry meshes based on current mesh states 
   * @param rgIndex 
   * @param meshes 
   * @returns 
   */
  private updateGeometryColors(rgIndex: number, meshes: Mesh_BG[]) {
    const geometry = this._geometries[rgIndex];
    if (!geometry) {
      return;
    }

    const { colors, rmos, indicesBySourceMesh } = geometry;
    const colorBuffer = colors.array as Uint8Array;
    const rmoBuffer = rmos.array as Uint8Array;

    let anyMeshOpacityChanged = false; 
    let i: number;
    let j: number;
    let mesh: Mesh_BG;
    let indices: Uint32Array;
    let initialOpacity: number;
    let refreshColorsResult: RefreshMeshColorsResult;
    let color: ColorRgbRmo;
    
    let r: number;
    let g: number;
    let b: number;
    let roughness: number;
    let metalness: number;
    let opacity: number;
    let index: number;
    
    let n1: number;
    let n2: number;
    let n3: number;

    for (i = 0; i < meshes.length; i++) {
      mesh = meshes[i]; 
      indices = indicesBySourceMesh.get(mesh);

      initialOpacity = rmos.getZ(indices[0]) / 255;
      refreshColorsResult = this.refreshMeshColors(mesh, initialOpacity);
      if (!anyMeshOpacityChanged && refreshColorsResult.opacityChanged) {
        anyMeshOpacityChanged = true;
      }      
      color = refreshColorsResult.rgbRmo;
      r = color.rByte;
      g = color.gByte;
      b = color.bByte;
      roughness = color.roughnessByte;
      metalness = color.metalnessByte;
      opacity = color.opacityByte;

      for (j = 0; j < indices.length; j++) {
        index = indices[j] * 3;

        n1 = index;
        n2 = index + 1;
        n3 = index + 2;

        colorBuffer[n1] = r;
        colorBuffer[n2] = g;
        colorBuffer[n3] = b;
        
        rmoBuffer[n1] = roughness;
        rmoBuffer[n2] = metalness;
        rmoBuffer[n3] = opacity;
      }
    }

    colors.needsUpdate = true;
    rmos.needsUpdate = true;
    if (anyMeshOpacityChanged) {
      this._geometryIndicesNeedSort.add(rgIndex);
    }
  }

  /**
   * change the order of geometry indices 
   * to force all opaque meshes to render before the transparent ones
   * (all meshes with opacity less than 1 is treated as transparent)
   */
  private sortGeometryIndicesByOpacity() {
    let j: number;
    let m: number;
    let n: number;
    let p: number;
    let q: number;

    let meshes: Mesh_BG[];
    let opaqueMeshes: Mesh_BG[];
    let transparentMeshes: Mesh_BG[];
    let mesh: Mesh_BG;

    let renderGeometry: MergedGeometry;
    let indexMap: Map<Mesh, Uint32Array>;
    let indexArray: Uint32Array;
    let opaqueIndices: Uint32Array;
    let transparentIndices: Uint32Array;    
    let currentIndex: number;

    for (const index of this._geometryIndicesNeedSort) {
      meshes = this._sourceMeshesByGeometryIndex.get(index);
      opaqueMeshes = [];
      transparentMeshes = [];
      for (j = 0; j < meshes.length; j++) {
        mesh = meshes[j];
        if (ColorRgbRmo.getFinalColorFromMesh(mesh).opacity === 1) {
          opaqueMeshes.push(mesh);
        } else {
          transparentMeshes.push(mesh);
        }
      }

      renderGeometry = this._geometries[index];
      indexArray = renderGeometry.indices.array as Uint32Array;
      indexMap = renderGeometry.indicesBySourceMesh;

      currentIndex = 0;
      for (m = 0; m < opaqueMeshes.length; m++) {
        opaqueIndices = indexMap.get(opaqueMeshes[m]);
        for (p = 0; p < opaqueIndices.length; p++) {
          indexArray[currentIndex++] = opaqueIndices[p];
        }
      }
      for (n = 0; n < transparentMeshes.length; n++) {
        transparentIndices = indexMap.get(transparentMeshes[n]);
        for (q = 0; q < transparentIndices.length; q++) {
          indexArray[currentIndex++] = transparentIndices[q];
        }
      }

      renderGeometry.indices.needsUpdate = true;
    }

    this._geometryIndicesNeedSort.clear();
  }
  // #endregion

  // #region private common materials
  private getMaterialByColor(rgbRmo: ColorRgbRmo): MeshStandardMaterial {
    const key = rgbRmo.toString();
    if (this._materials.has(key)) {
      return this._materials.get(key);
    }
    const material = MaterialBuilder.buildStandardMaterial(rgbRmo);     
    this._materials.set(key, material);
    return material;
  }   

  /**
   * apply actual colors to the mesh based on the current mesh state
   * @param mesh 
   * @param opacityInitial current mesh opacity (optional)
   * @returns 
   */
  private refreshMeshColors(mesh: Mesh_BG, 
    opacityInitial: number = null): RefreshMeshColorsResult {

    opacityInitial = opacityInitial ?? ColorRgbRmo.getFinalColorFromMesh(mesh).opacity;   
    if (!mesh.userData.isolated) {
      ColorRgbRmo.deleteColorFromMesh(mesh);
    }
    const rgbRmoBase = ColorRgbRmo.getFinalColorFromMesh(mesh);  

    // coloring priority for shown meshes:
    // highlight -> selection -> isolation ->* paint -> mesh original color
    // *isolation opacity must always be less or equal to the paint and original color

    let rgbRmo: ColorRgbRmo;
    if (mesh.userData.highlighted) {  
      rgbRmo = new ColorRgbRmo(        
        this._highlightColor.r,
        this._highlightColor.g,
        this._highlightColor.b,
        rgbRmoBase.roughness,
        rgbRmoBase.metalness,
        rgbRmoBase.opacity,  
      );
    } else if (mesh.userData.selected) {  
      rgbRmo = new ColorRgbRmo(        
        this._selectionColor.r,
        this._selectionColor.g,
        this._selectionColor.b,
        rgbRmoBase.roughness,
        rgbRmoBase.metalness,
        rgbRmoBase.opacity,  
      );
    } else if (mesh.userData.isolated) {
      const opacity = Math.min(rgbRmoBase.opacity, this._isolationDefaultOpacity);
      let isolationColor = this._isolationColorsByOpacity.get(opacity);
      if (!isolationColor) {        
        isolationColor =  this._isolationColorsByOpacity.get(this._isolationDefaultOpacity).clone();
        isolationColor.opacity = opacity;
        this._isolationColorsByOpacity.set(opacity, isolationColor);
      }
      rgbRmo = isolationColor;
    } else {
      rgbRmo = rgbRmoBase;
    }

    ColorRgbRmo.setOverrideColorToMesh(mesh, rgbRmo);
    const opacityChanged = (rgbRmo.opacity === 1 && opacityInitial < 1)
      || (rgbRmo.opacity < 1 && opacityInitial === 1);

    return { rgbRmo, opacityChanged };
  } 

  private destroyMaterials() {    
    this._globalMaterial.dispose();
    this._globalMaterial = null; 
    
    this._materials.forEach(v => v.dispose());
    this._materials = null;
  }
  // #endregion
}
