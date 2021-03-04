import { Scene, Mesh, Color, Vector2, PerspectiveCamera,
  WebGLRenderer, WebGLRenderTarget, MeshBasicMaterial, NoBlending, DoubleSide } from "three";

import { MeshBgBm, MeshBgSm } from "../common-types";

export class PickingScene {
  private _scene: Scene;
  private _target: WebGLRenderTarget;

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
    pickingMesh.userData.sourceId = sourceMesh.userData.id;
    pickingMesh.userData.sourceUuid = sourceMesh.uuid;
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
    canvasPosition: Vector2): MeshBgSm { 
    return this.getSourceMeshAtPosition(camera, renderer, canvasPosition);
  }
  
  getPickingMeshAt(camera: PerspectiveCamera, renderer: WebGLRenderer, 
    canvasPosition: Vector2): MeshBgBm { 
    const sourceMesh = this.getSourceMeshAtPosition(camera, renderer, canvasPosition);
    return sourceMesh
      ? this._pickingMeshById.get(sourceMesh.uuid)
      : null;
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
