import { Observable, Subscription, Subject, BehaviorSubject } from "rxjs";

import { WebGLRenderer, NoToneMapping, sRGBEncoding, 
  Scene, Mesh, PerspectiveCamera, 
  AmbientLight, HemisphereLight, DirectionalLight,
  Color, Box3, Object3D, Vector3, WebGLRenderTarget,
  MeshPhysicalMaterial, Material, 
  DoubleSide, NormalBlending, NoBlending, MeshStandardMaterial  } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { ResizeSensor } from "css-element-queries";

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

export interface ModelOpenedInfo {
  guid: string; 
  name: string; 
  handles: Set<string>;
}

interface ModelGeometryInfo {
  name: string;
  gltf: GLTF; 
  meshes: Mesh[]; 
  handles: Set<string>; 
}

export class GltfViewerOptions {
  dracoDecoderEnabled = true;
  dracoDecoderPath = "/assets/draco/";  
  highlightingEnabled = true;
  highlightingLatency = 300;
  
  constructor(item: object = null) {
    if (item != null) {
      Object.assign(this, item);
    }
  }
}

export class GltfViewer {
  // #region public observables
  initialized$: Observable<boolean>;
  modelLoadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<number>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  openedModelsChange$: Observable<ModelOpenedInfo[]>;  
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>; 
  // #endregion  
  
  // #region private rx subjects
  private _initialized = new BehaviorSubject<boolean>(false);
  private _modelLoadingStateChange = new BehaviorSubject<boolean>(false);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<number>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _openedModelsChange = new BehaviorSubject<ModelOpenedInfo[]>([]);   
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();  
  // #endregion

  // #region readonly fields
  private readonly _bakMatProp = "materialBackup";
  private readonly _colMatProp = "materialColored";
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
  private _mainScene: Scene;
  private _loader: GLTFLoader;
  private _camera: PerspectiveCamera;
  private _orbitControls: OrbitControls;
  // #endregion

  // #region materials related fieds
  private _selectionMaterial: Material;
  private _isolationMaterial: Material;
  private _highlightMaterial: Material;
  // #endregion

  // #region selection related fieds
  private _highlightedMesh: Mesh = null;
  private _selectedMeshes: Mesh[] = [];
  private _isolatedMeshes: Mesh[] = [];
  private _coloredMeshes: Mesh[] = [];

  private _pickingTarget: WebGLRenderTarget;
  private _pickingScene: Scene;
  private _pickingColorToMesh = new Map<string, Mesh>();
  private _lastPickingColor = 0;

  private _pointerEventHelper: {
    downX: number; 
    downY: number; 
    maxDiff: number; 
    mouseMoveTimer: number;
    waitForDouble: boolean;
  } = { downX: null, downY: null, maxDiff: 10, mouseMoveTimer: null, waitForDouble: false };
  // #endregion

  // #region model loading related fieds
  private _loadingInProgress = false;
  private _loadingQueue: ModelFileInfo[] = [];
  private _loadedModelsByGuid = new Map<string, ModelGeometryInfo>();
  private _loadedMeshesById = new Map<string, Mesh[]>();
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
    this._containerResizeSensor = new ResizeSensor(this._container, () => {
      this.updateContainerDimensions();
      this.updateRendererSize();
    }); 

    this.initObservables();
    this.initRendererWithScene();
    this.initSpecialMaterials();
    this.initPickingScene();
    this.initLoader();
    this.addCanvasEventListeners();

