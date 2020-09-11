import { Observable, Subscription, Subject, BehaviorSubject, AsyncSubject, from } from "rxjs";

import { WebGLRenderer, NoToneMapping, sRGBEncoding, WebGLRenderTarget,
  Object3D, Scene, Group, Mesh, Box3, Matrix4, Vector3, Color, PerspectiveCamera, 
  Light, AmbientLight, HemisphereLight, DirectionalLight,
  MeshPhysicalMaterial, MeshStandardMaterial,
  DoubleSide, NormalBlending, NoBlending,
  BufferGeometry, Uint32BufferAttribute, Float32BufferAttribute } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { ResizeSensor } from "css-element-queries";
import { first, throwIfEmpty } from "rxjs/operators";

// #region interfaces
export interface ModelFileInfo {
  url: string; 
  guid: string; 
  name: string;
}

export interface ModelLoadedInfo {
  url: string; 
  guid: string; 
  error?: Error;
}

export interface ModelLoadingInfo {
  url: string; 
  guid: string; 
  progress: number;
}

export interface ModelOpenedInfo {
  guid: string; 
  name: string; 
  handles: Set<string>;
}

export interface ColoringInfo {
  color: number; 
  opacity: number;
  ids: string[];
}

interface ModelGeometryInfo {
  name: string;
  meshes: MeshBgSm[]; 
  handles: Set<string>; 
}

interface RenderGeometry {  
  geometry: BufferGeometry;
  positions: Float32BufferAttribute;
  colors: Float32BufferAttribute;
  rmos: Float32BufferAttribute;
  indices: Uint32BufferAttribute;
  indicesBySourceMesh: Map<MeshBgSm, Uint32Array>;
}

interface MeshRenderInfo {
  renderGeometry: RenderGeometry;
  indices: Uint32Array;
}

// #endregion

// #region types
export type MeshRenderType = "single" | "one_per_model" | "per_model" | "per_mesh";

type MeshBgSm = Mesh<BufferGeometry, MeshStandardMaterial>;
// #endregion

// #region helper classes
class RgbRmoColor {
  private static readonly prop = "rgbrmo";
  private static readonly customProp = "rgbrmoC";
  private static readonly defaultProp = "rgbrmoD";

  r: number;
  g: number;
  b: number;
  roughness: number;
  metalness: number;
  opacity: number;

  constructor(r: number, g: number, b: number,
    roughness: number, metalness: number, opacity: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.roughness = roughness;
    this.metalness = metalness;
    this.opacity = opacity;
  }

  static createFromMaterial(material: MeshStandardMaterial): RgbRmoColor {
    return new RgbRmoColor(
      material.color.r,
      material.color.g,
      material.color.b,
      material.roughness,
      material.metalness,
      material.opacity);
  }

  static deleteFromMesh(mesh: MeshBgSm,
    deleteCustom = false, deleteDefault = false) {

    mesh[RgbRmoColor.prop] = null;
    if (deleteCustom) {
      mesh[RgbRmoColor.customProp] = null;
    }
    if (deleteDefault) {
      mesh[RgbRmoColor.defaultProp] = null;
    }
  }

  static getDefaultFromMesh(mesh: MeshBgSm): RgbRmoColor {
    if (!mesh[RgbRmoColor.defaultProp]) {      
      mesh[RgbRmoColor.defaultProp] = RgbRmoColor.createFromMaterial(mesh.material);
    }
    return mesh[RgbRmoColor.defaultProp];
  }
  static getCustomFromMesh(mesh: MeshBgSm): RgbRmoColor {
    return mesh[RgbRmoColor.customProp];
  }
  static getFromMesh(mesh: MeshBgSm): RgbRmoColor {
    if (mesh[RgbRmoColor.prop]) {
      return mesh[RgbRmoColor.prop];
    }
    if (mesh[RgbRmoColor.customProp]) {      
      return mesh[RgbRmoColor.customProp];
    }
    return RgbRmoColor.getDefaultFromMesh(mesh);
  }

  static setCustomToMesh(mesh: MeshBgSm, rgbRmo: RgbRmoColor) {
    mesh[RgbRmoColor.customProp] = rgbRmo;
  }
  static setToMesh(mesh: MeshBgSm, rgbRmo: RgbRmoColor) {
    mesh[RgbRmoColor.prop] = rgbRmo;
  }
}

export class GltfViewerOptions {
  dracoDecoderEnabled = true;
  dracoDecoderPath = "/assets/draco/";  

  highlightingEnabled = true;
  highlightingLatency = 40;
  highlightColor = 0xFFFF00;

  selectionColor = 0xFF0000;
    
  isolationColor = 0x555555;
  isolationOpacity = 0.2;

  physicalLights = false;
  ambientLight = true;
  ambientLightIntensity = 1;
  hemiLight = true;
  hemiLightIntensity = 0.4;
  dirLight = true;
  dirLightIntensity = 0.6;

  useAntialiasing = true;

  meshRenderType: MeshRenderType = "per_model";
  
  constructor(item: object = null) {
    if (item != null) {
      Object.assign(this, item);
    }
  }
}
// #endregion

