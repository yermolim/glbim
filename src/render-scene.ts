import { Light, Scene, Mesh, BufferGeometry, 
  Uint32BufferAttribute, Uint8BufferAttribute, Float32BufferAttribute } from "three";

import { ModelGeometryInfo, MeshMergeType, MeshBgSm, RenderGeometry } from "./common-types";
import { ColorRgbRmo, ColorRgbRmoUtils } from "./color-rgb-rmo";

export class RenderScene {
  private _colorRgbRmoUtils: ColorRgbRmoUtils;

  private _currentMergeType: MeshMergeType;

  private _scene: Scene;
  private _geometries: RenderGeometry[] = [];
  
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

  constructor(colorRgbRmoUtils: ColorRgbRmoUtils) {
    if (!colorRgbRmoUtils) {
      throw new Error("ColorRgbRmoUtils is undefined!");
    }
    this._colorRgbRmoUtils = colorRgbRmoUtils;
  }

  destroy() {    
    this._geometries?.forEach(x => x.geometry.dispose());
    this._geometries = null;
    this._scene = null;
  }
  
  async updateSceneAsync(lights: Light[], meshes: MeshBgSm[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<void> {
    this._scene = null;
    const scene = new Scene();
    scene.add(...lights);     

    this._geometries.forEach(x => x.geometry.dispose());
    this._geometries.length = 0;
    this._geometryIndexBySourceMesh.clear();   
    this._sourceMeshesByGeometryIndex.clear(); 
    this._renderMeshBySourceMesh.clear();  
    this._geometryIndicesNeedSort.clear();  

    if (meshMergeType) {
      const meshGroups = await this.groupModelMeshesByMergeType(meshes, 
        models, meshMergeType);
      for (const meshGroup of meshGroups) {
        if (meshGroup.length) {
          const geometry = await this.buildRenderGeometryAsync(meshGroup);    
          if (!geometry) {
            continue;
          }      
          this._geometries.push(geometry);
          const i = this._geometries.length - 1;
          this._sourceMeshesByGeometryIndex.set(i, meshGroup);
          this._geometryIndicesNeedSort.add(i);
          meshGroup.forEach(x => {
            this._geometryIndexBySourceMesh.set(x, i);
          });
        }
      }
      this._geometries.forEach(x => {    
        const mesh = new Mesh(x.geometry, this._colorRgbRmoUtils.globalMaterial);
        scene.add(mesh);
      });
    } else {
      meshes.forEach(sourceMesh => {
        const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
        const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
        const renderMesh = new Mesh(sourceMesh.geometry, material);
        renderMesh.applyMatrix4(sourceMesh.matrix);
        this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
        scene.add(renderMesh); 
      });
    } 

    this._currentMergeType = meshMergeType;
    this._scene = scene;
  }  
  
  updateMeshColors(sourceMeshes: Set<MeshBgSm>) {
    if (this._currentMergeType) {
      this.updateMeshGeometryColors(sourceMeshes);
    } else {
      this.updateMeshMaterials(sourceMeshes);
    }

    this.sortGeometryIndicesByOpacity(); 
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
    const indicesBySourceMesh = new Map<MeshBgSm, Uint32Array>();    
    
    let positionsOffset = 0; 
    let indicesOffset = 0;
    // splitting into chunks to UI remain responsible
    const chunkSize = 100;
    const processChunk = (chunk: MeshBgSm[]) => {    
      chunk.forEach(x => {
        const geometry = <BufferGeometry>x.geometry
          .clone()
          .applyMatrix4(x.matrix);
        const positions = geometry.getAttribute("position").array;
        const indices = geometry.getIndex().array;
        const meshIndices = new Uint32Array(indices.length);
        indicesBySourceMesh.set(x, meshIndices);
        for (let i = 0; i < indices.length; i++) {
          const index = indices[i] + positionsOffset;
          indexBuffer.setX(indicesOffset++, index);
          meshIndices[i] = index;
        }
        for (let i = 0; i < positions.length;) {   
          const rgbrmo = ColorRgbRmo.getFromMesh(x);
          colorBuffer.setXYZ(positionsOffset, rgbrmo.rByte, rgbrmo.gByte, rgbrmo.bByte);
          rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughnessByte, rgbrmo.metalnessByte, rgbrmo.opacityByte);
          positionBuffer.setXYZ(positionsOffset++, positions[i++], positions[i++], positions[i++]);
        }
        geometry.dispose();
      });
    };
    for (let i = 0; i < meshes.length; i += chunkSize) {
      await new Promise((resolve) => { 
        setTimeout(() => {
          processChunk(meshes.slice(i, i + chunkSize));
          resolve();
        }, 0);
      });
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
      const { rgbRmo } = this._colorRgbRmoUtils.refreshMeshColors(sourceMesh);      
      const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
      const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
      renderMesh.material = material;
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
    const { colors, rmos, indicesBySourceMesh } = this._geometries[rgIndex];
    let anyMeshOpacityChanged = false;
    meshes.forEach(mesh => {
      const { rgbRmo, opacityChanged } = this._colorRgbRmoUtils
        .refreshMeshColors(mesh); 
      indicesBySourceMesh.get(mesh).forEach(i => {
        colors.setXYZ(i, rgbRmo.rByte, rgbRmo.gByte, rgbRmo.bByte);
        rmos.setXYZ(i, rgbRmo.roughnessByte, rgbRmo.metalnessByte, rgbRmo.opacityByte);
      });
      if (!anyMeshOpacityChanged && opacityChanged) {
        anyMeshOpacityChanged = true;
      }
    });
    colors.needsUpdate = true;
    rmos.needsUpdate = true;  
    if (anyMeshOpacityChanged) {
      this._geometryIndicesNeedSort.add(rgIndex);
    }  
  }  

  private sortGeometryIndicesByOpacity() {
    this._geometryIndicesNeedSort.forEach(i => {
      const meshes = this._sourceMeshesByGeometryIndex.get(i);

      const opaqueMeshes: MeshBgSm[] = [];
      const transparentMeshes: MeshBgSm[] = [];
      meshes.forEach(x => {
        if (ColorRgbRmo.getFromMesh(x).opacity === 1) {
          opaqueMeshes.push(x);
        } else {
          transparentMeshes.push(x);
        }
      });

      const { indices, indicesBySourceMesh } = this._geometries[i];
      let currentIndex = 0;
      opaqueMeshes.forEach(mesh => {
        indicesBySourceMesh.get(mesh).forEach(value => {
          indices.setX(currentIndex++, value);
        });
      });
      transparentMeshes.forEach(mesh => {
        indicesBySourceMesh.get(mesh).forEach(value => {
          indices.setX(currentIndex++, value);
        });
      });
      indices.needsUpdate = true;
    });
    this._geometryIndicesNeedSort.clear();
  }  
}
