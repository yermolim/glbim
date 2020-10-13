import { Light, Scene, Mesh, Vector3, Color,
  BufferGeometry, BoxBufferGeometry, SphereBufferGeometry,
  Uint32BufferAttribute, Uint8BufferAttribute, Float32BufferAttribute, 
  MeshBasicMaterial, MeshStandardMaterial } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { Line2 } from "three/examples/jsm/lines/Line2";

import {MarkerType, LineType, MeshMergeType, MeshBgSm, 
  RenderGeometry, ModelGeometryInfo, MarkerInfo, LineInfo } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

export class RenderScene {
  private _currentMergeType: MeshMergeType;  
  private _isolationColor: ColorRgbRmo;
  private _selectionColor: Color;
  private _highlightColor: Color;

  private _scene: Scene;
  private _geometries: RenderGeometry[] = [];
  private _globalMaterial: MeshStandardMaterial;
  private _materials = new Map<string, MeshStandardMaterial>();

  private _markerMaterials: MeshBasicMaterial[] = [];
  private _lineMaterials: LineMaterial[] = [];
  private _markers = new Map<MarkerType, MarkerInfo>();
  private _lines = new Map<LineType, LineInfo>();
  
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

  constructor(isolationColor: number, isolationOpacity: number, 
    selectionColor: number, highlightColor: number) {

    this.updateCommonColors(isolationColor, isolationOpacity, selectionColor, highlightColor);
    this._globalMaterial = MaterialBuilder.buildGlobalMaterial(); 

    this.buildMarkers();
    this.buildLines();
  }

  destroy() {    
    this.destroyScene();
    this.destroyMaterials();
    this.destroyMarkers();
    this.destroyLines();
  }
  
