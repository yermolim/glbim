import { Frustum, Line, Mesh, Object3D, 
  OrthographicCamera, PerspectiveCamera, 
  Points, Scene, Vector3 } from "three";

/**
 * Helper class for area selection
 * based on: https://github.com/mrdoob/three.js/blob/dev/examples/jsm/interactive/SelectionBox.js
 */
export class AreaSelector {
  private readonly _frustum = new Frustum();
  private readonly _depth = Number.MAX_VALUE;

  private readonly _tempPoint = new Vector3();
  private readonly _startPoint = new Vector3();
  private readonly _endPoint = new Vector3();  
  private readonly _centerPoint = new Vector3();
  
  private readonly _vecNear = new Vector3();

  private readonly _vecTopLeft = new Vector3();
  private readonly _vecTopRight = new Vector3();
  private readonly _vecDownRight = new Vector3();
  private readonly _vecDownLeft = new Vector3();
  
  private readonly _vecFarTopLeft = new Vector3();
  private readonly _vecFarTopRight = new Vector3();
  private readonly _vecFarDownRight = new Vector3();
  private readonly _vecFarDownLeft = new Vector3();
  
  private readonly _vectemp1 = new Vector3();
  private readonly _vectemp2 = new Vector3();
  private readonly _vectemp3 = new Vector3();

  constructor(depth?: number) {
    if (depth) {
      this._depth = depth;
    }
  }

  /**
   * get an array of objects inside the area
   * @param camera 
   * @param scene 
   * @param startPoint area start point (coords should be from -1 to 1, 
   * where -1,-1 - the canvas lower-left corner, 0,0 - the center, 1,1 - the top-right corner) 
   * @param endPoint area end point (coords should be from -1 to 1, 
   * where -1,-1 - the canvas lower-left corner, 0,0 - the center, 1,1 - the top-right corner) 
   * @returns an array of objects inside the area
   */
  select(camera: PerspectiveCamera | OrthographicCamera, scene: Scene, 
    startPoint?: Vector3, endPoint?: Vector3): Object3D[] {

    if (startPoint) {
      this._startPoint.copy(startPoint);
    }
    if (endPoint) {
      this._endPoint.copy(endPoint);
    }

    this.updateFrustum(camera, this._startPoint, this._endPoint);

    const result: Object3D[] = [];
    this.findObjectInFrustum(scene, result);

    return result;
  }

