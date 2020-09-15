import { Object3D, Box3, Vector3, PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export class CameraControls {
  private _camera: PerspectiveCamera;
  get camera(): PerspectiveCamera {
    return this._camera;
  }
  private _orbitControls: OrbitControls;

  constructor(rendererCanvas: HTMLCanvasElement, changeCallback: () => void) {
    const camera = new PerspectiveCamera(75, 1, 1, 10000);    
    const orbitControls = new OrbitControls(camera, rendererCanvas);
    orbitControls.addEventListener("change", changeCallback);
    camera.position.set (0, 1000, 1000);
    camera.lookAt (0, 0, 0);    
    orbitControls.update();

    this._camera = camera;
    this._orbitControls = orbitControls;
  }

  destroy() {
    this._orbitControls.dispose();
  }
    
  resize(width: number, height: number) {
    if (this._camera) {
      this._camera.aspect = width / height;
      this._camera.updateProjectionMatrix();
    }
  }
  
  focusCameraOnObjects(objects: Object3D[], offset = 1.2 ) { 
    if (!objects?.length) {
      return;
    }
    
    const box = new Box3();    
    for (const object of objects) {
      box.expandByObject(object);
    }      
    
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitHeightDistance = maxSize / (2 * Math.atan( Math.PI * this._camera.fov / 360 ));
    const fitWidthDistance = fitHeightDistance / this._camera.aspect;
    const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
    
    const direction = this._orbitControls.target.clone()
      .sub(this._camera.position)
      .normalize()
      .multiplyScalar(distance);

    this._orbitControls.maxDistance = Math.max(distance * 10, 10000);
    this._orbitControls.target.copy(center);
    
    this._camera.near = Math.min(distance / 100, 1);
    this._camera.far = Math.max(distance * 100, 10000);
    this._camera.updateProjectionMatrix();
    this._camera.position.copy(this._orbitControls.target).sub(direction);

    this._orbitControls.update();
  }  
}
