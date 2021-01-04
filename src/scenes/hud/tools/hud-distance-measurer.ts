import { Observable, Subject } from "rxjs";
import { Scene, Vector2, Vector3, Matrix4 } from "three";
import { Distance, Vec4DoubleCS } from "../../../common-types";
import { CanvasTextureBuilder } from "../../../helpers/canvas-texture-builder";
import { HudTool } from "./hud-tool";
import { HudUniqueMarker } from "../elements/hud-unique-marker";
import { HudLineSegment } from "../elements/hud-line-segment";

export class HudDistanceMeasurer extends HudTool {  
  distanceMeasureChange$: Observable<Distance>;

  private _distanceMeasureChange: Subject<Distance>;  

  private _measurePoints: {start: Vector3; end: Vector3} = {start: null, end: null};

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number, spriteSize: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize);

    this._distanceMeasureChange = new Subject<Distance>(); 
    this._subjects.push(this._distanceMeasureChange);
    this.distanceMeasureChange$ = this._distanceMeasureChange.asObservable();

    this.initLines();
    this.initSprites();
  }

  setEndMarker(point: Vector3) {
    if (!point) {
      if (this._measurePoints.start) {
        this._measurePoints.start = null;
      }
      if (this._measurePoints.end) {
        this._measurePoints.end = null;
      }
    } else {
      if (this._measurePoints.end) {
        this._measurePoints.start = this._measurePoints.end;
        this._measurePoints.end = point;
      } else if (this._measurePoints.start) {
        this._measurePoints.end = point;
      } else {
        this._measurePoints.start = point;     
      }
    }

    if (this._measurePoints.start) {
      this.getHudElement("s_dm_start").set([this._measurePoints.start]);   
    } else {
      this.getHudElement("s_dm_start").reset(); 
    }

    if (this._measurePoints.end) {
      this.getHudElement("s_dm_end").set([this._measurePoints.end]);  
      this.setLines(true);
    } else {      
      this.getHudElement("s_dm_end").reset(); 
      this.resetLines();
    }
    
    if (this._measurePoints.start && this._measurePoints.end) {
      const start = Vec4DoubleCS.fromVector3(this._measurePoints.start);
      const end = Vec4DoubleCS.fromVector3(this._measurePoints.end);
      const distance = new Distance(start.toVec4(true), end.toVec4(true));
      this._distanceMeasureChange.next(distance);
    } else {
      this._distanceMeasureChange.next(null); 
    }
  }
  
  reset() {
    this._measurePoints.start = null;
    this._measurePoints.end = null;

    this._distanceMeasureChange.next(null); 

    this.resetSprites();
    this.resetLines();
  }  

  private initLines() {    
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution,
      0x2c8FFF, 2, this._toolZIndex, true), "l_dm_z");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0x8adb00, 2, this._toolZIndex, true), "l_dm_y");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0xFF3653, 2, this._toolZIndex, true), "l_dm_x");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0x0000FF, 4, this._toolZIndex), "l_dm_w");
  }

  private setLines(toZUp: boolean) {  
    const wStart = this._measurePoints.start;
    const wEnd = this._measurePoints.end;

    const distance = new Vector3().copy(wEnd).sub(wStart);

    const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
    const yEnd = toZUp
      ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
      : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);

    this.getHudElement("l_dm_z").set([yEnd, wEnd]);
    this.getHudElement("l_dm_y").set([xEnd, yEnd]);
    this.getHudElement("l_dm_x").set([wStart, xEnd]);
    this.getHudElement("l_dm_w").set([wStart, wEnd]);
  }

  private resetLines() {    
    this.getHudElement("l_dm_z").reset();
    this.getHudElement("l_dm_y").reset();
    this.getHudElement("l_dm_x").reset();
    this.getHudElement("l_dm_w").reset();
  }

  private initSprites() {     
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0x391285), 
      this._spriteSize, this._toolZIndex, this._cameraZIndex), "s_dm_start");
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0x00FFFF), 
      this._spriteSize, this._toolZIndex, this._cameraZIndex), "s_dm_end");
  }  
  
  private resetSprites() {   
    this.getHudElement("s_dm_start").reset(); 
    this.getHudElement("s_dm_end").reset(); 
  }
}
