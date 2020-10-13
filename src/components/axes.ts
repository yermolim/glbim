import { Object3D, Sprite, Vector4, Camera, OrthographicCamera, 
  WebGLRenderer, Quaternion, Vector3, SpriteMaterial } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { MaterialBuilder } from "../helpers/material-builder";

export class Axes extends Object3D {
  private static readonly _toZUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), - Math.PI/2);

  private _camera: Camera;
  private _axisGeometry: LineGeometry;
  private _size = 96;
  private _viewportBak = new Vector4();  
  
  private _axisMaterials: LineMaterial[] = new Array(3);
  private _axisLabelMaterials: SpriteMaterial[] = new Array(6);

  private xAxis: Line2;
  private yAxis: Line2;
  private zAxis: Line2;

  private xLabel: Sprite;
  private yLabel: Sprite;
  private zLabel: Sprite;
  private xLabelN: Sprite;
  private yLabelN: Sprite;
  private zLabelN: Sprite;

  constructor() {
    super();

    this._camera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
    this._camera.position.set(0, 0, 2);

    this.buildAxes();
  }

  destroy() {
    this.destroyAxes();
  }

  render(mainCamera: Camera, renderer: WebGLRenderer) {
    this.quaternion.copy(mainCamera.quaternion).inverse();
    this.quaternion.multiply(Axes._toZUp);
    this.updateMatrixWorld();

    renderer.getViewport(this._viewportBak);
    
    renderer.autoClear = false;
    renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, 
      renderer.getContext().drawingBufferHeight - this._size, 
      this._size, this._size);
    renderer.render(this, this._camera);

    // restore renderer settings
    renderer.setViewport(this._viewportBak.x, this._viewportBak.y, this._viewportBak.z, this._viewportBak.w);
    renderer.autoClear = true;
  }

  private buildAxes() {
    this._axisMaterials[0] = MaterialBuilder.buildLineMaterial(0xFF3653, 0.02);
    this._axisMaterials[1] = MaterialBuilder.buildLineMaterial(0x8adb00, 0.02);
    this._axisMaterials[2] = MaterialBuilder.buildLineMaterial(0x2c8FFF, 0.02);

    this._axisLabelMaterials[0] = MaterialBuilder.buildAxisSpriteMaterial(64, 0xFF3653, "X");
    this._axisLabelMaterials[1] = MaterialBuilder.buildAxisSpriteMaterial(64, 0xA32235, "-X");
    this._axisLabelMaterials[2] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x8ADB00, "Y");
    this._axisLabelMaterials[3] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x588C00, "-Y");
    this._axisLabelMaterials[4] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x2C8FFF, "Z");
    this._axisLabelMaterials[5] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x1C5BA3, "-Z");

    this._axisGeometry = new LineGeometry();
    this._axisGeometry.setPositions([0, 0, 0, 0.8, 0, 0]);

    this.xAxis = new Line2(this._axisGeometry, this._axisMaterials[0]);
    this.yAxis = new Line2(this._axisGeometry, this._axisMaterials[1]);
    this.zAxis = new Line2(this._axisGeometry, this._axisMaterials[2]);

    this.yAxis.rotation.z = Math.PI / 2;
    this.zAxis.rotation.y = - Math.PI / 2;

    this.add(this.xAxis);
    this.add(this.yAxis);
    this.add(this.zAxis);
    
    this.xLabel = new Sprite(this._axisLabelMaterials[0]);
    this.xLabelN = new Sprite(this._axisLabelMaterials[1]);
    this.yLabel = new Sprite(this._axisLabelMaterials[2]);
    this.yLabelN = new Sprite(this._axisLabelMaterials[3]);
    this.zLabel = new Sprite(this._axisLabelMaterials[4]);
    this.zLabelN = new Sprite(this._axisLabelMaterials[5]);

    this.xLabel.position.x = 1;
    this.yLabel.position.y = 1;
    this.zLabel.position.z = 1;
    this.xLabelN.position.x = -1;
    this.yLabelN.position.y = -1;
    this.zLabelN.position.z = -1;
    this.xLabelN.scale.setScalar(0.8);
    this.yLabelN.scale.setScalar(0.8);
    this.zLabelN.scale.setScalar(0.8);

    this.add(this.xLabel);
    this.add(this.yLabel);
    this.add(this.zLabel);
    this.add(this.xLabelN);
    this.add(this.yLabelN);
    this.add(this.zLabelN);
  }

  private destroyAxes() {
    this._axisGeometry.dispose();    
    
    this._axisMaterials?.forEach(x => x.dispose());
    this._axisMaterials = null;

    this._axisLabelMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._axisLabelMaterials = null;
  }
}