  async updateSceneAsync(lights: Light[], meshes: MeshBgSm[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<void> {

    this.deleteScene();
    await this.createSceneAsync(lights, meshes, models, meshMergeType);
  }    

  updateSceneMaterials() {
    this._globalMaterial.needsUpdate = true;
    this._materials.forEach(v => v.needsUpdate = true);
  }

  updateResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    this._lineMaterials.forEach(x => x.resolution.set(rendererBufferWidth, rendererBufferHeight));
  }
  
  updateMeshColors(sourceMeshes: Set<MeshBgSm>) {
    if (this._currentMergeType) {
      this.updateMeshGeometryColors(sourceMeshes);
    } else {
      this.updateMeshMaterials(sourceMeshes);
    }

    this.sortGeometryIndicesByOpacity(); 
  }  

  updateCommonColors(isolationColor: number, isolationOpacity: number, 
    selectionColor: number, highlightColor: number) {

    this._isolationColor = MaterialBuilder.buildIsolationColor(isolationColor, isolationOpacity);
    this._selectionColor = new Color(selectionColor);
    this._highlightColor = new Color(highlightColor);
  }

  // #region markers
  setMarker(type: MarkerType, position: Vector3) {
    const marker = this._markers.get(type);
    if (!marker.active) {
      this.scene.add(marker.mesh);
      marker.active = true;
    }
    marker.mesh.position.set(position.x, position.y, position.z);
  } 

  resetMarker(type: MarkerType) {
    const marker = this._markers.get(type);
    if (marker.active) {
      this.scene.remove(marker.mesh);
      marker.active = false;
      marker.mesh.position.set(0, 0, 0);
    }
  }  

  resetMarkers() {
    [...this._markers.keys()].forEach(x => this.resetMarker(x));
  }
  // #endregion

  // #region segments
  setSegment(type: LineType, start: Vector3, end: Vector3) {
    const lineInfo = this._lines.get(type);
    if (!lineInfo.active) {
      this.scene.add(lineInfo.line);
      lineInfo.active = true;
    }
    lineInfo.line.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    
  }

  resetSegment(type: LineType) {
    const lineInfo = this._lines.get(type);
    if (lineInfo.active) {
      this.scene.remove(lineInfo.line);
      lineInfo.active = false;
      lineInfo.line.geometry.setPositions([0, 0, 0, 0, 0, 0]);
    }
  }

  resetSegments() {    
    [...this._lines.keys()].forEach(x => this.resetSegment(x));
  }
  // #endregion

  // #region private markers
  private buildMarkers() { 
    this._markerMaterials[0] = MaterialBuilder.buildBasicMaterial(0xFF00FF);
    this._markerMaterials[1] = MaterialBuilder.buildBasicMaterial(0x391285);
    this._markerMaterials[2] = MaterialBuilder.buildBasicMaterial(0x00FFFF);
    
    this._markers.set("temp", {
      mesh: new Mesh(new SphereBufferGeometry(0.1, 16, 8), this._markerMaterials[0]),
      active: false,
      type: "temp",
    });
    this._markers.set("start", {
      mesh: new Mesh(new SphereBufferGeometry(0.1, 4, 2), this._markerMaterials[1]),
      active: false,
      type: "start",
    });
    this._markers.set("end", {
      mesh: new Mesh(new BoxBufferGeometry(0.2, 0.2, 0.2), this._markerMaterials[2]),
      active: false,
      type: "end",
    });
  }  

  private destroyMarkers() {
    this._markers?.forEach(v => v.mesh.geometry.dispose());
    this._markers = null;
    
    this._markerMaterials?.forEach(x => x.dispose());
    this._markerMaterials = null;
  }
  // #endregion

  // #region private lines
  private buildLines() { 
    this._lineMaterials[0] = MaterialBuilder.buildLineMaterial(0x0000FF, 4);

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([0, 0, 0, 0, 0, 0]);
    const distanceLine = new Line2(lineGeometry, this._lineMaterials[0]);
    distanceLine.frustumCulled = false;
    this._lines.set("distance", {
      line: distanceLine,
      active: false,
      type: "distance",
    });
  }

  private destroyLines() {
    this._lines?.forEach(v => v.line.geometry.dispose());
    this._lines = null;
    
    this._lineMaterials?.forEach(x => x.dispose());
    this._lineMaterials = null;
  }
  // #endregion

  // #region private scene methods 
  private deleteScene() {   
    this._geometries.forEach(x => x.geometry.dispose());
    this._geometries.length = 0;
    this._geometryIndexBySourceMesh.clear();   
    this._sourceMeshesByGeometryIndex.clear(); 
    this._renderMeshBySourceMesh.clear();  
    this._geometryIndicesNeedSort.clear();  
    this._markers.forEach(x => x.active = false);
    this._lines.forEach(x => x.active = false);
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
        const mesh = new Mesh(x.geometry, this._globalMaterial);
        scene.add(mesh);
      });
    } else {
      meshes.forEach(sourceMesh => {
        const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
        const material = this.getMaterialByColor(rgbRmo);
        const renderMesh = new Mesh(sourceMesh.geometry, material);
        renderMesh.applyMatrix4(sourceMesh.matrix);
        this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
        scene.add(renderMesh); 
      });
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
      const { rgbRmo } = this.refreshMeshColors(sourceMesh);      
      const material = this.getMaterialByColor(rgbRmo);
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
    const geometry = this._geometries[rgIndex];
    if (!geometry) {
      return;
    }
    const { colors, rmos, indicesBySourceMesh } = geometry;
    let anyMeshOpacityChanged = false;
    meshes.forEach(mesh => {
      const { rgbRmo, opacityChanged } = this.refreshMeshColors(mesh); 
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

  private refreshMeshColors(mesh: MeshBgSm): {rgbRmo: ColorRgbRmo; opacityChanged: boolean} {     
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

  private destroyMaterials() {    
    this._globalMaterial.dispose();
    this._globalMaterial = null; 
    
    this._materials.forEach(v => v.dispose());
    this._materials = null;
  }
  // #endregion
}
