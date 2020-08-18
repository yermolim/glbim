import { Observable, Subscription, Subject, BehaviorSubject } from "rxjs";

import THREE from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { ResizeSensor } from "css-element-queries";

export class GltfViewerOptions {
  dracoDecoderEnabled = true;
  dracoDecoderPath = "/assets/draco/";  
  
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
  modelLoadingStart$: Observable<{url: string; guid: string}>;
  modelLoadingProgress$: Observable<number>;
  modelLoadingEnd$: Observable<{url: string; guid: string; error: Error}>;
  openedModelsChange$: Observable<Map<string, {name: string; handles: Set<string>}>>;  
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>; 
  // #endregion  
  
  // #region private rx subjects
  private _initialized = new BehaviorSubject<boolean>(false);
  private _modelLoadingStateChange = new Subject<boolean>();
  private _modelLoadingStart = new Subject<{url: string; guid: string}>();
  private _modelLoadingProgress = new Subject<number>();
  private _modelLoadingEnd = new Subject<{url: string; guid: string; error: Error}>();
  private _openedModelsChange = new Subject<Map<string, {name: string; handles: Set<string>}>>();   
  private _selectionChange = new Subject<Set<string>>();
  private _manualSelectionChange = new Subject<Set<string>>();  
  // #endregion

  // #region readonly fields
  private readonly _bakMatProp = "materialBackup";
  private readonly _selectedProp = "selected";
  private readonly _isolatedProp = "isolated";
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
  private _renderer: THREE.WebGLRenderer;
  private _mainScene: THREE.Scene;
  private _loader: GLTFLoader;
  private _camera: THREE.PerspectiveCamera;
  private _orbitControls: OrbitControls;
  // #endregion

  // #region materials related fieds
  private _selectionMaterial: THREE.Material;
  private _isolateMaterial: THREE.Material;
  private _highlightMaterial: THREE.Material;
  // #endregion

  // #region selection related fieds
  private _selectedMeshes: THREE.Mesh[] = [];
  private _isolatedMeshes: THREE.Mesh[] = [];
  private _highlightedMesh: THREE.Mesh;

  private _pickingTarget: THREE.WebGLRenderTarget;
  private _pickingScene: THREE.Scene;
  private _pickingColorToMesh = new Map<string, THREE.Mesh>();
  private _lastPickingColor = 0;

  private _pointerEventHelper: {
    downX: number; 
    downY: number; 
    maxDiff: number; 
    waitForDouble: boolean;
  } = { downX: null, downY: null, maxDiff: 10, waitForDouble: false };
  // #endregion

  // #region model loading related fieds
  private _loadingInProgress = false;
  private _loadingQueue: {url: string; guid: string; name: string}[] = [];
  private _loadedModelsByGuid = new Map<string, {gltf: GLTF; meshes: THREE.Mesh[]; handles: Set<string>; name: string}>();
  private _loadedMeshesById = new Map<string, THREE.Mesh[]>();
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
  openModel(modelInfo: {url: string; guid: string; name: string}) {
    if (modelInfo?.guid) {
      this._loadingQueue.push(modelInfo);
      this.loadQueuedModelsAsync();
    }
  };

  closeModel(modelGuid: string) {
    if (modelGuid) {
      this.removeModelFromScene(modelGuid);
    }
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
      this.selectMeshAtPoint(x, y);
    }

