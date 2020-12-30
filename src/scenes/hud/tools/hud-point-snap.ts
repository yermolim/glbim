import { BehaviorSubject, Observable, Subject } from "rxjs";
import { Scene, Vector2, Matrix4 } from "three";
import { SnapPoint } from "../../../common-types";
import { CanvasTextureBuilder } from "../../../helpers/canvas-texture-builder";
import { HudTool } from "./hud-tool";
import { HudInstancedMarkerData, HudInstancedMarker } from "../elements/hud-instanced-marker";
import { HudUniqueMarker } from "../elements/hud-unique-marker";

export class HudPointSnap extends HudTool { 
  snapPointsHighlightChange$: Observable<SnapPoint>;
  snapPointsManualSelectionChange$: Observable<SnapPoint[]>;
  
  private _snapPointsHighlightChange: Subject<SnapPoint>;  
  private _snapPointsManualSelectionChange: BehaviorSubject<SnapPoint[]>;

  private _selectedPoints = new Map<string, SnapPoint>();
  
  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex);

    this._snapPointsHighlightChange = new Subject<SnapPoint>();
    this._snapPointsManualSelectionChange = new BehaviorSubject<SnapPoint[]>([]);
    this._subjects.push(this._snapPointsHighlightChange, this._snapPointsManualSelectionChange);    
    this.snapPointsHighlightChange$ = this._snapPointsHighlightChange.asObservable();
    this.snapPointsManualSelectionChange$ = this._snapPointsManualSelectionChange.asObservable();

    this.initSprites();    
  }
    
  setSnapPoint(snapPoint: SnapPoint) {
    if (snapPoint) {
      this.getHudElement("s_snap").set([snapPoint.position.toVector3()]);
      this._snapPointsHighlightChange.next(snapPoint);
    } else {
      this.getHudElement("s_snap").reset();
      this._snapPointsHighlightChange.next(null);
    }
  }

  resetSnapPoint() {
    this._snapPointsHighlightChange.next(null);
    this.getHudElement("s_snap").reset(); 
  }

  addSnapPointToSelected(point: SnapPoint) {
    if (!point) {
      return;
    }
    this._selectedPoints.set(`${point.position.x}|${point.position.y_Yup}|${point.position.z_Yup}|${point.meshId}`, point);
    this.updateSelectedPointSprites();
  }

  removeSnapPointFromSelected(point: SnapPoint) {    
    if (!point) {
      return;
    }
    const key = `${point.position.x}|${point.position.y_Yup}|${point.position.z_Yup}|${point.meshId}`;
    if (this._selectedPoints.has(key)) {
      this._selectedPoints.delete(key);
      this.updateSelectedPointSprites();
    }
  }

  setSelectedSnapPoints(points: SnapPoint[]) {
    if (!points?.length) {
      this.resetSelectedSnapPoints();
      return;
    }
    this._selectedPoints.clear();
    points.forEach(x => {
      this._selectedPoints.set(`${x.position.x}|${x.position.y_Yup}|${x.position.z_Yup}|${x.meshId}`, x);
    });
    this.updateSelectedPointSprites();
  }

  resetSelectedSnapPoints() {
    this._selectedPoints.clear();
    this.updateSelectedPointSprites();
  }
  
  reset() {
    this.resetSelectedSnapPoints();
    this.resetSnapPoint();
  } 
  
  private initSprites() {
    this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution,
      CanvasTextureBuilder.buildCircleTexture(64, 0x8B0000), 8, 
      this._toolZIndex, this._cameraZIndex, false), "s_snap_selection");
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0xFF00FF), 8, 
      this._toolZIndex, this._cameraZIndex), "s_snap");
  }  
  
  private updateSelectedPointSprites() {
    const points: SnapPoint[] = new Array(this._selectedPoints.size);
    const instanceData: HudInstancedMarkerData[] = new Array(this._selectedPoints.size);
    let i = 0;
    this._selectedPoints.forEach(v => {
      points[i] = v;
      instanceData[i++] = {
        position: v.position,
        scale: 1,
        uv: null,
      };
    });
    this.getHudElement("s_snap_selection").set(instanceData);
    this._snapPointsManualSelectionChange.next(points);
  }
}
