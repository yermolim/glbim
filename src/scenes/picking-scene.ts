import { Scene, Mesh, Color, Vector2, Vector3, PerspectiveCamera, Camera,
  WebGLRenderer, WebGLRenderTarget, MeshBasicMaterial, NoBlending, DoubleSide } from "three";

import { MeshBgBm, MeshBgSm, MeshBgAm } from "../common-types";
import { PointSnap } from "../components/point-snap";

export class PickingScene {
  private _scene: Scene;
  private _target: WebGLRenderTarget;
  private _pointSnap: PointSnap;

  private _lastPickingColor = 0;

  private _materials: MeshBasicMaterial[] = [];
  private _releasedMaterials: MeshBasicMaterial[] = [];

  private _pickingMeshById = new Map<string, MeshBgBm>();
  private _sourceMeshByPickingColor = new Map<string, MeshBgSm>();

  constructor() { 
    const scene = new Scene();
    scene.background = new Color(0);
    this._scene = scene;

    this._target = new WebGLRenderTarget(1, 1);
    this._pointSnap = new PointSnap();
  }

  destroy() {
    this._materials.forEach(x => x.dispose());
    this._materials = null;
    this._target.dispose();
    this._target = null;
  }
  
  add(sourceMesh: MeshBgSm) {
    const pickingMeshMaterial = this.getMaterial();
    const colorString = pickingMeshMaterial.color.getHex().toString(16);
    
    const pickingMesh = new Mesh(sourceMesh.geometry, pickingMeshMaterial);
    pickingMesh.userData.originalUuid = sourceMesh.uuid;
    pickingMesh.userData.color = colorString;
    pickingMesh.position.copy(sourceMesh.position);
    pickingMesh.rotation.copy(sourceMesh.rotation);
    pickingMesh.scale.copy(sourceMesh.scale);

    this._scene.add(pickingMesh);
    this._pickingMeshById.set(sourceMesh.uuid, pickingMesh);
    this._sourceMeshByPickingColor.set(colorString, sourceMesh);
  }

  remove(sourceMesh: MeshBgSm) {
    const pickingMesh = this._pickingMeshById.get(sourceMesh.uuid);
    if (pickingMesh) {
      this._scene.remove(pickingMesh);
      this._pickingMeshById.delete(sourceMesh.uuid);
      this._sourceMeshByPickingColor.delete(pickingMesh.userData.color);
      this.releaseMaterial(pickingMesh.material);
    }
  }

  getSourceMeshAt(camera: PerspectiveCamera, renderer: WebGLRenderer, 
    clientX: number, clientY: number): MeshBgSm { 
    const position = this.convertClientToCanvas(renderer, clientX, clientY);
    return this.getSourceMeshAtPosition(camera, renderer, position);
  }

  getSnapPointAt(camera: PerspectiveCamera, renderer: WebGLRenderer, 
    clientX: number, clientY: number): Vector3 {

    const position = this.convertClientToCanvas(renderer, clientX, clientY);
    const mesh = this.getSourceMeshAtPosition(camera, renderer, position);
    if (!mesh) {
      return null;
    }

    return this.getMeshSnapPointAtPosition(camera, renderer, position,
      this._pickingMeshById.get(mesh.uuid));
  }

  convertClientToCanvas(renderer: WebGLRenderer, 
    clientX: number, clientY: number): Vector2 {    
    const rect = renderer.domElement.getBoundingClientRect();
    const pixelRatio = renderer.getPixelRatio();
    const x = (clientX - rect.left) * (renderer.domElement.width / rect.width) * pixelRatio || 0;
    const y = (clientY - rect.top) * (renderer.domElement.height / rect.height) * pixelRatio || 0; 
    return new Vector2(x, y);
  }

  convertWorldToCanvas(camera: Camera, renderer: WebGLRenderer, 
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

  private getSourceMeshAtPosition(camera: PerspectiveCamera, 
    renderer: WebGLRenderer, position: Vector2): MeshBgSm {   
    const context = renderer.getContext();  
    
    // set renderer and camera to 1x1 view
    camera.setViewOffset(
      context.drawingBufferWidth,
      context.drawingBufferHeight,
      position.x, position.y, 1, 1);
    renderer.setRenderTarget(this._target);
    renderer.render(this._scene, camera);

    // reset changes made to renderer and camera
    renderer.setRenderTarget(null);
    camera.clearViewOffset(); 

    const pixelBuffer = new Uint8Array(4);
    renderer.readRenderTargetPixels(this._target, 0, 0, 1, 1, pixelBuffer); 
    // eslint-disable-next-line no-bitwise
    const hex = ((pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2])).toString(16);

    const mesh = this._sourceMeshByPickingColor.get(hex);
    return mesh;
  }

  private getMeshSnapPointAtPosition(camera: Camera, renderer: WebGLRenderer, 
    position: Vector2, mesh: MeshBgAm): Vector3 {
    const context = renderer.getContext();  
    
    const xNormalized = position.x / context.drawingBufferWidth * 2 - 1;
    const yNormalized = position.y / context.drawingBufferHeight * -2 + 1;
    const point = this._pointSnap.getPoint(camera, mesh, new Vector2(xNormalized, yNormalized));
    return point;
  }
  
  private nextPickingColor(): number {
    if (this._lastPickingColor === 16777215) {
      this._lastPickingColor = 0;
    }
    return ++this._lastPickingColor;
  }
  
  private getMaterial(): MeshBasicMaterial {
    if (this._releasedMaterials.length) {
      return this._releasedMaterials.pop();
    }  

    const color = new Color(this.nextPickingColor());
    const material = new MeshBasicMaterial({ 
      color: color, 
      flatShading: true,
      blending: NoBlending,
      side: DoubleSide,
    });
    this._materials.push(material);
    return material;
  }

  private releaseMaterial(material: MeshBasicMaterial) {
    this._releasedMaterials.push(material);
  }
}
