import { Light, Scene, Mesh, Box3, Matrix4, Vector3, BufferGeometry, BufferAttribute,
  Uint32BufferAttribute, Float32BufferAttribute, BoxBufferGeometry, MeshPhongMaterial } from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull";

import { MeshBgSm, FastRenderType } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";

export class SimplifiedScene {
  private readonly _boxIndices = [ 
    0, 1, 3, 
    3, 1, 2,
    1, 5, 2,
    2, 5, 6,
    5, 4, 6,
    6, 4, 7,
    4, 0, 7,
    7, 0, 3,
    3, 2, 7,
    7, 2, 6,
    4, 5, 0,
    0, 5, 1,
  ];

  private _simpleMaterial: MeshPhongMaterial;

  private _scene: Scene;
  private _geometries: BufferGeometry[] = [];
    
  get scene(): Scene {
    return this._scene;
  }    
  get geometries(): BufferGeometry[] {
    return this._geometries;
  }

  constructor() {
    this._simpleMaterial = MaterialBuilder.buildPhongMaterial();
  }

  destroy() {
    this._geometries?.forEach(x => x.dispose());
    this._geometries = null;
    this._scene = null;    

    this._simpleMaterial.dispose();
    this._simpleMaterial = null;
  }

  clearScene() {    
    this._scene = null;
  }
    
  async updateSceneAsync(lights: Light[], meshes: MeshBgSm[],
    fastRenderType: FastRenderType): Promise<void> {
    this._scene = null;
    const scene = new Scene(); 
    scene.add(...lights);    

    this._geometries.forEach(x => x.dispose());
    this._geometries.length = 0;
    
    let geometry: BufferGeometry;
    switch (fastRenderType) {
      case "ch":
        geometry = await this.buildHullGeometryAsync(meshes);
        break;
      case "aabb":
        geometry = await this.buildBoxGeometryAsync(meshes);
        break;
      case "ombb":
      default:
        throw new Error("Render type not implemented");
    }
    if (geometry) {
      this._geometries.push(geometry);
    }

    this._geometries.forEach(x => {    
      const mesh = new Mesh(x, this._simpleMaterial);
      scene.add(mesh);
    });

    this._scene = scene;
  }  

  updateSceneMaterials() {
    this._simpleMaterial.needsUpdate = true;
  }

  private async buildHullGeometryAsync(meshes: MeshBgSm[]): Promise<BufferGeometry> {    
    if (!meshes?.length) {
      return null;
    }

    const hullPoints: Vector3[] = [];
    // splitting into chunks to UI remain responsible
    const hullChunkSize = 100;
    const hullChunk = (chunk: MeshBgSm[]) => {    
      chunk.forEach(x => {        
        const hull = new ConvexHull().setFromObject(x);
        hull.faces.forEach(f => {
          let edge = f.edge;
          do {
            hullPoints.push(edge.head().point);
            edge = edge.next;
          } while (edge !== f.edge);
        });
      });
    };
    for (let i = 0; i < meshes.length; i += hullChunkSize) {
      await new Promise((resolve) => { 
        setTimeout(() => {
          hullChunk(meshes.slice(i, i + hullChunkSize));
          resolve();
        }, 0);
      });
    }
    
    const indexArray = new Uint32Array(hullPoints.length);
    let currentIndex = 0;
    const indexByKey = new Map<string, number>();
    const uniquePoints: Vector3[] = [];
    hullPoints.forEach((x, i) => {
      const key = `${x.x}|${x.y}|${x.z}`;
      if (!indexByKey.has(key)) {
        indexArray[i] = currentIndex;
        indexByKey.set(key, currentIndex++);
        uniquePoints.push(x);
      } else {
        indexArray[i] = indexByKey.get(key);
      }
    });
    const positionArray = new Float32Array(uniquePoints.length * 3);
    let currentPosition = 0;
    uniquePoints.forEach(x => {
      positionArray[currentPosition++] = x.x;
      positionArray[currentPosition++] = x.y;
      positionArray[currentPosition++] = x.z;
    });
    
    const positionBuffer = new Float32BufferAttribute(positionArray, 3);
    const indexBuffer = new Uint32BufferAttribute(indexArray, 1);

    const outputGeometry = new BufferGeometry();
    outputGeometry.setAttribute("position", positionBuffer); 
    outputGeometry.setIndex(indexBuffer);
    
    return outputGeometry;
  }
  
  private async buildBoxGeometryAsync(meshes: MeshBgSm[]): Promise<BufferGeometry> {
    if (!meshes?.length) {
      return null;
    }

    const positionArray = new Float32Array(meshes.length * 8 * 3);
    const indexArray = new Uint32Array(meshes.length * 12 * 3);
    
    let positionsOffset = 0; 
    let indicesOffset = 0;
    // splitting into chunks to UI remain responsible
    const chunkSize = 100;
    const processChunk = (chunk: MeshBgSm[]) => {    
      chunk.forEach(x => {
        const boxPositions = this.getMeshBoxPositions(x);
        const indexPositionOffset = positionsOffset / 3;
        for (let i = 0; i < boxPositions.length; i++) {
          positionArray[positionsOffset++] = boxPositions[i];
        }
        this._boxIndices.forEach(i => indexArray[indicesOffset++] = indexPositionOffset + i);
      });
    };

    for (let i = 0; i < meshes.length; i += chunkSize) {
      await new Promise((resolve) => { 
        setTimeout(() => {
          processChunk(meshes.slice(i, i + chunkSize));
          resolve();
        }, 0);
      });
    }
    
    const positionBuffer = new Float32BufferAttribute(positionArray, 3);
    const indexBuffer = new Uint32BufferAttribute(indexArray, 1);

    const outputGeometry = new BufferGeometry();
    outputGeometry.setAttribute("position", positionBuffer); 
    outputGeometry.setIndex(indexBuffer);
    
    return outputGeometry;
  }  

  private getMeshBoxPositions(mesh: MeshBgSm): ArrayLike<number> {    
    const box = new Box3().setFromBufferAttribute(<BufferAttribute>mesh.geometry.getAttribute("position"));
    const boxPositionArray = new Float32Array(24);
        
    boxPositionArray[0] = box.min.x;
    boxPositionArray[1] = box.min.y;
    boxPositionArray[2] = box.max.z;
    
    boxPositionArray[3] = box.max.x;
    boxPositionArray[4] = box.min.y;
    boxPositionArray[5] = box.max.z;

    boxPositionArray[6] = box.max.x;
    boxPositionArray[7] = box.max.y;
    boxPositionArray[8] = box.max.z;
    
    boxPositionArray[9] = box.min.x;
    boxPositionArray[10] = box.max.y;
    boxPositionArray[11] = box.max.z;

    boxPositionArray[12] = box.min.x;
    boxPositionArray[13] = box.min.y;
    boxPositionArray[14] = box.min.z;
    
    boxPositionArray[15] = box.max.x;
    boxPositionArray[16] = box.min.y;
    boxPositionArray[17] = box.min.z;

    boxPositionArray[18] = box.max.x;
    boxPositionArray[19] = box.max.y;
    boxPositionArray[20] = box.min.z;
    
    boxPositionArray[21] = box.min.x;
    boxPositionArray[22] = box.max.y;
    boxPositionArray[23] = box.min.z;

    const boxPosition = new Float32BufferAttribute(boxPositionArray, 3).applyMatrix4(mesh.matrix).array;
    return boxPosition;
  }
}
