import { Object3D, Sprite, Vector2, Vector3, Vector4, Quaternion, Color,
  SpriteMaterial, WebGLRenderer, Camera, OrthographicCamera, Raycaster } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { MaterialBuilder } from "../helpers/material-builder";
import { CanvasTextureBuilder } from "../helpers/canvas-texture-builder";
import { CornerName, AxisName } from "../common-types";

export class Axes extends Object3D {
  private static readonly _toZUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), - Math.PI/2);

  private _enabled: boolean;
  private _size: number;
  private _placement: CornerName;

  private _raycaster: Raycaster;
  private _camera: Camera;

  private _container: HTMLElement;
  private _div: HTMLDivElement;
  private _clickPoint = new Vector2();

  private _axisGeometry: LineGeometry; 
  private _axisMaterials: LineMaterial[] = new Array(3);
  private _axisLabelMaterials: SpriteMaterial[] = new Array(6);

  private _axes: Line2[] = new Array(3);
  private _labels: Sprite[] = new Array(6);  
  
  private _viewportBak = new Vector4();

  private _axisCLickedCallback: (axis: AxisName) => any;

  get size(): number {
    return this._size;
  }

  set size(value: number) {
    this.updateOptions(this.enabled, this._placement, value);
  }
  
  get placement(): CornerName {
    return this._placement;
  }

  set placement(value: CornerName) {
    this.updateOptions(this.enabled, value, this._size);
  }
    
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this.updateOptions(value, this._placement, this._size);
  }

  constructor(container: HTMLElement, axisClickedCallback: (axis: AxisName) => any,
    enabled = true, placement: CornerName = "top-right", size = 128) {
    super();

    this._raycaster = new Raycaster();
    this._camera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
    this._camera.position.set(0, 0, 2);

    this._container = container;
    this._axisCLickedCallback = axisClickedCallback;

    this.initAxes();
    this.updateOptions(enabled, placement, size);
  }

  updateOptions(enabled: boolean, placement: CornerName, size: number) {    
    this._enabled = enabled;
    this._size = size;
    this._placement = placement;
    this.initDiv();
  }

  destroy() {
    this.destroyDiv();
    this.destroyAxes();
  }

  render(mainCamera: Camera, renderer: WebGLRenderer, toZUp = true) {
    if (!this.enabled) {
      return;
    }

    this.quaternion.copy(mainCamera.quaternion).inverse();
    if (toZUp) {
      this.quaternion.multiply(Axes._toZUp);
    }
    this.updateMatrixWorld();

    renderer.getViewport(this._viewportBak);
    
    renderer.autoClear = false;
    renderer.clearDepth();
    switch(this._placement) {
      case "top-left":
        renderer.setViewport(0, renderer.getContext().drawingBufferHeight - this._size, 
          this._size, this._size);
        break;
      case "top-right":
        renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, 
          renderer.getContext().drawingBufferHeight - this._size, 
          this._size, this._size);
        break;
      case "bottom-left":
        renderer.setViewport(0, 0, this._size, this._size);
        break;
      case "bottom-right":
        renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, 0, 
          this._size, this._size);
        break;
    }
    renderer.render(this, this._camera);

    // restore renderer settings
    renderer.setViewport(this._viewportBak.x, this._viewportBak.y, this._viewportBak.z, this._viewportBak.w);
    renderer.autoClear = true;
  }

  private initAxes() {
    this._axisMaterials[0] = MaterialBuilder.buildLineMaterial(0xFF3653, 0.02, false);
    this._axisMaterials[1] = MaterialBuilder.buildLineMaterial(0x8adb00, 0.02, false);
    this._axisMaterials[2] = MaterialBuilder.buildLineMaterial(0x2c8FFF, 0.02, false);

    this._axisLabelMaterials[0] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0xFF3653, "X"));
    this._axisLabelMaterials[1] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0xA32235, "-X"));
    this._axisLabelMaterials[2] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x8ADB00, "Y"));
    this._axisLabelMaterials[3] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x588C00, "-Y"));
    this._axisLabelMaterials[4] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x2C8FFF, "Z"));
    this._axisLabelMaterials[5] = MaterialBuilder
      .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x1C5BA3, "-Z"));

    this._axisGeometry = new LineGeometry();
    this._axisGeometry.setPositions([0, 0, 0, 0.8, 0, 0]);

    const xAxis = new Line2(this._axisGeometry, this._axisMaterials[0]);
    const yAxis = new Line2(this._axisGeometry, this._axisMaterials[1]);
    const zAxis = new Line2(this._axisGeometry, this._axisMaterials[2]);

    yAxis.rotation.z = Math.PI / 2;
    zAxis.rotation.y = - Math.PI / 2;

    this.add(xAxis);
    this.add(yAxis);
    this.add(zAxis);

    this._axes[0] = xAxis;
    this._axes[1] = yAxis;
    this._axes[2] = zAxis;
    
    const xLabel = new Sprite(this._axisLabelMaterials[0]);
    const yLabel = new Sprite(this._axisLabelMaterials[2]);
    const zLabel = new Sprite(this._axisLabelMaterials[4]);
    const xLabelN = new Sprite(this._axisLabelMaterials[1]);
    const yLabelN = new Sprite(this._axisLabelMaterials[3]);
    const zLabelN = new Sprite(this._axisLabelMaterials[5]);

    xLabel.userData.axis = "x";
    yLabel.userData.axis = "y";
    zLabel.userData.axis = "z";
    xLabelN.userData.axis = "-x";
    yLabelN.userData.axis = "-y";
    zLabelN.userData.axis = "-z";

    xLabel.position.x = 1;
    yLabel.position.y = 1;
    zLabel.position.z = 1;
    xLabelN.position.x = -1;
    yLabelN.position.y = -1;
    zLabelN.position.z = -1;
    xLabelN.scale.setScalar(0.8);
    yLabelN.scale.setScalar(0.8);
    zLabelN.scale.setScalar(0.8);

    this.add(xLabel);
    this.add(yLabel);
    this.add(zLabel);
    this.add(xLabelN);
    this.add(yLabelN);
    this.add(zLabelN);

    this._labels[0] = xLabel;
    this._labels[1] = yLabel;
    this._labels[2] = zLabel;
    this._labels[3] = xLabelN;
    this._labels[4] = yLabelN;
    this._labels[5] = zLabelN;
  }

  private destroyAxes() {
    this._axisGeometry.dispose();    
    
    this._axisMaterials?.forEach(x => x.dispose());
    this._axisMaterials = null;

    this._axisLabelMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._axisLabelMaterials = null;
  }

  private initDiv() {
    this.destroyDiv();

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.height = this._size + "px";
    div.style.width = this._size + "px";
    switch(this._placement) {      
      case "top-left":
        div.style.top = 0 + "px";
        div.style.left = 0 + "px";
        break;
      case "top-right":
        div.style.top = 0 + "px";
        div.style.right = 0 + "px";
        break;
      case "bottom-left":
        div.style.bottom = 0 + "px";
        div.style.left = 0 + "px";
        break;
      case "bottom-right":
        div.style.bottom = 0 + "px";
        div.style.right = 0 + "px";
        break;
    }
    div.addEventListener("pointerup", this.onDivPointerUp);

    this._container.append(div);
    this._div = div;
  }

  private destroyDiv() {
    if (this._div) {
      this._div.removeEventListener("pointerup", this.onDivPointerUp);
      this._div.remove();
      this._div = null;
    }
  }

  private getIntersectionLabel(): Object3D {    
    this._raycaster.setFromCamera(this._clickPoint, this._camera);
    const intersection = this._raycaster.intersectObjects(this._labels)[0];
    if (!intersection) {
      return null;
    } else {
      return intersection.object;
    }
  }

  private onDivPointerUp = (e: PointerEvent) => { 
    if (!this.enabled) {
      return;
    }    
    
    const { clientX, clientY } = e;
    const { left, top, width, height } = this._div.getBoundingClientRect();

    this._clickPoint.set(
      (clientX - left - width / 2) / (width / 2),
      -(clientY - top - height / 2) / (height / 2),
    );

    const label = this.getIntersectionLabel();

    if (label) {
      const axis: AxisName = label.userData.axis;
      if (this._axisCLickedCallback) {
        this._axisCLickedCallback(axis);
      }
    };
  };
}
