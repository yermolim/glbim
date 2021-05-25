import { BufferAttribute, Camera, Face, Object3D, Raycaster, Scene, 
  Triangle, Vector2, Vector3, WebGLRenderer } from "three";

import { MeshBgAm, MeshBgSm, SnapPoint, Vec4DoubleCS } from "../common-types";
import { AreaSelector } from "../helpers/area-selector";

import { PickingScene } from "../scenes/picking-scene";
import { RenderService } from "./render-service";

export class PickingService {
  private _pickingScene: PickingScene;
  get scene(): Scene {
    return this._pickingScene.scene;
  }
  
  private readonly _raycaster: Raycaster;
  private readonly _areaSelector: AreaSelector;
  
  constructor() {    
    this._pickingScene = new PickingScene();
    this._raycaster = new Raycaster();
    this._areaSelector = new AreaSelector();
  }

  destroy() {
    this._pickingScene?.destroy();
    this._pickingScene = null;
  }

  addMesh(mesh: MeshBgSm) {        
    this._pickingScene.add(mesh);
  }

  removeMesh(mesh: MeshBgSm) {
    this._pickingScene.remove(mesh);
  }
  
  getMeshAt(renderService: RenderService, clientX: number, clientY: number): MeshBgSm {  
    const position = renderService.convertClientToCanvas(clientX, clientY); 
    return this._pickingScene.getSourceMeshAt(renderService.camera, renderService.renderer, position);
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

  getMeshIdsInArea(renderService: RenderService, 
    clientMinX: number, clientMinY: number, 
    clientMaxX: number, clientMaxY: number): string[] {
      
    const min = renderService.convertClientToCanvasZeroCenterNormalized(clientMinX, clientMinY);
    const max = renderService.convertClientToCanvasZeroCenterNormalized(clientMaxX, clientMaxY);
    
    const objects = this._areaSelector.select(renderService.camera, this.scene, 
      new Vector3(min.x, min.y, 0), new Vector3(max.x, max.y, 0));

    const ids = objects.map(x => x.userData.id).filter(x => x);
    return ids;
  }
  
  private getMeshSnapPointAtPosition(camera: Camera, renderer: WebGLRenderer, 
    position: Vector2, mesh: MeshBgAm): Vector3 {
    if (!mesh) {
      return null;
    }

    const context = renderer.getContext(); 
    const xNormalized = position.x / context.drawingBufferWidth * 2 - 1;
    const yNormalized = position.y / context.drawingBufferHeight * -2 + 1;    
    return this.getPoint(camera, mesh, new Vector2(xNormalized, yNormalized));
  }

  private getPoint(camera: Camera, mesh: MeshBgAm, mousePoint: Vector2): Vector3 {
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

  private getNearestVertex(mesh: MeshBgAm, point: Vector3, face: Face): Vector3 {
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