  private updateFrustum(camera: PerspectiveCamera | OrthographicCamera,
    startPoint: Vector3, endPoint: Vector3) {
      
    if (startPoint.x === endPoint.x) {
      endPoint.x += Number.EPSILON;
    }
    if (startPoint.y === endPoint.y) {
      endPoint.y += Number.EPSILON;
    }

    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    if (camera instanceof PerspectiveCamera) {
      this._tempPoint.copy(startPoint);
      this._tempPoint.x = Math.min(startPoint.x, endPoint.x);
      this._tempPoint.y = Math.max(startPoint.y, endPoint.y);
      endPoint.x = Math.max(startPoint.x, endPoint.x);
      endPoint.y = Math.min(startPoint.y, endPoint.y);

      this._vecNear.setFromMatrixPosition(camera.matrixWorld);

      this._vecTopLeft.copy(this._tempPoint);
      this._vecTopRight.set(endPoint.x, this._tempPoint.y, 0);
      this._vecDownRight.copy(endPoint);
      this._vecDownLeft.set(this._tempPoint.x, endPoint.y, 0);

      this._vecTopLeft.unproject(camera);
      this._vecTopRight.unproject(camera);
      this._vecDownRight.unproject(camera);
      this._vecDownLeft.unproject(camera);

      this._vectemp1.copy(this._vecTopLeft).sub(this._vecNear);
      this._vectemp2.copy(this._vecTopRight).sub(this._vecNear);
      this._vectemp3.copy(this._vecDownRight).sub(this._vecNear);
      this._vectemp1.normalize();
      this._vectemp2.normalize();
      this._vectemp3.normalize();

      this._vectemp1.multiplyScalar(this._depth);
      this._vectemp2.multiplyScalar(this._depth);
      this._vectemp3.multiplyScalar(this._depth);
      this._vectemp1.add(this._vecNear);
      this._vectemp2.add(this._vecNear);
      this._vectemp3.add(this._vecNear);

      const planes = this._frustum.planes;

      planes[ 0 ].setFromCoplanarPoints(this._vecNear, this._vecTopLeft, this._vecTopRight);
      planes[ 1 ].setFromCoplanarPoints(this._vecNear, this._vecTopRight, this._vecDownRight);
      planes[ 2 ].setFromCoplanarPoints(this._vecDownRight, this._vecDownLeft, this._vecNear);
      planes[ 3 ].setFromCoplanarPoints(this._vecDownLeft, this._vecTopLeft, this._vecNear);
      planes[ 4 ].setFromCoplanarPoints(this._vecTopRight, this._vecDownRight, this._vecDownLeft);
      planes[ 5 ].setFromCoplanarPoints(this._vectemp3, this._vectemp2, this._vectemp1);
      planes[ 5 ].normal.multiplyScalar(- 1);

    } else if (camera instanceof OrthographicCamera) {
      const left = Math.min(startPoint.x, endPoint.x);
      const top = Math.max(startPoint.y, endPoint.y);
      const right = Math.max(startPoint.x, endPoint.x);
      const down = Math.min(startPoint.y, endPoint.y);

      this._vecTopLeft.set(left, top, - 1);
      this._vecTopRight.set(right, top, - 1);
      this._vecDownRight.set(right, down, - 1);
      this._vecDownLeft.set(left, down, - 1);

      this._vecFarTopLeft.set(left, top, 1);
      this._vecFarTopRight.set(right, top, 1);
      this._vecFarDownRight.set(right, down, 1);
      this._vecFarDownLeft.set(left, down, 1);

      this._vecTopLeft.unproject(camera);
      this._vecTopRight.unproject(camera);
      this._vecDownRight.unproject(camera);
      this._vecDownLeft.unproject(camera);

      this._vecFarTopLeft.unproject(camera);
      this._vecFarTopRight.unproject(camera);
      this._vecFarDownRight.unproject(camera);
      this._vecFarDownLeft.unproject(camera);

      const planes = this._frustum.planes;

      planes[ 0 ].setFromCoplanarPoints(this._vecTopLeft, this._vecFarTopLeft, this._vecFarTopRight);
      planes[ 1 ].setFromCoplanarPoints(this._vecTopRight, this._vecFarTopRight, this._vecFarDownRight);
      planes[ 2 ].setFromCoplanarPoints(this._vecFarDownRight, this._vecFarDownLeft, this._vecDownLeft);
      planes[ 3 ].setFromCoplanarPoints(this._vecFarDownLeft, this._vecFarTopLeft, this._vecTopLeft);
      planes[ 4 ].setFromCoplanarPoints(this._vecTopRight, this._vecDownRight, this._vecDownLeft);
      planes[ 5 ].setFromCoplanarPoints(this._vecFarDownRight, this._vecFarTopRight, this._vecFarTopLeft);
      planes[ 5 ].normal.multiplyScalar(- 1);
    }
  }

  private findObjectInFrustum(object: Object3D, targetArray: Object3D[]) {
    if (object instanceof Mesh || object instanceof Line || object instanceof Points) {
      if (object.material !== undefined) {
        if (object.geometry.boundingSphere === null) {
          object.geometry.computeBoundingSphere();
        }

        this._centerPoint.copy(object.geometry.boundingSphere.center);
        this._centerPoint.applyMatrix4(object.matrixWorld);

        if (this._frustum.containsPoint(this._centerPoint)) {
          targetArray.push(object);
        }
      }
    }

    if (object.children.length > 0) {
      for (let x = 0; x < object.children.length; x ++) {
        this.findObjectInFrustum(object.children[x], targetArray);
      }
    }
  }
}
