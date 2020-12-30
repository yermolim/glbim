import { Subject } from "rxjs";
import { Scene, Vector2, Matrix4 } from "three";
import { HudElement } from "../elements/hud-element";

export class HudTool {
  protected _hudResolution = new Vector2();
  protected _hudProjectionMatrix  = new Matrix4();
  protected _hudScene: Scene;

  protected _toolZIndex: number;
  protected _cameraZIndex: number;

  protected _subjects: Subject<any>[] = [];

  private _hudElements = new Map<string, HudElement>();


  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4,
    toolZIndex: number, cameraZIndex: number) { 
    this._hudScene = hudScene;
    this._hudResolution = hudResolution;
    this._hudProjectionMatrix = hudProjectionMatrix;

    this._toolZIndex = toolZIndex;
    this._cameraZIndex = cameraZIndex;
  }

  destroy() {
    this.destroyHudElements();
    this._subjects.forEach(x => x.complete());
  }

  update() {
    this._hudElements.forEach(x => x.update());
  }

  protected getHudElement(key: string) {
    return this._hudElements.get(key);
  }
  
  protected addHudElement(element: HudElement, key: string) {
    if (!element?.object3d) {
      return;
    }
    if (this._hudElements.has(key)) {
      this.removeHudElement(key);
    }
    this._hudElements.set(key, element);
    this._hudScene.add(element.object3d);
  }
    
  protected removeHudElement(key: string) {
    const element = this._hudElements.get(key);
    if (element) {
      this._hudScene.remove(element.object3d);
      element.destroy();
      this._hudElements.delete(key);
    }
  }
      
  protected clearHudElements() {
    this._hudElements.forEach(v => {
      this._hudScene.remove(v.object3d);
      v.destroy();
    });
    this._hudElements.clear();
  }

  private destroyHudElements() {    
    this._hudElements.forEach(v => {
      this._hudScene.remove(v.object3d);
      v.destroy();
    });
    this._hudElements = null;
  }
}
