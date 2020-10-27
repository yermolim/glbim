import { Object3D, Box3, Vector3, Quaternion, Euler, PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { AxisName } from "../common-types";

export class CameraControls {
  private _camera: PerspectiveCamera;
  get camera(): PerspectiveCamera {
    return this._camera;
  }

  private _orbitControls: OrbitControls;
  private _focusBox = new Box3();

  // rotation
  private _rRadius = 0; // rotation radius (distance from camera to focus point)
  private _rPosFocus = new Vector3(); // focus point position (center of rotation)
  private _rPosRelCamTarget = new Vector3(); // camera target position relative to focus point position
  private _rPosRelCamTemp = new Vector3(); // camera intermediate position relative to focus point position
  // --//--
  private _rEuler = new Euler(); // target euler angles
  private _rQcfSource = new Quaternion(); // orientation from camera starting position to focus point
  private _rQcfTarget = new Quaternion(); // orientation from camera target position to focus point
  private _rQcfTemp = new Quaternion(); // orientation from camera intermediate position to focus point

  private _renderCb: () => void;

  constructor(container: HTMLElement, renderCallback: () => void) {
    this._renderCb = renderCallback;

    const camera = new PerspectiveCamera(75, 1, 1, 10000);  
    camera.position.set (0, 1000, 1000);
    camera.lookAt (0, 0, 0);    
      
    const orbitControls = new OrbitControls(camera, container);
    orbitControls.addEventListener("change", this._renderCb);
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

  rotateAroundAxis(axis: AxisName, animate: boolean, toZUp = true) {
    this.prepareForRotationAroundAxis(axis, toZUp);
    this.applyRotation(animate);
  }
  
  focusCameraOnObjects(objects: Object3D[], offset = 1.2) { 
    if (!objects?.length) {      
      if (!this._focusBox.isEmpty()) {
        this.focusCameraOnBox(this._focusBox, offset);
      }      
      return;
    }
    
    this._focusBox.makeEmpty();    
    for (const object of objects) {
      this._focusBox.expandByObject(object);
    }      

    this.focusCameraOnBox(this._focusBox, offset);
  }  

  private focusCameraOnBox(box: Box3, offset: number) {
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
    this._camera.position.copy(center).sub(direction);

    this._orbitControls.update();
  }

  private prepareForRotationAroundAxis(axis: AxisName, toZUp: boolean) {
    switch (axis) {
      case "x":
        this._rPosRelCamTarget.set(1, 0, 0);
        this._rEuler.set(0, Math.PI * 0.5, 0);
        break;
      case "y":
        if (toZUp) {          
          this._rPosRelCamTarget.set(0, 0, -1);
          this._rEuler.set(0, Math.PI, 0);
        } else {
          this._rPosRelCamTarget.set(0, 1, 0);
          this._rEuler.set(Math.PI * -0.5, 0, 0);
        }
        break;
      case "z":
        if (toZUp) {
          this._rPosRelCamTarget.set(0, 1, 0);
          this._rEuler.set(Math.PI * -0.5, 0, 0);
        } else {
          this._rPosRelCamTarget.set(0, 0, 1);
          this._rEuler.set(0, 0, 0);
        }
        break;
      case "-x":
        this._rPosRelCamTarget.set(-1, 0, 0);
        this._rEuler.set(0, Math.PI * -0.5, 0);
        break;
      case "-y":
        if (toZUp) {
          this._rPosRelCamTarget.set(0, 0, 1);
          this._rEuler.set(0, 0, 0);
        } else {
          this._rPosRelCamTarget.set(0, -1, 0);
          this._rEuler.set(Math.PI * 0.5, 0, 0);
        }
        break;
      case "-z":
        if (toZUp) {
          this._rPosRelCamTarget.set(0, -1, 0);
          this._rEuler.set(Math.PI * 0.5, 0, 0);
        } else {
          this._rPosRelCamTarget.set(0, 0, -1);
          this._rEuler.set(0, Math.PI, 0);
        }
        break;
      default:
        return;
    }

    this._rPosFocus.copy(this._orbitControls.target);
    this._rRadius = this._camera.position.distanceTo(this._rPosFocus);
    this._rPosRelCamTarget.multiplyScalar(this._rRadius);

    this._rQcfSource.copy(this._camera.quaternion);
    // this._rQcfTemp.copy(this._rQcfSource);
    this._rQcfTarget.setFromEuler(this._rEuler);
  }

  private applyRotation(animate: boolean) {    
    if (!animate) {
      this._camera.position.copy(this._rPosFocus).add(this._rPosRelCamTarget);
      this._orbitControls.target.copy(this._rPosFocus);
      this._orbitControls.update();
      this._renderCb();
    } else { 
      const rotationSpeed = 2 * Math.PI; // rad/sec
      const animationStart = performance.now(); // ms
      let timeDelta: number; // sec
      let step: number; // rad

      const renderRotationFrame = () => {
        // increment step
        timeDelta = (performance.now() - animationStart) / 1000;
        step = timeDelta * rotationSpeed || 0.01;  

        // get intermediate quaternion between source and target positions
        this._rQcfTemp.copy(this._rQcfSource).rotateTowards(this._rQcfTarget, step);    
        // get intermediate camera position relative to focus position 
        this._rPosRelCamTemp.set(0, 0, 1)
          .applyQuaternion(this._rQcfTemp)
          .multiplyScalar(this._rRadius);
  
        // move camera to intermediate position
        this._camera.position.copy(this._rPosFocus)
          .add(this._rPosRelCamTemp);

        // ensure that controls target point is same as the focus point
        this._orbitControls.target.copy(this._rPosFocus);
        // update controls to update camera quaternion (make camera look at the focus point)
        this._orbitControls.update();

        // render view
        this._renderCb();

        // repeat until intermediate quaternion won't be equal to the target one 
        if (this._rQcfTemp.angleTo(this._rQcfTarget)) {
          window.requestAnimationFrame(() => renderRotationFrame());
        }
      };
      renderRotationFrame();
    }
  }
}
