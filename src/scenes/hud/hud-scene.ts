/* eslint-disable @typescript-eslint/no-use-before-define */
import { Scene, Vector2, Vector3, Matrix4,
  Camera, OrthographicCamera, WebGLRenderer } from "three";

import { HudPointSnap } from "./tools/hud-point-snap";
import { HudDistanceMeasurer } from "./tools/hud-distance-measurer";
import { HudMarkers } from "./tools/hud-markers";

export class HudScene {
  private readonly _cameraZ = 10;

  private _scene = new Scene();
  private _camera: OrthographicCamera;  

  private _hudResolution = new Vector2();
  private _hudScale = new Matrix4();
  private _hudProjectionMatrix  = new Matrix4();

  private _pointSnap: HudPointSnap;
  get pointSnap(): HudPointSnap {
    return this._pointSnap;
  }

  private _distanceMeasurer: HudDistanceMeasurer;
  get distanceMeasurer(): HudDistanceMeasurer {
    return this._distanceMeasurer;
  }

  private _markers: HudMarkers;
  get markers(): HudMarkers {
    return this._markers;
  }

  constructor() { 
    this._pointSnap = new HudPointSnap(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 9, this._cameraZ, 8);
    this._distanceMeasurer = new HudDistanceMeasurer(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 8, this._cameraZ, 8);
    this._markers = new HudMarkers(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 1, this._cameraZ, 24);
  }

  destroy() {
    this._pointSnap.destroy();
    this._pointSnap = null;

    this._distanceMeasurer.destroy();
    this._distanceMeasurer = null;

    this._markers.destroy();
    this._markers = null;

    this._scene = null;
  }

  render(mainCamera: Camera, renderer: WebGLRenderer) {
    const ctx = renderer.getContext();

    this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);  
    this.updateHudProjectionMatrix(mainCamera);

    this._distanceMeasurer.update();
    
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this._scene, this._camera);

    // restore renderer settings
    renderer.autoClear = true;
  }

  private updateResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (rendererBufferWidth === this._hudResolution.x
      && rendererBufferHeight === this._hudResolution.y) {
      return;
    }

    this._hudResolution.set(rendererBufferWidth, rendererBufferHeight);
    this.updateCameraResolution();
  }

  private updateCameraResolution() {
    if (!this._camera) {
      this._camera = new OrthographicCamera(this._hudResolution.x / -2, this._hudResolution.x / 2,
        this._hudResolution.y / 2, this._hudResolution.y / -2, 1, 10);
      this._camera.position.setZ(this._cameraZ);
    } else {
      this._camera.left = this._hudResolution.x / -2;
      this._camera.right = this._hudResolution.x / 2;
      this._camera.top = this._hudResolution.y / 2;
      this._camera.bottom = this._hudResolution.y / -2;
      this._camera.updateProjectionMatrix();
    }
  }

  private updateHudProjectionMatrix(camera: Camera) { 
    this._hudScale.makeScale(this._hudResolution.x / 2, this._hudResolution.y / 2, 1);
    this._hudProjectionMatrix.copy(this._hudScale)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
  }

  private projectToHud = (point: Vector3) => {
    point.applyMatrix4(this._hudProjectionMatrix);
    if (point.z > 1) {
      point.x = - point.x;
      point.y = - point.y;
    }
  };
}
