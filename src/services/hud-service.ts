import { Vector3 } from "three";

import { PickingService } from "./picking-service";
import { PointSnapService } from "./point-snap-service";
import { RenderService } from "./render-service";
import { ScenesService } from "./scenes-service";

export class HudService {
  private readonly _scenesService: ScenesService;
  private readonly _pickingService: PickingService;

  constructor(scenesService: ScenesService, pickingService: PickingService) {
    if (!scenesService) {
      throw new Error("ScenesService is not defined");
    }
    if (!pickingService) {
      throw new Error("PickingService is not defined");
    }
    this._scenesService = scenesService;
    this._pickingService = pickingService;
  }

  destroy() {

  }
  
  // snap points
  setVertexSnapAtPoint(renderService: RenderService, clientX: number, clientY: number) {    
    if (!renderService) {
      return;
    } 
    const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);    
    this._scenesService.hudScene.pointSnap.setSnapPoint(snapPoint);
    renderService.render(); 
  }
  
  selectVertexAtPoint(renderService: RenderService, clientX: number, clientY: number) {    
    if (!renderService) {
      return;
    } 
    const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);   
    this._scenesService.hudScene.pointSnap.setSelectedSnapPoints(snapPoint ? [snapPoint] : null);
    renderService.render(); 
  }
  
  // sprites(markers)
  highlightSpriteAtPoint(renderService: RenderService, clientX: number, clientY: number) {    
    if (!renderService) {
      return;
    } 

    const point = PointSnapService.convertClientToCanvasZeroCenter(renderService.renderer, clientX, clientY);
    const marker = this._scenesService.hudScene.markers.getMarkerAtCanvasPoint(point);
    this._scenesService.hudScene.markers.highlightMarker(marker);
    renderService.render(); 
  }
  
  selectSpriteAtPoint(renderService: RenderService, clientX: number, clientY: number) {    
    if (!renderService) {
      return;
    } 

    const point = PointSnapService.convertClientToCanvasZeroCenter(renderService.renderer, clientX, clientY);
    const marker = this._scenesService.hudScene.markers.getMarkerAtCanvasPoint(point);
    this._scenesService.hudScene.markers.setSelectedMarkers(marker ? [marker.id] : null, true);
    renderService.render(); 
  }

  // distance measure
  measureDistanceAtPoint(renderService: RenderService, clientX: number, clientY: number) { 
    if (!renderService) {
      return;
    }       
    const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);   
    const snapPosition = snapPoint?.position.toVec4();
    this._scenesService.hudScene.distanceMeasurer.setEndMarker(snapPoint
      ? new Vector3(snapPosition.x, snapPosition.y, snapPosition.z)
      : null); 
    renderService.render(); 
  }
}
