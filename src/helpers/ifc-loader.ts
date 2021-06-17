import * as THREE from "three";
import * as IFC from "web-ifc";
   
export class IFCLoader extends THREE.Loader {
  private readonly _ifcAPI: IFC.IfcAPI;
 
  constructor(wasmPath: string)
  {
    super();

    this._ifcAPI = new IFC.IfcAPI();
    this._ifcAPI.SetWasmPath(wasmPath);
    this._ifcAPI.Init();
  }
  
  load(url: string,
    onLoad: (gltf: THREE.Object3D) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void) {

    const loader = new THREE.FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(url,
      async (buffer) => {
        try {
          const data = new Uint8Array(<any>buffer);
          const result = await this.loadModelAsync(data);
          onLoad(result);
        } catch (e) {
          console.log(e);
          if (onError) {
            onError(e);
          } else {
            console.error(e);
          }
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError,
    );
  }

  async loadModelAsync(data: Uint8Array): Promise<THREE.Object3D> {
    const root = new THREE.Group();

    const modelId = this._ifcAPI.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
    const ifcMeshes = this._ifcAPI.LoadAllGeometry(modelId);
    
    let lastBreakTime = performance.now();

    for (let i = 0; i < ifcMeshes.size(); i++) {
      if (performance.now() - lastBreakTime > 100) {
        // break on timeout every 100ms to keep UI responsive
        await new Promise<void>((resolve) => { 
          setTimeout(() => {
            resolve();
          }, 0);
        });
        lastBreakTime = performance.now();
      }
      
      const ifcMesh = ifcMeshes.get(i);  

      const lineAttrs = this._ifcAPI.GetLine(modelId, ifcMesh.expressID, false);
      const globalId = lineAttrs.GlobalId?.value;

      const ifcMeshGeometries = ifcMesh.geometries;
      for (let j = 0; j < ifcMeshGeometries.size(); j++) {
        const ifcMeshGeometry = ifcMeshGeometries.get(j);
        const threeMesh = this.convertIfcGeometryToThreeMesh(modelId, ifcMeshGeometry);
        threeMesh.name = globalId;
        root.add(threeMesh);
      }
    }
    this._ifcAPI.CloseModel(modelId);

    return root;
  }
     
  private convertIfcGeometryToThreeMesh(modelId: number, ifcMeshGeometry: IFC.PlacedGeometry) {
    const geometry = this._ifcAPI.GetGeometry(modelId, ifcMeshGeometry.geometryExpressID);
    const vertices = this._ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
    const indices = this._ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
    const bufferGeometry = this.buildThreeGeometry(vertices, indices);

    const material = this.buildMeshMaterial(ifcMeshGeometry.color);

    const mesh = new THREE.Mesh(bufferGeometry, material);
    const matrix = new THREE.Matrix4().fromArray(ifcMeshGeometry.flatTransformation.map(x => +x.toFixed(5)));
    mesh.matrix = matrix;
    mesh.matrixAutoUpdate = false;

    return mesh;
  }
     
  private buildMeshMaterial(ifcColor: IFC.Color): THREE.Material {
    const threeColor = new THREE.Color(ifcColor.x, ifcColor.y, ifcColor.z);
    const material = new THREE.MeshPhongMaterial({ color: threeColor, side: THREE.DoubleSide });
    material.transparent = ifcColor.w !== 1;
    if (material.transparent) {
      material.opacity = ifcColor.w;
    }
    return material;
  }
     
  private buildThreeGeometry(vertices: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const positionNormalBuffer = new THREE.InterleavedBuffer(vertices, 6);
    geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(positionNormalBuffer, 3, 0));
    geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(positionNormalBuffer, 3, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
  }
}
