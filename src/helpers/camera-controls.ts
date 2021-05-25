import { Camera, MOUSE, TOUCH } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export class CameraControls extends OrbitControls {
  constructor(camera: Camera, domElement: HTMLElement) {
    super(camera, domElement);

    this.screenSpacePanning = false; // pan orthogonal to world-space direction camera.up

    this.mouseButtons.LEFT = null;
    this.mouseButtons.MIDDLE = MOUSE.ROTATE;
    this.mouseButtons.RIGHT = MOUSE.PAN;

    this.touches.ONE = TOUCH.ROTATE;
    this.touches.TWO = TOUCH.DOLLY_PAN;
  }
}