export class GltfViewer {
  // #region public observables
  initialized$: Observable<boolean>;
  loadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  openedModelsChange$: Observable<ModelOpenedInfo[]>;  
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>; 
  // #endregion  
  
  // #region private rx subjects
  private _initialized = new BehaviorSubject<boolean>(false);
  private _loadingStateChange = new BehaviorSubject<boolean>(false);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<ModelLoadingInfo>();
  private _openedModelsChange = new BehaviorSubject<ModelOpenedInfo[]>([]);   
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();  
  // #endregion

  // #region readonly fields
  private readonly _hlProp = "highlighted";
  private readonly _selProp = "selected";
  private readonly _isolProp = "isolated";
  private readonly _colProp = "colored";
  // #endregion
  
  private _subscriptions: Subscription[] = [];
  private _options: GltfViewerOptions;

  // #region html container related fieds
  private _container: Element;
  private _containerResizeSensor: ResizeSensor; 
  private _containerWidth: number;
  private _containerHeight: number;
  // #endregion

  // #region renderer related fieds
  private _renderer: WebGLRenderer;
  private _lights: Light[] = [];
  private _loader: GLTFLoader;
  private _camera: PerspectiveCamera;
  private _orbitControls: OrbitControls;
  // #endregion

  // #region render scene
  private _renderMaterial: MeshStandardMaterial;
  private _renderScene: Scene;
  private _renderGeometries: RenderGeometry[] = [];
  private _renderGeometryIndexBySourceMesh = new Map<MeshBgSm, number>();
  private _renderSourceMeshesByGeometryIndex = new Map<number, MeshBgSm[]>();
  private _renderGeometryIndicesNeedSort = new Set<number>();
  private _sourceMeshesNeedColorUpdate = new Set<MeshBgSm>();
  // #endregion

  // #region colors
  private _isolationColor: RgbRmoColor;
  private _selectionColor: Color;
  private _highlightColor: Color;
  // #endregion

  // #region selection related fieds
  private _queuedColoring: ColoringInfo[] = null;
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;

  private _highlightedMesh: MeshBgSm = null;
  private _selectedMeshes: MeshBgSm[] = [];
  private _isolatedMeshes: MeshBgSm[] = [];
  private _coloredMeshes: MeshBgSm[] = [];

  private _pickingTarget: WebGLRenderTarget;
  private _pickingScene: Scene;
  private _pickingMeshById = new Map<string, MeshBgSm>();
  private _meshByPickingColor = new Map<string, MeshBgSm>();
  private _lastPickingColor = 0;

  private _pointerEventHelper: {
    downX: number; 
    downY: number; 
    maxDiff: number; 
    mouseMoveTimer: number;
    waitForDouble: boolean;
  } = { downX: null, downY: null, maxDiff: 10, mouseMoveTimer: null, waitForDouble: false };
  // #endregion

  // #region loaded models related fieds
  private _loadingInProgress = false;
  private _loadingQueue: (() => Promise<void>)[] = [];

  private _loadedModels = new Set<ModelGeometryInfo>();
  private _loadedModelsByGuid = new Map<string, ModelGeometryInfo>();
  private _loadedModelsArray: ModelGeometryInfo[] = [];

  private _loadedMeshes = new Set<MeshBgSm>();
  private _loadedMeshesById = new Map<string, MeshBgSm[]>();
  private _loadedMeshesArray: MeshBgSm[] = [];
  // #endregion

  constructor(containerId: string, options: GltfViewerOptions) { 
    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error("Container not found!");
    }

    this._options = new GltfViewerOptions(options);

