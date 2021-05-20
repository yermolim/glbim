import { PerspectiveCamera, WebGLRenderer } from "three";

import { MeshBgSm, SnapPoint, Vec4DoubleCS } from "../common-types";

import { PickingScene } from "../scenes/picking-scene";

import { PointSnapService } from "./point-snap-service";
import { RenderService } from "./render-service";

export class PickingService {
  private _pointSnapService: PointSnapService;
  private _pickingScene: PickingScene;
  
  constructor() {    
    this._pointSnapService = new PointSnapService();
    this._pickingScene = new PickingScene();
  }

  destroy() {
    this._pickingScene?.destroy();
    this._pickingScene = null;

    this._pointSnapService?.destroy();
    this._pointSnapService = null;
  }

  addMesh(mesh: MeshBgSm) {        
    this._pickingScene.add(mesh);
  }

  removeMesh(mesh: MeshBgSm) {
    this._pickingScene.remove(mesh);
  }
  
  getMeshAt(renderService: RenderService, clientX: number, clientY: number): MeshBgSm {  
    const position = PointSnapService.convertClientToCanvas(renderService.renderer, clientX, clientY); 
    return this._pickingScene.getSourceMeshAt(renderService.camera, renderService.renderer, position);
  }
  
  getSnapPointAt(renderService: RenderService, clientX: number, clientY: number): SnapPoint {
    const position = PointSnapService.convertClientToCanvas(renderService.renderer, clientX, clientY);
    const pickingMesh = this._pickingScene.getPickingMeshAt(renderService.camera, renderService.renderer, position);

    const point = pickingMesh
      ? this._pointSnapService.getMeshSnapPointAtPosition(renderService.camera, renderService.renderer, position, pickingMesh)
      : null;

    const snapPoint = point
      ? { meshId: pickingMesh.userData.sourceId, position: Vec4DoubleCS.fromVector3(point) } 
      : null;

    return snapPoint;
  }
}
