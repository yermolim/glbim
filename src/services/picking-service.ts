import { BufferAttribute, Camera, Face, Mesh, Raycaster, Scene, 
  Triangle, Vector2, Vector3, WebGLRenderer } from "three";

import { Mesh_BG, SnapPoint, Vec4DoubleCS } from "../common-types";

import { PickingScene } from "../scenes/picking-scene";

import { ModelLoaderService } from "./model-loader-service";
import { RenderService } from "./render-service";

export class PickingService {
  private readonly _loaderService: ModelLoaderService;

  private _pickingScene: PickingScene;
  get scene(): Scene {
    return this._pickingScene.scene;
  }
  
  private readonly _raycaster: Raycaster;
  
  constructor(loaderService: ModelLoaderService) {   
    if (!loaderService) {
      throw new Error("LoaderService is not defined");
    }
    
    this._loaderService = loaderService;
    this._loaderService.addMeshCallback("mesh-loaded", this.onLoaderMeshLoaded);
    this._loaderService.addMeshCallback("mesh-unloaded", this.onLoaderMeshUnloaded);

    this._pickingScene = new PickingScene();
    this._raycaster = new Raycaster();
  }

  destroy() {
    this._loaderService.removeCallback("mesh-loaded", this.onLoaderMeshLoaded);
    this._loaderService.removeCallback("mesh-unloaded", this.onLoaderMeshUnloaded);

    this._pickingScene?.destroy();
    this._pickingScene = null;
  }
  
  getMeshAt(renderService: RenderService, clientX: number, clientY: number): Mesh_BG {  
    const position = renderService.convertClientToCanvas(clientX, clientY); 
    return this._pickingScene.getSourceMeshAt(renderService.camera, renderService.renderer, position);
  }

  getMeshesInArea(renderService: RenderService, 
    clientStartX: number, clientStartY: number, 
    clientEndX: number, clientEndY: number): Mesh_BG[] {
    
    const canvasStart = renderService.convertClientToCanvas(clientStartX, clientStartY);
    const canvasEnd = renderService.convertClientToCanvas(clientEndX, clientEndY);     

    const minAreaCX = Math.min(canvasStart.x, canvasEnd.x);
    const minAreaCY = Math.min(canvasStart.y, canvasEnd.y);
    const maxAreaCX = Math.max(canvasStart.x, canvasEnd.x);
    const maxAreaCY = Math.max(canvasStart.y, canvasEnd.y);    

    const centerPointTemp = new Vector3();
    const meshes: Mesh_BG[] = [];
    for (const mesh of this.scene.children) {
      if (!(mesh instanceof Mesh)) {
        // not a mesh. ignore it
        continue;
      }

      const sourceMesh = this._pickingScene.getVisibleSourceMeshByColor(mesh.userData.color);
      if (!sourceMesh) {
        // the mesh is not visible. ignore it
        continue;
      }

      // calculate bounding sphere center of the mesh
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }

      // get the transformed center of the mesh
      centerPointTemp.copy(mesh.geometry.boundingSphere.center);
      mesh.updateMatrixWorld();
      centerPointTemp.applyMatrix4(mesh.matrixWorld); 

      // check if the mesh center is inside the area
      const canvasCoords = renderService.convertWorldToCanvas(centerPointTemp);
      if (canvasCoords.x < minAreaCX
        || canvasCoords.x > maxAreaCX
        || canvasCoords.y < minAreaCY
        || canvasCoords.y > maxAreaCY) {
        continue;
      }

      // add the mesh source id to the array
      meshes.push(sourceMesh);
    }
  
    return meshes;
  }
  
  getSnapPointAt(renderService: RenderService, clientX: number, clientY: number): SnapPoint {
    const position = renderService.convertClientToCanvas(clientX, clientY);
    const pickingMesh = this._pickingScene.getPickingMeshAt(renderService.camera, renderService.renderer, position);

    const point = pickingMesh
      ? this.getMeshSnapPointAtPosition(renderService.camera, renderService.renderer, position, pickingMesh)
      : null;

    const snapPoint = point
      ? { meshId: pickingMesh.userData.sourceId, position: Vec4DoubleCS.fromVector3(point) } 
      : null;

    return snapPoint;
  }

  private addMesh(mesh: Mesh_BG) {        
    this._pickingScene.add(mesh);
  }

  private removeMesh(mesh: Mesh_BG) {
    this._pickingScene.remove(mesh);
  }
  
  private onLoaderMeshLoaded = (mesh: Mesh_BG) => {    
    this.addMesh(mesh);
  };

  private onLoaderMeshUnloaded = (mesh: Mesh_BG) => {    
    this.removeMesh(mesh);
  };
  
  private getMeshSnapPointAtPosition(camera: Camera, renderer: WebGLRenderer, 
    position: Vector2, mesh: Mesh_BG): Vector3 {
    if (!mesh) {
      return null;
    }

    const context = renderer.getContext(); 
    const xNormalized = position.x / context.drawingBufferWidth * 2 - 1;
    const yNormalized = position.y / context.drawingBufferHeight * -2 + 1;    
    return this.getPoint(camera, mesh, new Vector2(xNormalized, yNormalized));
  }

  private getPoint(camera: Camera, mesh: Mesh_BG, mousePoint: Vector2): Vector3 {
    this._raycaster.setFromCamera(mousePoint, camera);
    const intersection = this._raycaster.intersectObject(mesh)[0];
    if (!intersection) {
      return null;
    }

    const intersectionPoint = new Vector3().copy(intersection.point);
    intersection.object.worldToLocal(intersectionPoint);

    const snapPoint = new Vector3().copy(this.getNearestVertex(mesh, intersectionPoint, intersection.face));
    if (!snapPoint) {
      return null;
    }
    
    intersection.object.localToWorld(snapPoint);    
    return snapPoint;
  }

  private getNearestVertex(mesh: Mesh_BG, point: Vector3, face: Face): Vector3 {
    const a = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.a);
    const b = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.b);
    const c = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.c);
    const baryPoint = new Vector3();
    new Triangle(a, b, c).getBarycoord(point, baryPoint);

    if (baryPoint.x > baryPoint.y && baryPoint.x > baryPoint.z) {
      return a;
    } else if (baryPoint.y > baryPoint.x && baryPoint.y > baryPoint.z) {
      return b;
    } else if (baryPoint.z > baryPoint.x && baryPoint.z > baryPoint.y) {
      return c;
    } else {
      return null;
    }
  }
}
