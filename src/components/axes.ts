import { Object3D, Sprite, Vector4, Camera, OrthographicCamera, 
  BufferGeometry, BoxBufferGeometry, WebGLRenderer, Mesh, Quaternion, Vector3 } from "three";
import { Materials } from "./materials";
import { MeshBgBm } from "../common-types";

export class Axes extends Object3D {
  private static readonly _toZUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), - Math.PI/2);

  private _camera: Camera;
  private _axisGeometry: BufferGeometry;
  private _size = 96;
  private _viewportBak = new Vector4();

  private xAxis: MeshBgBm;
  private yAxis: MeshBgBm;
  private zAxis: MeshBgBm;

  private xLabel: Sprite;
  private yLabel: Sprite;
  private zLabel: Sprite;
  private xLabelN: Sprite;
  private yLabelN: Sprite;
  private zLabelN: Sprite;

  constructor(materials: Materials) {
    super();

    this._camera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
    this._camera.position.set(0, 0, 2);

    this._axisGeometry = new BoxBufferGeometry(0.8, 0.05, 0.05).translate(0.4, 0, 0);
    this.buildAxes(materials);
  }

  destroy() {
    this._axisGeometry.dispose();
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

  private buildAxes(materials: Materials) {
    this.xAxis = new Mesh(this._axisGeometry, materials.axisMaterials[0]);
    this.yAxis = new Mesh(this._axisGeometry, materials.axisMaterials[1]);
    this.zAxis = new Mesh(this._axisGeometry, materials.axisMaterials[2]);

    this.yAxis.rotation.z = Math.PI / 2;
    this.zAxis.rotation.y = - Math.PI / 2;

    this.add(this.xAxis);
    this.add(this.yAxis);
    this.add(this.zAxis);
    
    this.xLabel = new Sprite(materials.axisLabelMaterials[0]);
    this.xLabelN = new Sprite(materials.axisLabelMaterials[1]);
    this.yLabel = new Sprite(materials.axisLabelMaterials[2]);
    this.yLabelN = new Sprite(materials.axisLabelMaterials[3]);
    this.zLabel = new Sprite(materials.axisLabelMaterials[4]);
    this.zLabelN = new Sprite(materials.axisLabelMaterials[5]);

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
}