    this._pointerEventHelper.downX = null;
    this._pointerEventHelper.downY = null;
  };
  // #endregion

  // #region renderer base
  private initRendererWithScene() {
    const scene = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0x222222, 1);
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
    hemiLight.translateY(2000);
    scene.add(ambientLight);
    scene.add(hemiLight);
    
    const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    renderer.setSize(this._containerWidth, this._containerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = false;
    renderer.toneMapping = THREE.NoToneMapping;

    const camera = new THREE.PerspectiveCamera(75, this._containerWidth / this._containerHeight, 0.01, 10000);    
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

  private initSpecialMaterials() {
    const selectionMaterial = new THREE.MeshPhysicalMaterial(<THREE.MeshPhysicalMaterial>{ 
      color: new THREE.Color(0xFF0000), 
      emissive: new THREE.Color(0xFF0000),
      blending: THREE.NormalBlending,
      flatShading: true,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const highlightMaterial = new THREE.MeshPhysicalMaterial(<THREE.MeshPhysicalMaterial>{ 
      color: new THREE.Color(0xFFFF00), 
      emissive: new THREE.Color(0x000000),
      blending: THREE.NormalBlending,
      flatShading: true,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const isolateMaterial = new THREE.MeshPhysicalMaterial(<THREE.MeshPhysicalMaterial>{ 
      color: new THREE.Color(0x555555), 
      emissive: new THREE.Color(0x000000),
      blending: THREE.NormalBlending,
      flatShading: true,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      opacity: 0.2,
      transparent: true,
    });

    this._selectionMaterial = selectionMaterial;
    this._highlightMaterial = highlightMaterial;
    this._isolateMaterial = isolateMaterial;
  }
  
  private render() {
    if (this._renderer) {
      requestAnimationFrame(() => this._renderer.render(this._mainScene, this._camera));
    }
  }
  
  private fitCameraToObjects(objects: THREE.Object3D[], offset = 1.2 ) { 
    if (!objects?.length) {
      return;
    }
    
    const box = new THREE.Box3();    
    for (const object of objects) {
      box.expandByObject(object);
    }      
    
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
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
    const pickingTarget = new THREE.WebGLRenderTarget(1, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);

    this._pickingTarget = pickingTarget;
    this._pickingScene = scene;

    this._renderer.domElement.addEventListener("pointerdown", this._onCanvasPointerDown);
    this._renderer.domElement.addEventListener("pointerup", this._onCanvasPointerUp);
  }
  
  private nextPickingColor(): number {
    return ++this._lastPickingColor;
  } 

  private addMeshToPickingScene(mesh: THREE.Mesh) {
    const pickingMeshMaterial = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(this.nextPickingColor()), 
      emissive: new THREE.Color(this._lastPickingColor),
      blending: THREE.NoBlending,
      flatShading: true,
      side: THREE.DoubleSide,
      
      roughness: 1,
      metalness: 0,
    });
    const colorString = this._lastPickingColor.toString(16);
    
    const pickingMesh = new THREE.Mesh(mesh.geometry, pickingMeshMaterial);
    pickingMesh.userData.originalUuid = mesh.uuid;
    pickingMesh.userData.color = colorString;
    pickingMesh.position.copy(mesh.position);
    pickingMesh.rotation.copy(mesh.rotation);
    pickingMesh.scale.copy(mesh.scale);

    this._pickingScene.add(pickingMesh);
    this._pickingColorToMesh.set(colorString, mesh);
  }

  private removeMeshFromPickingScene(mesh: THREE.Mesh) {
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

  private getItemAtPickingPosition(position: {x: number; y: number}): THREE.Mesh {
    const pixelRatio = this._renderer.getPixelRatio();
    this._camera.setViewOffset(
      this._renderer.getContext().drawingBufferWidth,
      this._renderer.getContext().drawingBufferHeight,
      position.x * pixelRatio || 0,
      position.y * pixelRatio || 0,
      1, 1);
    const light = new THREE.DirectionalLight(0xFFFFFF, 1);
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

    this._loadingInProgress = false;
    this._modelLoadingStateChange.next(false);
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

    const meshes: THREE.Mesh[] = [];
    const handles = new Set<string>();
    scene.traverse(x => {
      if (x instanceof THREE.Mesh) {
        const id = `${modelGuid}|${x.name}`;
        x.userData.id = id;
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
    
    this._mainScene.remove(modelData.gltf.scene);
    this._loadedModelsByGuid.delete(modelGuid);

    this.emitOpenedModelsChanged();
    this.render();
  }

  private emitOpenedModelsChanged() {  
    const openedModelsMap = new Map<string, {name: string; handles: Set<string>}>();
    for (const [ modelGuid, model ] of this._loadedModelsByGuid) {
      openedModelsMap.set(modelGuid, { name: model.name, handles: model.handles});
    } 
    this._openedModelsChange.next(openedModelsMap);
  }
  // #endregion

  // #region item selection
  private findMeshesByIds(ids: Set<string>): {found: THREE.Mesh[]; notFound: Set<string>} {
    const found: THREE.Mesh[] = [];
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
      mesh.material = mesh[this._bakMatProp];
      mesh[this._selectedProp] = undefined;
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh.material = mesh[this._bakMatProp];
      mesh[this._isolatedProp] = undefined;
    }
    this._isolatedMeshes.length = 0;
  }

  private selectMeshAtPoint(x: number, y: number) {    
    const position = this.getPickingPosition(x, y);
    const mesh = this.getItemAtPickingPosition(position);    
    if (mesh) {
      this.selectMeshes([mesh], true);
    } else {
      this.selectMeshes([], true);
    }
  }

  private addToSelection(mesh: THREE.Mesh): boolean {    
    if (!mesh || this._selectedMeshes.includes(mesh)) {
      return false;
    }

    const meshes = [mesh, ...this._selectedMeshes];
    this.selectMeshes(meshes, true);
    return true;
  }

  private removeFromSelection(mesh: THREE.Mesh): boolean {        
    if (!mesh || !this._selectedMeshes.includes(mesh)) {
      return false;
    }

    const meshes = this._selectedMeshes.filter(x => x !== mesh);
    this.selectMeshes(meshes, true);
    return true;
  }
 
  private selectMeshes(meshes: THREE.Mesh[], manual: boolean, isolateSelected = false) { 
    this.removeSelection();
    this.removeIsolation();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual);
      return null;
    }
    
    meshes.forEach(x => {
      if (!x[this._bakMatProp]) {
        x[this._bakMatProp] = x.material;
      }
      x[this._selectedProp] = true;
      x.material = this._selectionMaterial;
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
      if (!x[this._selectedProp]) {
        if (!x[this._bakMatProp]) {
          x[this._bakMatProp] = x.material;
        }
        x[this._isolatedProp] = true;
        x.material = this._isolateMaterial;
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
}