    this.init();
  }

  init() {
    this.initObservables(); 
    this.initPickingScene();
    this.initMaterials(); 
    this.initLigths(); 
    this.initLoader(); 
    this.initRenderer();
    this.initCameraWithControls();
    
    this._containerResizeSensor = new ResizeSensor(this._container, () => {
      const { width, height } = this._container.getBoundingClientRect();
      this.resizeCamera(width, height);
      this.resizeRenderer(width, height);
    }); 

    this.addCanvasEventListeners();
    this.render();

    this._initialized.next(true);
  }

  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();

    this._containerResizeSensor?.detach();

    this._renderer?.dispose();
    this._orbitControls?.dispose();
    this._loader?.dracoLoader?.dispose();
    
    this._renderGeometries.forEach(x => x.geometry.dispose());
    this._renderGeometries = null;
    this._renderScene = null;
    this._renderMaterial?.dispose();

    this._loadedMeshes.forEach(x => {
      x.geometry.dispose();
      x.material.dispose();
    });
    [...this._meshByPickingColor.values()].forEach(x => {
      x.geometry.dispose();
      x.material.dispose();
    });
    this._pickingTarget?.dispose();
  }

  // #region public interaction
  async openModelsAsync(modelInfos: ModelFileInfo[]): Promise<ModelLoadedInfo[]> {
    if (!modelInfos?.length) {
      return [];
    }

    const promises: Promise<ModelLoadedInfo>[] = [];
    modelInfos.forEach(x => {
      const resultSubject = new AsyncSubject<ModelLoadedInfo>();
      this._loadingQueue.push(async () => {        
        const { url, guid, name } = x;      
        const result = !this._loadedModelsByGuid.has(guid)
          ? await this.loadModel(url, guid, name)
          : { url, guid };
        resultSubject.next(result);
        resultSubject.complete();
      });
      promises.push(resultSubject.pipe(first()).toPromise());
    });
    this.processLoadingQueueAsync();

    const overallResult = await Promise.all(promises);
    return overallResult;
  };

  async closeModelsAsync(modelGuids: string[]): Promise<void> {
    if (!modelGuids?.length) {
      return;
    }

    const promises: Promise<boolean>[] = [];
    modelGuids.forEach(x => {      
      const resultSubject = new AsyncSubject<boolean>();
      this._loadingQueue.push(async () => {
        this.removeModelFromLoaded(x);
        resultSubject.next(true);
        resultSubject.complete();
      });
      promises.push(resultSubject.pipe(first()).toPromise());
    });    
    this.processLoadingQueueAsync();
    
    await Promise.all(promises);
  };

  colorItems(coloringInfos: ColoringInfo[]) {
    if (this._loadingInProgress) {
      this._queuedColoring = coloringInfos;
      return;
    }

    this.resetSelectionAndColorMeshes(coloringInfos);
  }

  selectItems(ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loadingInProgress) {
      this._queuedSelection = {ids, isolate: false};
      return;
    }

    this.findAndSelectMeshes(ids, false, true);
  };

  isolateItems(ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loadingInProgress) {
      this._queuedSelection = {ids, isolate: true};
      return;
    }

    this.findAndSelectMeshes(ids, true, true);
  };

  getOpenedModels(): ModelOpenedInfo[] {
    return this._openedModelsChange.getValue();
  }

  getSelectedItems(): Set<string> {
    return this._selectionChange.getValue();
  }
  // #endregion

  // #region rx
  private initObservables() {
    this.initialized$ = this._initialized.asObservable();
    this.loadingStateChange$ = this._loadingStateChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.openedModelsChange$ = this._openedModelsChange.asObservable();
    this.selectionChange$ = this._selectionChange.asObservable();
    this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
  }

  private closeSubjects() {
    this._initialized.complete();
    this._loadingStateChange.complete();
    this._modelLoadingStart.complete();
    this._modelLoadingProgress.complete();
    this._modelLoadingEnd.complete();
    this._openedModelsChange.complete();   
    this._selectionChange.complete();
    this._manualSelectionChange.complete();
  }
  // #endregion

  // #region canvas event handlers 
  private _onCanvasPointerDown = (e: PointerEvent) => {
    this._pointerEventHelper.downX = e.clientX;
    this._pointerEventHelper.downY = e.clientY;
  };

  private _onCanvasPointerUp = (e: PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    if (!this._pointerEventHelper.downX 
      || Math.abs(x - this._pointerEventHelper.downX) > this._pointerEventHelper.maxDiff
      || Math.abs(y - this._pointerEventHelper.downY) > this._pointerEventHelper.maxDiff) {
      return;
    }

    if (this._pointerEventHelper.waitForDouble) {
      if (this._selectedMeshes.length) {
        this.isolateSelectedMeshes();
        this.fitCameraToObjects(this._selectedMeshes);
      }
      this._pointerEventHelper.waitForDouble = false;
    } else {
      this._pointerEventHelper.waitForDouble = true;
      setTimeout(() => {
        this._pointerEventHelper.waitForDouble = false;
      }, 300);
      this.selectMeshAtPoint(x, y, e.ctrlKey);
    }

    this._pointerEventHelper.downX = null;
    this._pointerEventHelper.downY = null;
  };

  private _onCanvasMouseMove = (e: MouseEvent) => {   
    if (e.buttons) {
      return;
    } 

    clearTimeout(this._pointerEventHelper.mouseMoveTimer);
    this._pointerEventHelper.mouseMoveTimer = null;
    this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
      const x = e.clientX;
      const y = e.clientY;
      this.highlightMeshAtPoint(x, y);
    }, this._options.highlightingLatency);
  };

  private addCanvasEventListeners() {
    this._renderer.domElement.addEventListener("pointerdown", this._onCanvasPointerDown);
    this._renderer.domElement.addEventListener("pointerup", this._onCanvasPointerUp);
    if (this._options.highlightingEnabled) {      
      this._renderer.domElement.addEventListener("mousemove", this._onCanvasMouseMove);
    }
  }
  // #endregion

  // #region camera
  private initCameraWithControls() {
    const camera = new PerspectiveCamera(75, this._containerWidth / this._containerHeight, 1, 10000);    
    const orbitControls = new OrbitControls(camera, this._renderer.domElement);
    orbitControls.addEventListener("change", () => this.render());
    camera.position.set (0, 1000, 1000);
    camera.lookAt (0, 0, 0);    
    orbitControls.update();

    this._camera = camera;
    this._orbitControls = orbitControls;
  }
    
  private resizeCamera(width: number, height: number) {
    if (this._camera) {
      this._camera.aspect = width / height;
      this._camera.updateProjectionMatrix();
    }
  }
  
  private fitCameraToObjects(objects: Object3D[], offset = 1.2 ) { 
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
  // #endregion

  // #region renderer
  private initLigths() {
    if (this._options.ambientLight) {
      const ambientLight = new AmbientLight(0x222222, 
        this._options.physicalLights 
          ? this._options.ambientLightIntensity * Math.PI 
          : this._options.ambientLightIntensity);
      this._lights.push(ambientLight);
    }
    if (this._options.hemiLight) {
      const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 
        this._options.physicalLights 
          ? this._options.hemiLightIntensity * Math.PI 
          : this._options.hemiLightIntensity);
      hemiLight.position.set(0, 2000, 0);
      this._lights.push(hemiLight);
    }    
    if (this._options.dirLight) {
      const dirLight = new DirectionalLight(0xffffff,
        this._options.physicalLights 
          ? this._options.dirLightIntensity * Math.PI 
          : this._options.dirLightIntensity);
      dirLight.position.set(-2, 10, 2);
      this._lights.push(dirLight);
    }
  }

  private initRenderer() {
    const renderer = new WebGLRenderer({
      alpha: true, 
      antialias: this._options.useAntialiasing,
    });
    renderer.setSize(this._containerWidth, this._containerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = sRGBEncoding;
    renderer.physicallyCorrectLights = this._options.physicalLights;
    renderer.toneMapping = NoToneMapping;
    this._container.append(renderer.domElement);

    this._renderer = renderer;
  }
  
  private resizeRenderer(width: number, height: number) {
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();      
    }
  }

  private async updateRenderSceneAsync(): Promise<void> { 
    await this.rebuildRenderSceneAsync(this._options.meshRenderType);
    if (this._loadedMeshesArray.length) {
      this.fitCameraToObjects([this._renderScene]);
    }
    this.render();
  }

  private async rebuildRenderSceneAsync(meshRenderType: MeshRenderType): Promise<void> {
    this._renderScene = null;

    const scene = new Scene();
    scene.add(...this._lights);     

    this._renderGeometries.forEach(x => x.geometry.dispose());
    this._renderGeometries.length = 0;
    this._renderGeometryIndexBySourceMesh.clear();   
    this._renderSourceMeshesByGeometryIndex.clear();   
    this._renderGeometryIndicesNeedSort.clear();  
    
    let meshArrays: MeshBgSm[][];

    switch (meshRenderType) {
      case "single":
        meshArrays = [this._loadedMeshesArray];
        break;
      case "one_per_model":
        meshArrays = this._loadedModelsArray.map(x => x.meshes).filter(x => x.length);
        break;
      case "per_model":
        meshArrays = [];  
        const chunkSize = 1000;
        this._loadedModelsArray.map(x => x.meshes).filter(x => x.length).forEach(x => {
          if (x.length <= chunkSize) {
            meshArrays.push(x);
          } else {
            for (let i = 0; i < x.length; i += chunkSize) {
              const chunk = x.slice(i, i + chunkSize);
              meshArrays.push(chunk);
            }
          }
        });
        break;
      case "per_mesh":
        meshArrays = this._loadedMeshesArray.map(x => [x]); // TODO: develop separate logic
        break;
      default:
        meshArrays = [];
    }


    for (const meshes of meshArrays) {
      if (meshes.length) {
        const geometry = await this.buildRenderGeometryAsync(meshes);
        this._renderGeometries.push(geometry);
        const i = this._renderGeometries.length - 1;
        this._renderSourceMeshesByGeometryIndex.set(i, meshes);
        this._renderGeometryIndicesNeedSort.add(i);
        meshes.forEach(x => {
          this._renderGeometryIndexBySourceMesh.set(x, i);
        });
      }
    }

    this._renderGeometries.forEach(x => {    
      const mesh = new Mesh(x.geometry, this._renderMaterial);
      scene.add(mesh);
    });

    this._renderScene = scene;

  }

  private async buildRenderGeometryAsync(meshes: MeshBgSm[]): Promise<RenderGeometry> {
    let positionsLen = 0;
    let indicesLen = 0;
    meshes.forEach(x => {
      positionsLen += x.geometry.getAttribute("position").count * 3;
      indicesLen += x.geometry.getIndex().count;;      
    });

    if (positionsLen === 0) {
      return;
    }

    const indexBuffer = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
    const colorBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
    const rmoBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
    const positionBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
    const indicesBySourceMesh = new Map<MeshBgSm, Uint32Array>();    
    
    let positionsOffset = 0; 
    let indicesOffset = 0;
    // splitting into chunks to UI remain responsible
    const chunkSize = 100;
    const processChunk = (chunk: MeshBgSm[]) => {    
      chunk.forEach(x => {
        const geometry = <BufferGeometry>x.geometry
          .clone()
          .applyMatrix4(x.matrix);        
        const positions = geometry.getAttribute("position").array;
        const indices = geometry.getIndex().array;
        const meshIndices = new Uint32Array(indices.length);
        indicesBySourceMesh.set(x, meshIndices);
        for (let i = 0; i < indices.length; i++) {
          const index = indices[i] + positionsOffset;
          indexBuffer.setX(indicesOffset++, index);
          meshIndices[i] = index;
        }
        for (let i = 0; i < positions.length;) {   
          const rgbrmo = RgbRmoColor.getFromMesh(x);
          colorBuffer.setXYZ(positionsOffset, rgbrmo.r, rgbrmo.g, rgbrmo.b);
          rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughness, rgbrmo.metalness, rgbrmo.opacity);
          positionBuffer.setXYZ(positionsOffset++, positions[i++], positions[i++], positions[i++]);
        }
        geometry.dispose();
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

    const renderGeometry = new BufferGeometry();
    renderGeometry.setIndex(indexBuffer);   
    renderGeometry.setAttribute("color", colorBuffer);      
    renderGeometry.setAttribute("rmo", rmoBuffer); 
    renderGeometry.setAttribute("position", positionBuffer); 
    
    return {
      geometry: renderGeometry,
      positions: positionBuffer,
      colors: colorBuffer,
      rmos: rmoBuffer,
      indices: indexBuffer,
      indicesBySourceMesh,
    };
  } 

  private sortRenderGeometriesIndicesByOpacity() {
    this._renderGeometryIndicesNeedSort.forEach(i => {
      const meshes = this._renderSourceMeshesByGeometryIndex.get(i);

      const opaqueMeshes: MeshBgSm[] = [];
      const transparentMeshes: MeshBgSm[] = [];
      meshes.forEach(x => {
        if (RgbRmoColor.getFromMesh(x).opacity === 1) {
          opaqueMeshes.push(x);
        } else {
          transparentMeshes.push(x);
        }
      });

      const { indices, indicesBySourceMesh } = this._renderGeometries[i];
      let currentIndex = 0;
      opaqueMeshes.forEach(mesh => {
        indicesBySourceMesh.get(mesh).forEach(value => {
          indices.setX(currentIndex++, value);
        });
      });
      transparentMeshes.forEach(mesh => {
        indicesBySourceMesh.get(mesh).forEach(value => {
          indices.setX(currentIndex++, value);
        });
      });
      indices.needsUpdate = true;
    });
  }  

  private updateRenderGeometriesColors() {
    const meshesByRgIndex = new Map<number, MeshBgSm[]>();
    this._sourceMeshesNeedColorUpdate.forEach(mesh => {
      const rgIndex = this._renderGeometryIndexBySourceMesh.get(mesh);
      if (meshesByRgIndex.has(rgIndex)) {
        meshesByRgIndex.get(rgIndex).push(mesh);
      } else {
        meshesByRgIndex.set(rgIndex, [mesh]);
      }
    });

    meshesByRgIndex.forEach((v, k) => {
      this.updateRenderGeometryColors(k, v);
    });
  }

  private updateRenderGeometryColors(rgIndex: number, meshes: MeshBgSm[]) {
    const { colors, rmos, indicesBySourceMesh } = this._renderGeometries[rgIndex];
    let anyMeshOpacityChanged = false;
    meshes.forEach(mesh => {
      const { rgbRmo, opacityChanged } = this.refreshMeshColors(mesh); 
      indicesBySourceMesh.get(mesh).forEach(i => {
        colors.setXYZ(i, rgbRmo.r, rgbRmo.g, rgbRmo.b);
        rmos.setXYZ(i, rgbRmo.roughness, rgbRmo.metalness, rgbRmo.opacity);
      });
      if (!anyMeshOpacityChanged && opacityChanged) {
        anyMeshOpacityChanged = true;
      }
    });
    colors.needsUpdate = true;
    rmos.needsUpdate = true;  
    if (anyMeshOpacityChanged) {
      this._renderGeometryIndicesNeedSort.add(rgIndex);
    }  
  }

  private refreshMeshColors(mesh: MeshBgSm): {rgbRmo: RgbRmoColor; opacityChanged: boolean} { 
    if (!mesh[this._isolProp]) {
      RgbRmoColor.deleteFromMesh(mesh);
    }

    const initialRgbRmo = RgbRmoColor.getFromMesh(mesh);  

    let newRgbRmo: RgbRmoColor;
    if (mesh[this._hlProp]) {  
      newRgbRmo = new RgbRmoColor(        
        this._highlightColor.r,
        this._highlightColor.g,
        this._highlightColor.b,
        initialRgbRmo.roughness,
        initialRgbRmo.metalness,
        initialRgbRmo.opacity,  
      );
    } else if (mesh[this._selProp]) {  
      newRgbRmo = new RgbRmoColor(        
        this._selectionColor.r,
        this._selectionColor.g,
        this._selectionColor.b,
        initialRgbRmo.roughness,
        initialRgbRmo.metalness,
        initialRgbRmo.opacity,  
      );
    } else if (mesh[this._isolProp]) { 
      newRgbRmo = this._isolationColor;
    } else {
      newRgbRmo = initialRgbRmo;
    }

    RgbRmoColor.setToMesh(mesh, newRgbRmo);

    return {
      rgbRmo: newRgbRmo,
      opacityChanged: newRgbRmo.opacity !== initialRgbRmo.opacity,
    };
  }

  private render() {
    if (this._sourceMeshesNeedColorUpdate.size) {
      this.updateRenderGeometriesColors();
      this._sourceMeshesNeedColorUpdate.clear();
    }

    if (this._renderGeometryIndicesNeedSort.size) {
      this.sortRenderGeometriesIndicesByOpacity();
      this._renderGeometryIndicesNeedSort.clear();
    }    

    requestAnimationFrame(() => { 
      if (this._renderScene && this._camera) {
        this._renderer?.render(this._renderScene, this._camera);
      }
    });
  }
  // #endregion

  // #region picking scene 
  private initPickingScene() {
    const pickingTarget = new WebGLRenderTarget(1, 1);

    const scene = new Scene();
    scene.background = new Color(0);

    this._pickingTarget = pickingTarget;
    this._pickingScene = scene;
  }
  
  private nextPickingColor(): number {
    return ++this._lastPickingColor;
  } 

  private addMeshToPickingScene(mesh: MeshBgSm) {
    const pickingMeshMaterial = new MeshStandardMaterial({ 
      color: new Color(this.nextPickingColor()), 
      emissive: new Color(this._lastPickingColor),
      blending: NoBlending,
      flatShading: true,
      side: DoubleSide,
      
      roughness: 1,
      metalness: 0,
    });
    const colorString = this._lastPickingColor.toString(16);
    
    const pickingMesh = new Mesh(mesh.geometry, pickingMeshMaterial);
    pickingMesh.userData.originalUuid = mesh.uuid;
    pickingMesh.userData.color = colorString;
    pickingMesh.position.copy(mesh.position);
    pickingMesh.rotation.copy(mesh.rotation);
    pickingMesh.scale.copy(mesh.scale);

    this._pickingScene.add(pickingMesh);
    this._pickingMeshById.set(mesh.uuid, pickingMesh);
    this._meshByPickingColor.set(colorString, mesh);
  }

  private removeMeshFromPickingScene(mesh: Mesh) {
    const pickingMesh = this._pickingMeshById.get(mesh.uuid);
    if (pickingMesh) {
      this._pickingScene.remove(pickingMesh);
      this._pickingMeshById.delete(mesh.uuid);
      this._meshByPickingColor.delete(pickingMesh.userData.color);
    }
  }

  private getPickingPosition(clientX: number, clientY: number): {x: number; y: number} {
    const rect = this._renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) * this._renderer.domElement.width / rect.width;
    const y = (clientY - rect.top) * this._renderer.domElement.height / rect.height;
    return {x, y};
  }

  private getItemAtPickingPosition(position: {x: number; y: number}): MeshBgSm {
    const pixelRatio = this._renderer.getPixelRatio();
    this._camera.setViewOffset(
      this._renderer.getContext().drawingBufferWidth,
      this._renderer.getContext().drawingBufferHeight,
      position.x * pixelRatio || 0,
      position.y * pixelRatio || 0,
      1, 1);
    const light = new DirectionalLight(0xFFFFFF, 1);
    light.position.set(-1, 2, 4);
    this._camera.add(light);
    this._renderer.setRenderTarget(this._pickingTarget);
    this._renderer.render(this._pickingScene, this._camera);

    // reset changes made to renderer and camera
    this._renderer.setRenderTarget(null);
    this._camera.clearViewOffset();
    this._camera.remove(light);    

    const pixelBuffer = new Uint8Array(4);
    this._renderer.readRenderTargetPixels(this._pickingTarget, 0, 0, 1, 1, pixelBuffer); 
    // eslint-disable-next-line no-bitwise
    const id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]);
    const mesh = this._meshByPickingColor.get(id.toString(16));

    return mesh;
  }
  // #endregion

  // #region loading models
  private initLoader() {
    const loader = new GLTFLoader();

    if (this._options.dracoDecoderEnabled) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(this._options.dracoDecoderPath);
      dracoLoader.preload();
      loader.setDRACOLoader(dracoLoader);
    }

    this._loader = loader;
    this.processLoadingQueueAsync();
  }

  private async processLoadingQueueAsync(): Promise<void> {
    if (!this._loader || this._loadingInProgress) {
      return;
    }  

    this._loadingInProgress = true;  
    this._loadingStateChange.next(true);

    while (this._loadingQueue.length > 0) {
      const action = this._loadingQueue.shift();
      await action();
    } 
    
    this.runQueuedColoring(false);
    this.runQueuedSelection(false);
    await this.updateRenderSceneAsync();

    this._loadingStateChange.next(false);
    this._loadingInProgress = false;
  }

  private async loadModel(url: string, guid: string, name: string): Promise<ModelLoadedInfo> {
    this.onModelLoadingStart(url, guid); 
    let error: Error;
    try {
      const model = await this._loader.loadAsync(url,
        (progress) => this.onModelLoadingProgress(progress, url, guid));
      this.addModelToLoaded(model, guid, name);
    } catch (loadingError) {
      error = loadingError;
    }
    const result = { url, guid, error };
    this.onModelLoadingEnd(result);
    return result;
  }  

  private onModelLoadingStart(url: string, guid: string) {
    this._modelLoadingStart.next({url, guid});
  }  

  private onModelLoadingProgress(progress: ProgressEvent, url: string, guid: string) {   
    const currentProgress = Math.round(progress.loaded / progress.total * 100);
    this._modelLoadingProgress.next({ url, guid, progress: currentProgress });
  }
  
  private onModelLoadingEnd(info: ModelLoadedInfo) {
    const { url, guid } = info;
    this._modelLoadingProgress.next({ url, guid, progress: 0});
    this._modelLoadingEnd.next(info);
  }

  private addModelToLoaded(gltf: GLTF, modelGuid: string, modelName: string) {
    const name = modelName || modelGuid;
    const scene = gltf.scene;
    scene.userData.guid = modelGuid;
    scene.name = name;

    const meshes: MeshBgSm[] = [];
    const handles = new Set<string>();
    scene.traverse(x => {
      if (x instanceof Mesh
          && x.geometry instanceof BufferGeometry
          && x.material instanceof MeshStandardMaterial) {

        const id = `${modelGuid}|${x.name}`;
        x.userData.id = id;
        x.userData.modelGuid = modelGuid;

        this.addMeshToPickingScene(x);
        this._loadedMeshes.add(x);
        if (this._loadedMeshesById.has(id)) {
          this._loadedMeshesById.get(id).push(x);
        } else {
          this._loadedMeshesById.set(id, [x]);
        }
        
        meshes.push(x);
        handles.add(x.name);
      }
    });
    
    const modelInfo = {name, meshes, handles};
    this._loadedModels.add(modelInfo);
    this._loadedModelsByGuid.set(modelGuid, modelInfo);

    this.updateModelsDataArrays();
    this.emitOpenedModelsChanged();
  }

  private removeModelFromLoaded(modelGuid: string) {
    if (!this._loadedModelsByGuid.has(modelGuid)) {
      return;
    }

    const modelData = this._loadedModelsByGuid.get(modelGuid);
    modelData.meshes.forEach(x => {  
      this._loadedMeshes.delete(x); 
      this._loadedMeshesById.delete(x.userData.id);
      this.removeMeshFromPickingScene(x);
      x.geometry?.dispose();
    });

    this._highlightedMesh = null;
    this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    
    this._loadedModels.delete(modelData);
    this._loadedModelsByGuid.delete(modelGuid);

    this.updateModelsDataArrays();
    this.emitOpenedModelsChanged();
  }

  private updateModelsDataArrays() {
    this._loadedMeshesArray = [...this._loadedMeshes];
    this._loadedModelsArray = [...this._loadedModels];
  }

  private emitOpenedModelsChanged() {  
    const modelOpenedInfos: ModelOpenedInfo[] = [];
    for (const [ modelGuid, model ] of this._loadedModelsByGuid) {
      modelOpenedInfos.push({guid: modelGuid, name: model.name, handles: model.handles});
    } 
    this._openedModelsChange.next(modelOpenedInfos);
  }
  // #endregion

  // #region item custom coloring
  private runQueuedColoring(render = true) {
    if (this._queuedColoring) {
      this.resetSelectionAndColorMeshes(this._queuedColoring, render);
    }
  }

  private resetSelectionAndColorMeshes(coloringInfos: ColoringInfo[], render = true) {    
    this.removeIsolation();
    this.removeSelection();

    this.colorMeshes(coloringInfos, render);
  }

  private colorMeshes(coloringInfos: ColoringInfo[], render: boolean) {
    this.removeColoring();

    if (coloringInfos?.length) {
      for (const info of coloringInfos) {
        const color = new Color(info.color);
        const customColor = new RgbRmoColor(color.r, color.g, color.b, 1, 0, info.opacity);
        info.ids.forEach(x => {
          const meshes = this._loadedMeshesById.get(x);
          if (meshes?.length) {
            meshes.forEach(y => {
              y[this._colProp] = true;
              RgbRmoColor.setCustomToMesh(y, customColor);
              this._sourceMeshesNeedColorUpdate.add(y);
              this._coloredMeshes.push(y);
            });
          }
        });
      }
    }

    if (render) {
      this.render();
    }
  }

  private removeColoring() {
    for (const mesh of this._coloredMeshes) {
      mesh[this._colProp] = undefined;
      RgbRmoColor.deleteFromMesh(mesh, true);
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._coloredMeshes.length = 0;
  }
  // #endregion

  // #region item selection/isolation
  private runQueuedSelection(render: boolean) {    
    if (this._queuedSelection) {
      const { ids, isolate } = this._queuedSelection;
      this.findAndSelectMeshes(ids, isolate, render);
    }
  }

  private findAndSelectMeshes(ids: string[], isolate: boolean, render: boolean) {    
    const { found } = this.findMeshesByIds(new Set<string>(ids));
    if (found.length) {
      this.selectMeshes(found, false, isolate, render);
    }
  }

  private findMeshesByIds(ids: Set<string>): {found: MeshBgSm[]; notFound: Set<string>} {
    const found: MeshBgSm[] = [];
    const notFound = new Set<string>();

    ids.forEach(x => {
      if (this._loadedMeshesById.has(x)) {
        found.push(...this._loadedMeshesById.get(x));
      } else {
        notFound.add(x);
      }
    });

    return {found, notFound};
  }

  private removeSelection() {
    for (const mesh of this._selectedMeshes) {
      mesh[this._selProp] = undefined;
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh[this._isolProp] = undefined;
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._isolatedMeshes.length = 0;
  }

  private selectMeshAtPoint(x: number, y: number, keepPreviousSelection: boolean) {    
    const position = this.getPickingPosition(x, y);
    const mesh = this.getItemAtPickingPosition(position);
    if (!mesh) {
      this.selectMeshes([], true, false, true);
      return;
    }

    if (keepPreviousSelection) {
      if (mesh[this._selProp]) {
        this.removeFromSelection(mesh);
      } else {        
        this.addToSelection(mesh);
      }
    } else {
      this.selectMeshes([mesh], true, false, true);
    }
  }

  private addToSelection(mesh: MeshBgSm): boolean {   
    const meshes = [mesh, ...this._selectedMeshes];
    this.selectMeshes(meshes, true, false, true);
    return true;
  }

  private removeFromSelection(mesh: Mesh): boolean {
    const meshes = this._selectedMeshes.filter(x => x !== mesh);
    this.selectMeshes(meshes, true, false, true);
    return true;
  }
 
  private selectMeshes(meshes: MeshBgSm[], 
    manual: boolean, isolateSelected: boolean, render: boolean) { 
      
    this.removeSelection();
    this.removeIsolation();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual, render);
      return null;
    }
    
    meshes.forEach(x => {
      x[this._selProp] = true;
      this._sourceMeshesNeedColorUpdate.add(x);
    });

    if (isolateSelected) {
      this.isolateSelectedMeshes();
    }

    this._selectedMeshes = meshes;
    this.emitSelectionChanged(manual, render);
  }

  private isolateSelectedMeshes() {
    this._loadedMeshesArray.forEach(x => {
      if (!x[this._selProp]) {
        x[this._isolProp] = true;
        this._sourceMeshesNeedColorUpdate.add(x);
        this._isolatedMeshes.push(x);
      }
    });
  }

  private emitSelectionChanged(manual: boolean, render: boolean) { 
    if (!manual) {
      this.fitCameraToObjects(this._selectedMeshes);
    }
    if (render) {
      this.render();
    }

    const ids = new Set<string>();
    this._selectedMeshes.forEach(x => ids.add(x.userData.id));

    this._selectionChange.next(ids);
    if (manual) {
      this._manualSelectionChange.next(ids);
    }
  }
  // #endregion

  // #region item highlighting
  private highlightMeshAtPoint(x: number, y: number) {    
    const position = this.getPickingPosition(x, y);
    const mesh = this.getItemAtPickingPosition(position);    
    this.highlightItem(mesh);
  }

  private highlightItem(mesh: MeshBgSm) {
    if (mesh === this._highlightedMesh) {
      return;
    }

    this.removeHighlighting();
    if (mesh) {
      mesh[this._hlProp] = true;
      this._sourceMeshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = mesh;
    }
    this.render();
  }

  private removeHighlighting() {
    if (this._highlightedMesh) {
      const mesh = this._highlightedMesh;
      mesh[this._hlProp] = undefined;
      this._sourceMeshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = null;
    }
  }
  // #endregion

  // #region materials
  private initMaterials() {
    const isolationColor = new Color(this._options.isolationColor);
    const isolationRgbRmoColor = new RgbRmoColor(
      isolationColor.r, isolationColor.g, isolationColor.b,
      1, 0, this._options.isolationOpacity);

    const selectionColor = new Color(this._options.selectionColor);
    const highlightColor = new Color(this._options.highlightColor);

    this._renderMaterial = this.buildRenderMaterial(true);
    this._isolationColor = isolationRgbRmoColor;
    this._selectionColor = selectionColor;
    this._highlightColor = highlightColor;
  }

  private buildRenderMaterial(transparent: boolean): MeshStandardMaterial {    
    const renderMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{
      vertexColors: true,
      flatShading: true,
      blending: NormalBlending,
      side: DoubleSide,
      transparent,
    });
    renderMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 
        `
        attribute vec3 rmo;        
        varying float roughness;
        varying float metalness;
        varying float opacity;
        ` 
        + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("void main() {",
        `
        void main() {
          roughness = rmo.x;
          metalness = rmo.y;
          opacity = rmo.z;
        `
      );      
      shader.fragmentShader = shader.fragmentShader.replace("uniform float roughness;", "varying float roughness;");
      shader.fragmentShader = shader.fragmentShader.replace("uniform float metalness;", "varying float metalness;");
      shader.fragmentShader = shader.fragmentShader.replace("uniform float opacity;", "varying float opacity;");  
    };
    return renderMaterial;
  }
  // #endregion  
}
