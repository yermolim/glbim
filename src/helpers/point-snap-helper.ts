import { Raycaster, Camera, WebGLRenderer, BufferAttribute,
  Vector2, Vector3, Face3, Triangle } from "three";
import { MeshBgAm } from "../common-types";

export class PointSnapHelper {
  raycaster: Raycaster;

  constructor() {
    this.raycaster = new Raycaster();
  }  
  
  static convertClientToCanvas(renderer: WebGLRenderer, 
    clientX: number, clientY: number): Vector2 {    
    const rect = renderer.domElement.getBoundingClientRect();
    const pixelRatio = renderer.getPixelRatio();
    const x = (clientX - rect.left) * (renderer.domElement.width / rect.width) * pixelRatio || 0;
    const y = (clientY - rect.top) * (renderer.domElement.height / rect.height) * pixelRatio || 0; 
    return new Vector2(x, y);
  }

  static convertWorldToCanvas(camera: Camera, renderer: WebGLRenderer, 
    point: Vector3): Vector2 {
    const nPoint = new Vector3().copy(point).project(camera);
    if (nPoint.x > 1 || nPoint.y < -1 || nPoint.y > 1 || nPoint.y < -1) {
      // point is outside of canvas space, return null
      return null;
    }
    
    const rect = renderer.domElement.getBoundingClientRect();
    const canvasWidth = renderer.domElement.width / (renderer.domElement.width / rect.width) || 0;
    const canvasHeight = renderer.domElement.height / (renderer.domElement.height / rect.height) || 0;
    const x = (nPoint.x + 1) * canvasWidth / 2;
    const y = (nPoint.y - 1) * canvasHeight / -2;
    return new Vector2(x, y);
  }

  destroy() {    
  }

  getPoint(camera: Camera, mesh: MeshBgAm, mousePoint: Vector2): Vector3 {
    this.raycaster.setFromCamera(mousePoint, camera);
    const intersection = this.raycaster.intersectObject(mesh)[0];
    if (!intersection) {
      return null;
    }

    const intersectionPoint = new Vector3().copy(intersection.point);
    intersection.object.worldToLocal(intersectionPoint);

    const snapPoint = new Vector3().copy(this.getNearestVertex(mesh, intersectionPoint, intersection.face));
    if (!snapPoint) {
      return null;
    }
    
    intersection.object.localToWorld(snapPoint);    
    return snapPoint;
  }

  private getNearestVertex(mesh: MeshBgAm, point: Vector3, face: Face3): Vector3 {
    const a = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.a);
    const b = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.b);
    const c = new Vector3().fromBufferAttribute(<BufferAttribute>mesh.geometry.attributes.position, face.c);
    const baryPoint = new Vector3();
    new Triangle(a, b, c).getBarycoord(point, baryPoint);

    if (baryPoint.x > baryPoint.y && baryPoint.x > baryPoint.z) {
      return a;
    } else if (baryPoint.y > baryPoint.x && baryPoint.y > baryPoint.z) {
      return b;
    } else if (baryPoint.z > baryPoint.x && baryPoint.z > baryPoint.y) {
      return c;
    } else {
      return null;
    }
  }
}
