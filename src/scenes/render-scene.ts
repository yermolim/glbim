import { Light, Scene, Mesh, Color, MeshStandardMaterial,
  BufferGeometry, Uint32BufferAttribute, Uint8BufferAttribute, 
  Float32BufferAttribute } from "three";

import { MeshMergeType, MeshBgSm, 
  RenderGeometry, ModelGeometryInfo } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

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
  private _geometries: RenderGeometry[] = [];
  private _globalMaterial: MeshStandardMaterial;
  private _materials = new Map<string, MeshStandardMaterial>();
  
  private _geometryIndexBySourceMesh = new Map<MeshBgSm, number>();
  private _sourceMeshesByGeometryIndex = new Map<number, MeshBgSm[]>();
  private _renderMeshBySourceMesh = new Map<MeshBgSm, MeshBgSm>();  
  private _geometryIndicesNeedSort = new Set<number>();
  
  get scene(): Scene {
    return this._scene;
  }    
  get geometries(): RenderGeometry[] {
    return this._geometries;
  }
  get meshes(): MeshBgSm[] {
    return [...this._renderMeshBySourceMesh.values()];
  }

  constructor(colors: RenderSceneColors) {

    this.updateCommonColors(colors);
    this._globalMaterial = MaterialBuilder.buildGlobalMaterial(); 
  }

  destroy() {    
    this.destroyScene();
    this.destroyMaterials();
  }
  
  async updateSceneAsync(lights: Light[], meshes: MeshBgSm[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<void> {

    this.deleteScene();
    await this.createSceneAsync(lights, meshes, models, meshMergeType);
    this.updateMeshColors(new Set<MeshBgSm>(meshes));
  }    

  updateSceneMaterials() {
    this._globalMaterial.needsUpdate = true;
    this._materials.forEach(v => v.needsUpdate = true);
  }
  
  updateMeshColors(sourceMeshes: Set<MeshBgSm>) {
    if (this._currentMergeType) {
      this.updateMeshGeometryColors(sourceMeshes);
    } else {
      this.updateMeshMaterials(sourceMeshes);
    }
    this.sortGeometryIndicesByOpacity();
  }  

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

  private async createSceneAsync(lights: Light[], meshes: MeshBgSm[], 
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
        
        const geometry = await this.buildRenderGeometryAsync(meshGroup);        
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
        const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
        const material = this.getMaterialByColor(rgbRmo);
        sourceMesh.updateMatrixWorld();
        const renderMesh = new Mesh(sourceMesh.geometry, material);
        renderMesh.applyMatrix4(sourceMesh.matrixWorld);
        this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
        scene.add(renderMesh); 
      }
    } 

    this._currentMergeType = meshMergeType;
    this._scene = scene;
  }

  private async groupModelMeshesByMergeType(meshes: MeshBgSm[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<MeshBgSm[][]> {

    let grouppedMeshes: MeshBgSm[][];
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

  private async buildRenderGeometryAsync(meshes: MeshBgSm[]): Promise<RenderGeometry> {
    let positionsLen = 0;
    let indicesLen = 0;

    meshes.forEach(x => {
      positionsLen += x.geometry.getAttribute("position").count * 3;
      indicesLen += x.geometry.getIndex().count;;      
    });

    if (positionsLen === 0) {
      return null;
    }

    const indexBuffer = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
    const colorBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
    const rmoBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
    const positionBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);

    const indexArray = indexBuffer.array as Uint32Array;
    const colorArray = colorBuffer.array as Uint8Array;
    const rmoArray = rmoBuffer.array as Uint8Array;
    const positionArray = positionBuffer.array as Float32Array;

    const indicesBySourceMesh = new Map<MeshBgSm, Uint32Array>();    
    
    let positionsOffset = 0; 
    let indicesOffset = 0;
    let mesh: MeshBgSm;
    let index: number;

    let rgbRmo: ColorRgbRmo;
    let r: number;
    let g: number;
    let b: number;
    let roughness: number;
    let metalness: number;
    let opacity: number;

    let i: number;
    let m: number;
    let n: number;

    let p1: number;
    let p2: number;
    let p3: number;

    let lastBreakTime = performance.now();

    // splitting into chunks to UI remain responsible
    for (i = 0; i < meshes.length; i++) {

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
      mesh.updateMatrixWorld();
      const geometry = <BufferGeometry>mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld);
      const positions = geometry.getAttribute("position").array;
      const indices = geometry.getIndex().array;

      // get colors
      rgbRmo = ColorRgbRmo.getFromMesh(mesh);
      r = rgbRmo.rByte;
      g = rgbRmo.gByte;
      b = rgbRmo.bByte;
      roughness = rgbRmo.roughnessByte;
      metalness = rgbRmo.metalnessByte;
      opacity = rgbRmo.opacityByte;

      // fill indices
      const meshIndices = new Uint32Array(indices.length);
      indicesBySourceMesh.set(mesh, meshIndices);
      for (m = 0; m < indices.length; m++) {
        index = indices[m] + positionsOffset;
        meshIndices[m] = index;
        indexArray[indicesOffset++] = index;
      }

      // fill positions and colors        
      for (n = 0; n < positions.length;) {   
        p1 = positionsOffset * 3;
        p2 = p1 + 1;
        p3 = p2 + 1;

        colorArray[p1] = r;
        colorArray[p2] = g;
        colorArray[p3] = b;

        rmoArray[p1] = roughness;
        rmoArray[p2] = metalness;
        rmoArray[p3] = opacity;

        positionArray[p1] = positions[n++];
        positionArray[p2] = positions[n++];
        positionArray[p3] = positions[n++];

        positionsOffset++;
      }
      
      geometry.dispose();
    }

    const renderGeometry = new BufferGeometry();
    renderGeometry.setIndex(indexBuffer);   
    renderGeometry.setAttribute("color", colorBuffer);      
    renderGeometry.setAttribute("rmo", rmoBuffer); 
    renderGeometry.setAttribute("position", positionBuffer); 
    
    return {
      geometry: renderGeometry,
      positions: positionBuffer,
      colors: colorBuffer,
      rmos: rmoBuffer,
      indices: indexBuffer,
      indicesBySourceMesh,
    };
  }   

  private updateMeshMaterials(sourceMeshes: Set<MeshBgSm> | MeshBgSm[]) {
    sourceMeshes.forEach((sourceMesh: MeshBgSm) => { 
      const { rgbRmo } = this.refreshMeshColors(sourceMesh);      
      const material = this.getMaterialByColor(rgbRmo);
      const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
      if (renderMesh) {
        renderMesh.material = material;
      }
    });
  } 

  private updateMeshGeometryColors(sourceMeshes: Set<MeshBgSm> | MeshBgSm[]) {
    const meshesByRgIndex = new Map<number, MeshBgSm[]>();
    sourceMeshes.forEach((mesh: MeshBgSm) => {
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

  private updateGeometryColors(rgIndex: number, meshes: MeshBgSm[]) {
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
    let mesh: MeshBgSm;
    let initialOpacity: number;
    let index: number;

    let r: number;
    let g: number;
    let b: number;
    let roughness: number;
    let metalness: number;
    let opacity: number;

    let n1: number;
    let n2: number;
    let n3: number;

    for (i = 0; i < meshes.length; i++) {
      mesh = meshes[i]; 
      const indices = indicesBySourceMesh.get(mesh);
      initialOpacity = rmos.getZ(indices[0]) / 255;
      const { rgbRmo, opacityChanged } = this.refreshMeshColors(mesh, initialOpacity);
      
      r = rgbRmo.rByte;
      g = rgbRmo.gByte;
      b = rgbRmo.bByte;
      roughness = rgbRmo.roughnessByte;
      metalness = rgbRmo.metalnessByte;
      opacity = rgbRmo.opacityByte;

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

      if (!anyMeshOpacityChanged && opacityChanged) {
        anyMeshOpacityChanged = true;
      }
    }

    colors.needsUpdate = true;
    rmos.needsUpdate = true;
    if (anyMeshOpacityChanged) {
      this._geometryIndicesNeedSort.add(rgIndex);
    }
  }

  private sortGeometryIndicesByOpacity() {
    let j: number;
    let m: number;
    let n: number;
    let p: number;
    let q: number;
    let mesh: MeshBgSm;
    let opaqueIndices: Uint32Array;
    let transparentIndices: Uint32Array;

    for (const index of this._geometryIndicesNeedSort) {
      const meshes = this._sourceMeshesByGeometryIndex.get(index);
      const opaqueMeshes: MeshBgSm[] = [];
      const transparentMeshes: MeshBgSm[] = [];
      for (j = 0; j < meshes.length; j++) {
        mesh = meshes[j];
        if (ColorRgbRmo.getFromMesh(mesh).opacity === 1) {
          opaqueMeshes.push(mesh);
        } else {
          transparentMeshes.push(mesh);
        }
      }

      const { indices, indicesBySourceMesh } = this._geometries[index];
      let currentIndex = 0;
      for (m = 0; m < opaqueMeshes.length; m++) {
        opaqueIndices = indicesBySourceMesh.get(opaqueMeshes[m]);
        for (p = 0; p < opaqueIndices.length; p++) {
          indices.setX(currentIndex++, opaqueIndices[p]);
        }
      }
      for (n = 0; n < transparentMeshes.length; n++) {
        transparentIndices = indicesBySourceMesh.get(transparentMeshes[n]);
        for (q = 0; q < transparentIndices.length; q++) {
          indices.setX(currentIndex++, transparentIndices[q]);
        }
      }

      indices.needsUpdate = true;
    }

    this._geometryIndicesNeedSort.clear();
  }   

  private destroyScene() {
    this._scene = null;

    this._geometries?.forEach(x => x.geometry.dispose());
    this._geometries = null;
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

  private refreshMeshColors(mesh: MeshBgSm, opacityInitial: number = null): 
  {rgbRmo: ColorRgbRmo; opacityChanged: boolean} {

    opacityInitial = opacityInitial ?? ColorRgbRmo.getFromMesh(mesh).opacity;   
    if (!mesh.userData.isolated) {
      ColorRgbRmo.deleteFromMesh(mesh);
    }
    const rgbRmoBase = ColorRgbRmo.getFromMesh(mesh);  

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

    ColorRgbRmo.setToMesh(mesh, rgbRmo);
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
