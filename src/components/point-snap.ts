import { Raycaster, Camera, Vector2, Vector3, Triangle, Face3, BufferAttribute } from "three";
import { MeshBgAm } from "../common-types";

export class PointSnap {
  raycaster: Raycaster;

  constructor() {
    this.raycaster = new Raycaster();
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
