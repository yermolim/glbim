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
import { first } from "rxjs/operators";

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
  gltf: GLTF; 
  meshes: Mesh<BufferGeometry, MeshStandardMaterial>[]; 
  handles: Set<string>; 
}
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

  static deleteFromMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    deleteCustom = false, deleteDefault = false) {

    mesh[RgbRmoColor.prop] = null;
    if (deleteCustom) {
      mesh[RgbRmoColor.customProp] = null;
    }
    if (deleteDefault) {
      mesh[RgbRmoColor.defaultProp] = null;
    }
  }

  static getDefaultFromMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>): RgbRmoColor {
    if (!mesh[RgbRmoColor.defaultProp]) {      
      mesh[RgbRmoColor.defaultProp] = RgbRmoColor.createFromMaterial(mesh.material);
    }
    return mesh[RgbRmoColor.defaultProp];
  }
  static getCustomFromMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>): RgbRmoColor {
    return mesh[RgbRmoColor.customProp];
  }
  static getFromMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>): RgbRmoColor {
    if (mesh[RgbRmoColor.prop]) {
      return mesh[RgbRmoColor.prop];
    }
    if (mesh[RgbRmoColor.customProp]) {      
      return mesh[RgbRmoColor.customProp];
    }
    return RgbRmoColor.getDefaultFromMesh(mesh);
  }

  static setCustomToMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>, rgbRmo: RgbRmoColor) {
    mesh[RgbRmoColor.customProp] = rgbRmo;
  }
  static setToMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>, rgbRmo: RgbRmoColor) {
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
  private _renderScene: Scene;
  private _globalGeometry: BufferGeometry;
  private _glGeomColor: Float32BufferAttribute;
  private _glGeomRmo: Float32BufferAttribute;
  private _glGeomIndex: Uint32BufferAttribute;
  private _glGeomIndicesByMesh: Map<Mesh<BufferGeometry, MeshStandardMaterial>, Uint32Array>;
  private _glGeomIndicesNeedSort: boolean;
  // #endregion

  // #region materials related fieds
  private _globalMaterial: MeshStandardMaterial;
  private _isolationColor: RgbRmoColor;
  private _selectionColor: Color;
  private _highlightColor: Color;
  // #endregion

  // #region selection related fieds
  private _queuedColoring: ColoringInfo[] = null;
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;

  private _highlightedMesh: Mesh<BufferGeometry, MeshStandardMaterial> = null;
  private _selectedMeshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  private _isolatedMeshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  private _coloredMeshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];

  private _pickingTarget: WebGLRenderTarget;
  private _pickingScene: Scene;
  private _pickingMeshById = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>>();
  private _meshByPickingColor = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>>();
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

  private _loadedMeshes = new Set<Mesh<BufferGeometry, MeshStandardMaterial>>();
  private _loadedMeshesById = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>[]>();
  private _loadedMeshesArray: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
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
    
    this._globalGeometry?.dispose();
    this._globalMaterial?.dispose();

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
    await this.rebuildRenderSceneAsync();
    if (this._loadedMeshesArray.length) {
      this.fitCameraToObjects([this._renderScene]);
    }
    this._glGeomIndicesNeedSort = true;
    this.render();
  }

  private async rebuildRenderSceneAsync(): Promise<void> {
    this._renderScene = null;

    const scene = new Scene();
    scene.add(...this._lights); 
    
    await this.rebuildGlobalGeometryAsync();
    if (this._globalGeometry) {      
      const globalMesh = new Mesh(this._globalGeometry, this._globalMaterial);
      scene.add(globalMesh);
    }

    this._renderScene = scene;
  }

  private async rebuildGlobalGeometryAsync(): Promise<void> {    
    this._glGeomIndicesByMesh = null;
    this._glGeomIndex = null;
    this._glGeomColor = null;
    this._glGeomRmo = null;
    this._globalGeometry?.dispose();
    this._globalGeometry = null;

    if (!this._loadedMeshesArray?.length) {
      return;
    }

    let positionsLen = 0;
    let indicesLen = 0;
    this._loadedMeshesArray.forEach(x => {
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
    const indicesByMesh = new Map<Mesh<BufferGeometry, MeshStandardMaterial>, Uint32Array>();    
    
    let positionsOffset = 0; 
    let indicesOffset = 0;
    // splitting into chunks to UI remain responsible
    const chunkSize = 1000;
    const processChunk = (meshes: Mesh<BufferGeometry, MeshStandardMaterial>[]) => {    
      meshes.forEach(x => {
        const geometry = <BufferGeometry>x.geometry
          .clone()
          .applyMatrix4(x.matrix);        
        const positions = geometry.getAttribute("position").array;
        const indices = geometry.getIndex().array;
        const meshIndices = new Uint32Array(indices.length);
        indicesByMesh.set(x, meshIndices);
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
    for (let i = 0; i < this._loadedMeshesArray.length; i += chunkSize) {
      await new Promise((resolve) => { 
        setTimeout(() => {
          processChunk(this._loadedMeshesArray.slice(i, i + chunkSize));
          resolve();
        }, 0);
      });
    }

    const globalGeometry = new BufferGeometry();
    globalGeometry.setIndex(indexBuffer);   
    globalGeometry.setAttribute("color", colorBuffer);      
    globalGeometry.setAttribute("rmo", rmoBuffer); 
    globalGeometry.setAttribute("position", positionBuffer); 
    
    this._globalGeometry = globalGeometry;
    this._glGeomIndex = indexBuffer;
    this._glGeomColor = colorBuffer;
    this._glGeomRmo = rmoBuffer;
    this._glGeomIndicesByMesh = indicesByMesh;
  } 

  private sortGlGeomIndicesByOpacity() {
    if (!this._globalGeometry || !this._glGeomIndicesByMesh) {
      return;
    }

    let currentIndex = 0;
    this._loadedMeshesArray.sort((a, b) => 
      RgbRmoColor.getFromMesh(b).opacity - RgbRmoColor.getFromMesh(a).opacity);
    this._loadedMeshesArray.forEach(mesh => {
      this._glGeomIndicesByMesh.get(mesh).forEach(value => {
        this._glGeomIndex.setX(currentIndex++, value);
      });
    });
    this._glGeomIndex.needsUpdate = true;
  }

  private render() {
    if (!this._renderer) {
      return;
    }

    if (this._glGeomIndicesNeedSort) {
      this.sortGlGeomIndicesByOpacity();
      this._glGeomIndicesNeedSort = false;
    }

    requestAnimationFrame(() => { 
      this._renderer.render(this._renderScene, this._camera);
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

  private addMeshToPickingScene(mesh: Mesh<BufferGeometry, MeshStandardMaterial>) {
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

  private getItemAtPickingPosition(position: {x: number; y: number}): Mesh<BufferGeometry, MeshStandardMaterial> {
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

    const meshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
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

    const modelInfo = {gltf: gltf, meshes, handles, name};
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
    this._loadedModelsArray = [...this._loadedModels];
    this._loadedMeshesArray = [...this._loadedMeshes];
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
              this.refreshMeshRgbRmo(y);
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
      this.refreshMeshRgbRmo(mesh);
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

  private findMeshesByIds(ids: Set<string>): {found: Mesh<BufferGeometry, MeshStandardMaterial>[]; notFound: Set<string>} {
    const found: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
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
      this.refreshMeshRgbRmo(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh[this._isolProp] = undefined;
      this.refreshMeshRgbRmo(mesh);
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

  private addToSelection(mesh: Mesh<BufferGeometry, MeshStandardMaterial>): boolean {   
    const meshes = [mesh, ...this._selectedMeshes];
    this.selectMeshes(meshes, true, false, true);
    return true;
  }

  private removeFromSelection(mesh: Mesh): boolean {
    const meshes = this._selectedMeshes.filter(x => x !== mesh);
    this.selectMeshes(meshes, true, false, true);
    return true;
  }
 
  private selectMeshes(meshes: Mesh<BufferGeometry, MeshStandardMaterial>[], 
    manual: boolean, isolateSelected: boolean, render: boolean) { 
      
    this.removeSelection();
    this.removeIsolation();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual, render);
      return null;
    }
    
    meshes.forEach(x => {
      x[this._selProp] = true;
      this.refreshMeshRgbRmo(x);
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
        this.refreshMeshRgbRmo(x);
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

  private highlightItem(mesh: Mesh<BufferGeometry, MeshStandardMaterial>) {
    if (mesh === this._highlightedMesh) {
      return;
    }

    this.removeHighlighting();
    if (mesh) {
      mesh[this._hlProp] = true;
      this.refreshMeshRgbRmo(mesh);
      this._highlightedMesh = mesh;
    }
    this.render();
  }

  private removeHighlighting() {
    if (this._highlightedMesh) {
      const mesh = this._highlightedMesh;
      mesh[this._hlProp] = undefined;
      this.refreshMeshRgbRmo(mesh);
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

    this._globalMaterial = this.buildGlobalMaterial(true);
    this._isolationColor = isolationRgbRmoColor;
    this._selectionColor = selectionColor;
    this._highlightColor = highlightColor;
  }

  private buildGlobalMaterial(transparent: boolean): MeshStandardMaterial {    
    const globalMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{
      vertexColors: true,
      flatShading: true,
      blending: NormalBlending,
      side: DoubleSide,
      transparent,
    });
    globalMaterial.onBeforeCompile = shader => {
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
    return globalMaterial;
  }

  private refreshMeshRgbRmo(mesh: Mesh<BufferGeometry, MeshStandardMaterial>) { 
    if (!mesh) {
      return;
    }

    if (!mesh[this._isolProp]) {
      RgbRmoColor.deleteFromMesh(mesh);
    }

    const initialRgbrmo = RgbRmoColor.getFromMesh(mesh);

    if (mesh[this._hlProp]) {  
      RgbRmoColor.setToMesh(mesh, new RgbRmoColor(        
        this._highlightColor.r,
        this._highlightColor.g,
        this._highlightColor.b,
        initialRgbrmo.roughness,
        initialRgbrmo.metalness,
        initialRgbrmo.opacity,  
      ));
    } else if (mesh[this._selProp]) {  
      RgbRmoColor.setToMesh(mesh, new RgbRmoColor(        
        this._selectionColor.r,
        this._selectionColor.g,
        this._selectionColor.b,
        initialRgbrmo.roughness,
        initialRgbrmo.metalness,
        initialRgbrmo.opacity,  
      ));
    } else if (mesh[this._isolProp]) { 
      RgbRmoColor.setToMesh(mesh, this._isolationColor);
    }

    const rgbrmo = RgbRmoColor.getFromMesh(mesh);
    this._glGeomIndicesByMesh.get(mesh).forEach(i => {
      this._glGeomColor.setXYZ(i, rgbrmo.r, rgbrmo.g, rgbrmo.b);
      this._glGeomRmo.setXYZ(i, rgbrmo.roughness, rgbrmo.metalness, rgbrmo.opacity);
    });
    this._glGeomColor.needsUpdate = true;
    this._glGeomRmo.needsUpdate = true;

    if (rgbrmo.opacity !== initialRgbrmo.opacity) {
      this._glGeomIndicesNeedSort = true;
    }
  }
  // #endregion  
}