    this._initialized.next(true);
  }

  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();

    if (this._renderer) {
      this._renderer.dispose();
    }
    if (this._orbitControls) {
      this._orbitControls.dispose();
    }
    if (this._loader?.dracoLoader) {
      this._loader.dracoLoader.dispose();
    }
    if (this._containerResizeSensor) {
      this._containerResizeSensor.detach();
    }
  }

  // #region public interaction
  openModels(modelInfos: ModelFileInfo[]) {
    if (!modelInfos?.length) {
      return;
    }
    modelInfos.forEach(x => {
      this._loadingQueue.push(x);
    });
    this.loadQueuedModelsAsync();
  };

  closeModels(modelGuids: string[]) {
    if (!modelGuids?.length) {
      return;
    }

    modelGuids.forEach(x => {
      this.removeModelFromScene(x);
    });
  };

  selectItems(ids: string[]) {
    if (ids?.length) {
      const { found, notFound } = this.findMeshesByIds(new Set<string>(ids));
      if (found.length) {
        this.selectMeshes(found, false);
      }
    }
  };

  isolateItems(ids: string[]) {
    if (ids?.length) {
      const { found, notFound } = this.findMeshesByIds(new Set<string>(ids));
      if (found.length) {
        this.selectMeshes(found, false, true);
      }
    }
  };

  colorItems(coloringInfos: {color: number; ids: string[]}[]) {
    this.removeIsolation();
    this.removeSelection();
    this.colorMeshes(coloringInfos);
  }

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
    this.modelLoadingStateChange$ = this._modelLoadingStateChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.openedModelsChange$ = this._openedModelsChange.asObservable();
    this.selectionChange$ = this._selectionChange.asObservable();
    this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
  }

  private closeSubjects() {
    this._initialized.complete();
    this._modelLoadingStateChange.complete();
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

  // #region renderer base
  private initRendererWithScene() {
    const scene = new Scene();

    const ambientLight = new AmbientLight(0x222222, 1);
    const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 1);
    hemiLight.translateY(2000);
    scene.add(ambientLight);
    scene.add(hemiLight);
    
    const renderer = new WebGLRenderer({alpha: true, antialias: true});
    renderer.setSize(this._containerWidth, this._containerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = sRGBEncoding;
    renderer.physicallyCorrectLights = false;
    renderer.toneMapping = NoToneMapping;

    const camera = new PerspectiveCamera(75, this._containerWidth / this._containerHeight, 0.01, 10000);    
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.addEventListener("change", () => this.render());
    camera.position.set (0, 1000, 1000);
    camera.lookAt (0, 0, 0);    
    orbitControls.update();

    this._container.append(renderer.domElement);

    this._renderer = renderer;
    this._mainScene = scene;
    this._camera = camera;
    this._orbitControls = orbitControls;

    this.render();
  }
  
  private render() {
    if (this._renderer) {
      requestAnimationFrame(() => this._renderer.render(this._mainScene, this._camera));
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
    
    this._camera.near = Math.min(distance / 100, 0.01);
    this._camera.far = Math.max(distance * 100, 10000);
    this._camera.updateProjectionMatrix();
    this._camera.position.copy(this._orbitControls.target).sub(direction);

    this._orbitControls.update();
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

  private addMeshToPickingScene(mesh: Mesh) {
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
    this._pickingColorToMesh.set(colorString, mesh);
  }

  private removeMeshFromPickingScene(mesh: Mesh) {
    const pickingMesh = this._pickingScene.children.find(x => x.userData.originalUuid === mesh.uuid);
    if (pickingMesh) {
      this._pickingScene.remove(pickingMesh);
      this._pickingColorToMesh.delete(pickingMesh.userData.color);
    }
  }

  private getPickingPosition(clientX: number, clientY: number): {x: number; y: number} {
    const rect = this._renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) * this._renderer.domElement.width / rect.width;
    const y = (clientY - rect.top) * this._renderer.domElement.height / rect.height;
    return {x, y};
  }

  private getItemAtPickingPosition(position: {x: number; y: number}): Mesh {
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
    const mesh = this._pickingColorToMesh.get(id.toString(16));

    return mesh;
  }
  // #endregion

  // #region update size
  private updateContainerDimensions() {
    const rect = this._container.getBoundingClientRect();
    this._containerWidth = rect.width;
    this._containerHeight = rect.height;
  }

  private updateRendererSize() {
    if (this._renderer) {
      this._camera.aspect = this._containerWidth / this._containerHeight;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(this._containerWidth, this._containerHeight, false);
      this.render();      
    }
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
    this.loadQueuedModelsAsync();
  }

  private async loadQueuedModelsAsync() {
    if (!this._loader || this._loadingInProgress) {
      return;
    }  

    this._loadingInProgress = true;  
    this._modelLoadingStateChange.next(true);

    while (this._loadingQueue.length > 0) {
      const { url, guid, name } = this._loadingQueue.shift();
      if (!this._loadedModelsByGuid.has(guid)) {
        await this.loadModel(url, guid, name);
      }
    }    

    this._modelLoadingStateChange.next(false);
    this._loadingInProgress = false;
  }

  private async loadModel(url: string, guid: string, name: string) {
    this.onModelLoadingStart(url, guid); 
    try {
      const model = await this._loader.loadAsync(url,
        (progress) => this.onModelLoadingProgress(progress));
      this.addModelToScene(model, guid, name);
      this.onModelLoadingEnd(url, guid);
    } catch (error) {
      this.onModelLoadingEnd(url, guid, error);
    }
  }  

  private onModelLoadingStart(url: string, guid: string) {
    this._modelLoadingStart.next({url, guid});
  }  

  private onModelLoadingProgress(progress: ProgressEvent) {   
    const currentProgress = Math.round(progress.loaded / progress.total * 100);
    this._modelLoadingProgress.next(currentProgress);
  }
  
  private onModelLoadingEnd(url: string, guid: string, error: Error = null) {
    if (error) {
      console.log(error);
    } 
    this._modelLoadingProgress.next(0);
    this._modelLoadingEnd.next({url, guid, error});
  }

  private addModelToScene(gltf: GLTF, modelGuid: string, modelName: string) {
    if (!this._mainScene) {
      return;
    }

    const name = modelName || modelGuid;
    const scene = gltf.scene;
    scene.userData.guid = modelGuid;
    scene.name = name;

    const meshes: Mesh[] = [];
    const handles = new Set<string>();
    scene.traverse(x => {
      if (x instanceof Mesh) {
        const id = `${modelGuid}|${x.name}`;
        x.userData.id = id;
        x.userData.modelGuid = modelGuid;
        this.backupMeshMaterial(x);
        meshes.push(x);
        handles.add(x.name);
        if (this._loadedMeshesById.has(id)) {
          this._loadedMeshesById.get(id).push(x);
        } else {
          this._loadedMeshesById.set(id, [x]);
        }
        this.addMeshToPickingScene(x);
      }
    });

    this._mainScene.add(scene);
    this._loadedModelsByGuid.set(modelGuid, {gltf: gltf, meshes, handles, name});

    this.emitOpenedModelsChanged();  
    this.fitCameraToObjects([this._mainScene]);
    this.render();  
  }

  private removeModelFromScene(modelGuid: string) {
    if (!this._mainScene || !this._loadedModelsByGuid.has(modelGuid)) {
      return;
    }

    const modelData = this._loadedModelsByGuid.get(modelGuid);
    modelData.meshes.forEach(x => {      
      this._loadedMeshesById.delete(x.userData.id);
      this.removeMeshFromPickingScene(x);
    });

    this._highlightedMesh = null;
    this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    
    this._mainScene.remove(modelData.gltf.scene);
    this._loadedModelsByGuid.delete(modelGuid);

    this.emitOpenedModelsChanged();
    this.render();
  }

  private emitOpenedModelsChanged() {  
    const modelOpenedInfos: ModelOpenedInfo[] = [];
    for (const [ modelGuid, model ] of this._loadedModelsByGuid) {
      modelOpenedInfos.push({guid: modelGuid, name: model.name, handles: model.handles});
    } 
    this._openedModelsChange.next(modelOpenedInfos);
  }
  // #endregion

  // #region item selection/isolation
  private findMeshesByIds(ids: Set<string>): {found: Mesh[]; notFound: Set<string>} {
    const found: Mesh[] = [];
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
      this.refreshMeshMaterial(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh[this._isolProp] = undefined;
      this.refreshMeshMaterial(mesh);
    }
    this._isolatedMeshes.length = 0;
  }

  private selectMeshAtPoint(x: number, y: number, keepPreviousSelection = false) {    
    const position = this.getPickingPosition(x, y);
    const mesh = this.getItemAtPickingPosition(position);
    if (!mesh) {
      this.selectMeshes([], true);
      return;
    }

    if (keepPreviousSelection) {
      if (mesh[this._selProp]) {
        this.removeFromSelection(mesh);
      } else {        
        this.addToSelection(mesh);
      }
    } else {
      this.selectMeshes([mesh], true);
    }
  }

  private addToSelection(mesh: Mesh): boolean {   
    const meshes = [mesh, ...this._selectedMeshes];
    this.selectMeshes(meshes, true);
    return true;
  }

  private removeFromSelection(mesh: Mesh): boolean {
    const meshes = this._selectedMeshes.filter(x => x !== mesh);
    this.selectMeshes(meshes, true);
    return true;
  }
 
  private selectMeshes(meshes: Mesh[], manual: boolean, isolateSelected = false) { 
    this.removeSelection();
    this.removeIsolation();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual);
      return null;
    }
    
    meshes.forEach(x => {
      x[this._selProp] = true;
      this.refreshMeshMaterial(x);
    });

    if (isolateSelected) {
      this.isolateSelectedMeshes();
    }

    this._selectedMeshes = meshes;
    this.emitSelectionChanged(manual);
  }

  private isolateSelectedMeshes() {
    const loadedMeshes = [...this._loadedMeshesById.values()].flatMap(x => x);
    loadedMeshes.forEach(x => {
      if (!x[this._selProp]) {
        x[this._isolProp] = true;
        this.refreshMeshMaterial(x);
        this._isolatedMeshes.push(x);
      }
    });
  }

  private emitSelectionChanged(manual: boolean) { 
    if (!manual) {
      this.fitCameraToObjects(this._selectedMeshes);
    }
    this.render();  

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

  private highlightItem(mesh: Mesh) {
    if (mesh === this._highlightedMesh) {
      return;
    }

    this.removeHighlighting();
    if (mesh) {
      mesh[this._hlProp] = true;
      this.refreshMeshMaterial(mesh);
      this._highlightedMesh = mesh;
    }
    this.render();
  }

  private removeHighlighting() {
    if (this._highlightedMesh) {
      const mesh = this._highlightedMesh;
      mesh[this._hlProp] = undefined;
      this.refreshMeshMaterial(mesh);
      this._highlightedMesh = null;
    }
  }
  // #endregion

  // #region item coloring
  private colorMeshes(coloringInfos: {color: number; ids: string[]}[]) {
    this.removeColoring();

    if (coloringInfos?.length) {
      for (const info of coloringInfos) {
        const coloredMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{ 
          color: new Color(info.color), 
          emissive: new Color(0x000000),
          blending: NormalBlending,
          flatShading: true,
          side: DoubleSide,
          roughness: 1,
          metalness: 0,
        });
        info.ids.forEach(x => {
          const meshes = this._loadedMeshesById.get(x);
          if (meshes?.length) {
            meshes.forEach(y => {
              y[this._colProp] = true;
              y[this._colMatProp] = coloredMaterial;
              y.material = coloredMaterial;
              this._coloredMeshes.push(y);
            });
          }
        });
      }
    }

    this.render();
  }

  private removeColoring() {
    for (const mesh of this._coloredMeshes) {
      mesh[this._colProp] = undefined;
      this.refreshMeshMaterial(mesh);
    }
    this._coloredMeshes.length = 0;
  }
  // #endregion

  // #region materials
  private initSpecialMaterials() {
    const selectionMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{ 
      color: new Color(0xFF0000), 
      emissive: new Color(0xFF0000),
      blending: NormalBlending,
      flatShading: true,
      side: DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const highlightMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{ 
      color: new Color(0xFFFF00), 
      emissive: new Color(0x000000),
      blending: NormalBlending,
      flatShading: true,
      side: DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const isolateMaterial = new MeshPhysicalMaterial(<MeshPhysicalMaterial>{ 
      color: new Color(0x555555), 
      emissive: new Color(0x000000),
      blending: NormalBlending,
      flatShading: true,
      side: DoubleSide,
      roughness: 1,
      metalness: 0,
      opacity: 0.2,
      transparent: true,
    });

    this._selectionMaterial = selectionMaterial;
    this._highlightMaterial = highlightMaterial;
    this._isolationMaterial = isolateMaterial;
  }

  private backupMeshMaterial(mesh: Mesh) {    
    mesh[this._bakMatProp] = mesh.material;
  }

  private refreshMeshMaterial(mesh: Mesh) { 
    if (mesh[this._hlProp]) {      
      mesh.material = this._highlightMaterial;
    } else if (mesh[this._selProp]) {
      mesh.material = this._selectionMaterial;
    } else if (mesh[this._isolProp]) {      
      mesh.material = this._isolationMaterial;
    } else if (mesh[this._colProp]) {
      mesh.material = mesh[this._colMatProp];
    } else {
      mesh.material = mesh[this._bakMatProp];
    }
  }
  // #endregion  
}
