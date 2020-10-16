import { Observable, Subscription, Subject, BehaviorSubject, AsyncSubject } from "rxjs";
import { first } from "rxjs/operators";

import { WebGLRenderer, NoToneMapping, sRGBEncoding,
  Object3D, Mesh, Color, MeshStandardMaterial, BufferGeometry, SphereBufferGeometry, MeshBasicMaterial, Vector3 } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

import { ResizeSensor } from "css-element-queries";

import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, ModelGeometryInfo, ModelFileInfo,
  MeshBgSm, ColoringInfo, PointerEventHelper, Distance, Vec4 } from "./common-types";
import { GltfViewerOptions } from "./gltf-viewer-options";
import { ColorRgbRmo } from "./helpers/color-rgb-rmo";
import { CameraControls } from "./components/camera-controls";
import { Lights } from "./components/lights";
import { Axes } from "./components/axes";
import { RenderScene } from "./scenes/render-scene";
import { SimplifiedScene } from "./scenes/simplified-scene";
import { PickingScene } from "./scenes/picking-scene";
import { HudScene } from "./scenes/hud-scene";

export { GltfViewerOptions, ModelFileInfo, ModelOpenedInfo, Distance, Vec4 };

export class GltfViewer {
  // #region public observables
  optionsChange$: Observable<GltfViewerOptions>;
  loadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  openedModelsChange$: Observable<ModelOpenedInfo[]>;  
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>; 
  lastFrameTime$: Observable<number>;
  snapPointChange$: Observable<Vec4>;
  distanceMeasureChange$: Observable<Distance>;
  // #endregion  
  
  // #region private rx subjects
  private _optionsChange = new BehaviorSubject<GltfViewerOptions>(null);
  private _loadingStateChange = new BehaviorSubject<boolean>(false);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<ModelLoadingInfo>();
  private _openedModelsChange = new BehaviorSubject<ModelOpenedInfo[]>([]);  
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();  
  private _lastFrameTime = new BehaviorSubject<number>(0);  
  private _snapPointChange = new Subject<Vec4>();  
  private _distanceMeasureChange = new Subject<Distance>();  
  // #endregion
  
  private _subscriptions: Subscription[] = [];
  
  private _container: Element;
  private _containerResizeSensor: ResizeSensor;
  private _options: GltfViewerOptions;  

  // #region rendering related fields
  private _renderer: WebGLRenderer;
  private _deferRender: number;

  private _cameraControls: CameraControls; 
  private _lights: Lights; 

  private _renderScene: RenderScene; 
  private _simplifiedScene: SimplifiedScene; 

  private _meshesNeedColorUpdate = new Set<MeshBgSm>();
  // #endregion

  // #region selection/highlighting related fieds
  private _pointerEventHelper = PointerEventHelper.default;
  private _pickingScene: PickingScene;

  private _queuedColoring: ColoringInfo[] = null;
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;

  private _highlightedMesh: MeshBgSm = null;
  private _selectedMeshes: MeshBgSm[] = [];
  private _isolatedMeshes: MeshBgSm[] = [];
  private _coloredMeshes: MeshBgSm[] = [];
  // #endregion  

  // #region private hud
  private _hudScene: HudScene; 
  private _axes: Axes;  
  
  private _measureMode = false;
  // #endregion

  // #region loading models related fieds
  private _loader: GLTFLoader;  

  private _loadingInProgress = false;
  private _loadingQueue: (() => Promise<void>)[] = [];

  private _loadedModels = new Set<ModelGeometryInfo>();
  private _loadedModelsByGuid = new Map<string, ModelGeometryInfo>();
  private _loadedModelsArray: ModelGeometryInfo[] = [];

  private _loadedMeshes = new Set<MeshBgSm>();
  private _loadedMeshesById = new Map<string, MeshBgSm[]>();
  private _loadedMeshesArray: MeshBgSm[] = [];
  // #endregion

  constructor(containerId: string, dracoDecoderPath: string, options: GltfViewerOptions) {
    this.initObservables();

    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error("Container not found!");
    }

    this._options = new GltfViewerOptions(options);  
    this._optionsChange.next(this._options);

    this._lights = new Lights(this._options.usePhysicalLights, 
      this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity); 
    this._pickingScene = new PickingScene();
    this._renderScene = new RenderScene(this._options.isolationColor, this._options.isolationOpacity,
      this._options.selectionColor, this._options.highlightColor);
    this._simplifiedScene = new SimplifiedScene();

    this.initLoader(dracoDecoderPath);
    this.initRenderer();
    
    this._hudScene = new HudScene(this._renderer);
    this._axes = new Axes();
 
    this._containerResizeSensor = new ResizeSensor(this._container, () => {
      this.resizeRenderer();
    }); 
  }

  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();  

    this._loader?.dracoLoader?.dispose();  
    
    this._containerResizeSensor?.detach();
    this._containerResizeSensor = null;
    
    this._cameraControls?.destroy();
    this._cameraControls = null;

    this._axes?.destroy();
    this._axes = null;

    this._hudScene?.destroy();
    this._hudScene = null;

    this._pickingScene?.destroy();
    this._pickingScene = null;
    
    this._simplifiedScene?.destroy();
    this._simplifiedScene = null;

    this._renderScene?.destroy();
    this._renderScene = null;   

    this._loadedMeshes?.forEach(x => {
      x.geometry.dispose();
      x.material.dispose();
    });
    this._loadedMeshes = null;  

    this._renderer?.dispose();
  }

  // #region public interaction 
  async updateOptionsAsync(options: GltfViewerOptions): Promise<GltfViewerOptions> {
    const oldOptions = this._options;
    this._options = new GltfViewerOptions(options);

    let rendererReinitialized = false;
    let lightsUpdated = false;
    let colorsUpdated = false;
    let materialsUpdated = false;
    let sceneUpdated = false;

    if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {
      this.initRenderer();
      rendererReinitialized = true;
    }
    
    if (this._options.usePhysicalLights !== oldOptions.usePhysicalLights
        || this._options.ambientLightIntensity !== oldOptions.ambientLightIntensity
        || this._options.hemiLightIntensity !== oldOptions.hemiLightIntensity
        || this._options.dirLightIntensity !== oldOptions.dirLightIntensity) {
      this._renderer.physicallyCorrectLights = this._options.usePhysicalLights;
      this._lights.update(this._options.usePhysicalLights, this._options.ambientLightIntensity,
        this._options.hemiLightIntensity, this._options.dirLightIntensity);
      lightsUpdated = true;
    }  

    if (this._options.isolationColor !== oldOptions.isolationColor
        || this._options.isolationOpacity !== oldOptions.isolationOpacity
        || this._options.selectionColor !== oldOptions.selectionColor
        || this._options.highlightColor !== oldOptions.highlightColor) {      
      this._renderScene.updateCommonColors(this._options.isolationColor, this._options.isolationOpacity,
        this._options.selectionColor, this._options.highlightColor);
      colorsUpdated = true;
    }

    if (rendererReinitialized || lightsUpdated || colorsUpdated) {
      this._renderScene.updateSceneMaterials();
      this._simplifiedScene.updateSceneMaterials();
      materialsUpdated = true;
    }

    if (this._options.meshMergeType !== oldOptions.meshMergeType
        || this._options.fastRenderType !== oldOptions.fastRenderType) {
      await this.updateRenderSceneAsync();
      sceneUpdated = true;
    }

    if (this._options.showAxesHelper !== oldOptions.showAxesHelper
      && !(materialsUpdated || sceneUpdated)) {
      this.render();
    }
    

    if (this._options.highlightingEnabled !== oldOptions.highlightingEnabled) {
      if (this._options.highlightingEnabled) {        
        this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
      } else {
        this._renderer.domElement.removeEventListener("mousemove", this.onCanvasMouseMove);
      }
    }

    this._optionsChange.next(this._options);  
    return this._options;
  }

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

    this.findAndSelectMeshes(ids, false);
  };

  isolateItems(ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loadingInProgress) {
      this._queuedSelection = {ids, isolate: true};
      return;
    }

    this.findAndSelectMeshes(ids, true);
  };

  zoomToItems(ids: string[]) {
    if (ids?.length) {
      const { found } = this.findMeshesByIds(new Set<string>(ids));     
      if (found.length) {
        this.render(found);
        return;
      }
    }
    this.renderWholeScene();
  }

  toggleMeasureMode(value: boolean) {
    if (this._measureMode === value) {
      return;
    }
    if (this._measureMode) {
      this.clearMeasureMarkers();
      this._measureMode = false;
    } else {
      this._measureMode = true;
    }
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
    this.optionsChange$ = this._optionsChange.asObservable();
    this.loadingStateChange$ = this._loadingStateChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.openedModelsChange$ = this._openedModelsChange.asObservable();
    this.selectionChange$ = this._selectionChange.asObservable();
    this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
    this.lastFrameTime$ = this._lastFrameTime.asObservable();
    this.snapPointChange$ = this._snapPointChange.asObservable();
    this.distanceMeasureChange$ = this._distanceMeasureChange.asObservable();
  }

  private closeSubjects() {
    this._optionsChange.complete();
    this._loadingStateChange.complete();
    this._modelLoadingStart.complete();
    this._modelLoadingProgress.complete();
    this._modelLoadingEnd.complete();
    this._openedModelsChange.complete();   
    this._selectionChange.complete();
    this._manualSelectionChange.complete();
    this._lastFrameTime.complete();
    this._snapPointChange.complete();
    this._distanceMeasureChange.complete();
  }
  // #endregion

  // #region canvas event handlers 
  private onCanvasPointerDown = (e: PointerEvent) => {
    this._pointerEventHelper.downX = e.clientX;
    this._pointerEventHelper.downY = e.clientY;
  };

  private onCanvasPointerUp = (e: PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    if (!this._pointerEventHelper.downX 
      || Math.abs(x - this._pointerEventHelper.downX) > this._pointerEventHelper.maxDiff
      || Math.abs(y - this._pointerEventHelper.downY) > this._pointerEventHelper.maxDiff) {
      return;
    }

    if (this._measureMode) {
      this.setDistanceMarkerAtPoint(x, y);
    } else {
      if (this._pointerEventHelper.waitForDouble) {
        this.isolateSelectedMeshes();
        this._pointerEventHelper.waitForDouble = false;
      } else {
        this._pointerEventHelper.waitForDouble = true;
        setTimeout(() => {
          this._pointerEventHelper.waitForDouble = false;
        }, 300);
        this.selectMeshAtPoint(x, y, e.ctrlKey);
      }
    }

    this._pointerEventHelper.downX = null;
    this._pointerEventHelper.downY = null;
  };

  private onCanvasMouseMove = (e: MouseEvent) => {   
    if (e.buttons) {
      return;
    } 

    clearTimeout(this._pointerEventHelper.mouseMoveTimer);
    this._pointerEventHelper.mouseMoveTimer = null;
    this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
      const x = e.clientX;
      const y = e.clientY;
      this.highlightMeshAtPoint(x, y);

      if (this._measureMode) {
        this.setSnapMarkerAtPoint(x, y);
      }
    }, 30);
  };

  private addCanvasEventListeners() {
    const { highlightingEnabled } = this._options;

    this._renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerDown);
    this._renderer.domElement.addEventListener("pointerup", this.onCanvasPointerUp);
    if (highlightingEnabled) {      
      this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
    }
  }
  // #endregion

  // #region renderer
  private initRenderer() {    
    if (this._renderer) {
      this._renderer.domElement.remove();
      this._renderer.dispose();
      this._renderer.forceContextLoss();
      this._renderer = null;
    }

    const { useAntialiasing, usePhysicalLights } = this._options;

    const renderer = new WebGLRenderer({
      alpha: true, 
      antialias: useAntialiasing,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = sRGBEncoding;
    renderer.toneMapping = NoToneMapping;
    renderer.physicallyCorrectLights = usePhysicalLights;

    this._renderer = renderer;
    this.resizeRenderer();
    this.addCanvasEventListeners();

    if (this._cameraControls) {      
      this._cameraControls.changeCanvas(this._renderer.domElement);
    } else {
      this._cameraControls = new CameraControls(this._renderer.domElement, () => this.renderOnCameraMove()); 
    } 
    
    this._container.append(this._renderer.domElement);
  }
  
  private resizeRenderer() {
    const { width, height } = this._container.getBoundingClientRect();
    this._cameraControls?.resize(width, height);
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();   
    }
  }

  private async updateRenderSceneAsync(): Promise<void> {
    await this._renderScene.updateSceneAsync(this._lights.getLights(), this._loadedMeshesArray, this._loadedModelsArray,
      this._options.meshMergeType);
      
    if (this._options.fastRenderType) {
      await this._simplifiedScene.updateSceneAsync(this._lights.getCopy(), this._loadedMeshesArray, 
        this._options.fastRenderType);
    } else {
      this._simplifiedScene.clearScene();
    }

    this.renderWholeScene();
  }

  private prepareToRender(focusObjects: Object3D[] = null) {
    if (focusObjects?.length) {
      this._cameraControls.focusCameraOnObjects(focusObjects);
    }

    if (this._meshesNeedColorUpdate.size) {
      this._renderScene.updateMeshColors(this._meshesNeedColorUpdate);
      this._meshesNeedColorUpdate.clear();
    }  
  }

  private render(focusObjects: Object3D[] = null, fast = false) {
    this.prepareToRender(focusObjects);
    requestAnimationFrame(() => { 
      if (!this._renderer) {
        return;
      }

      const start = performance.now();

      if (fast && this._simplifiedScene?.scene) {
        this._renderer.render(this._simplifiedScene.scene, this._cameraControls.camera);
      } else if (this._renderScene?.scene) {
        this._renderer.render(this._renderScene.scene, this._cameraControls.camera);
      }
      if (this._measureMode && this._hudScene) {
        this._hudScene.render(this._cameraControls.camera, this._renderer);
      }
      if (this._options.showAxesHelper && this._axes) {
        this._axes.render(this._cameraControls.camera, this._renderer);
      }
      
      const frameTime = performance.now() - start;
      this._lastFrameTime.next(frameTime);
    });
  }  

  private renderWholeScene() {    
    this.render(this._loadedMeshesArray.length ? [this._renderScene.scene] : null);
  }

  private renderOnCameraMove() {
    if (this._options.fastRenderType) {
      if (this._deferRender) {
        clearTimeout(this._deferRender);
        this._deferRender = null;
      }
      this.render(null, true);
      this._deferRender = window.setTimeout(() => {
        this._deferRender = null;
        this.render();
      }, 300);
    } else {
      this.render();
    }
  }
  // #endregion

  // #region loading models
  private initLoader(dracoDecoderPath: string) {
    const loader = new GLTFLoader();
    if (dracoDecoderPath) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(dracoDecoderPath);
      dracoLoader.preload();
      loader.setDRACOLoader(dracoLoader);
    }
    this._loader = loader;
  }

  private async processLoadingQueueAsync(): Promise<void> {
    if (!this._loader 
        || this._loadingInProgress 
        || !this._loadingQueue.length) {
      return;
    }

    this._loadingInProgress = true;  
    this._loadingStateChange.next(true);

    while (this._loadingQueue.length > 0) {
      const action = this._loadingQueue.shift();
      await action();
    } 
    
    this.updateModelsDataArrays();    
    this.runQueuedColoring();
    this.runQueuedSelection();
    await this.updateRenderSceneAsync();

    this.emitOpenedModelsChanged();
    this._loadingStateChange.next(false);
    this._loadingInProgress = false;

    // run loop once more to check queue update while awaiting this.updateRenderSceneAsync()
    await this.processLoadingQueueAsync(); 
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

        this._pickingScene.add(x);
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
  }

  private removeModelFromLoaded(modelGuid: string) {
    if (!this._loadedModelsByGuid.has(modelGuid)) {
      return;
    }

    const modelData = this._loadedModelsByGuid.get(modelGuid);
    modelData.meshes.forEach(x => {  
      this._loadedMeshes.delete(x); 
      this._loadedMeshesById.delete(x.userData.id);
      this._pickingScene.remove(x);
      x.geometry?.dispose();
    });

    this._highlightedMesh = null;
    this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    
    this._loadedModels.delete(modelData);
    this._loadedModelsByGuid.delete(modelGuid);
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
  private runQueuedColoring() {
    if (this._queuedColoring) {
      this.resetSelectionAndColorMeshes(this._queuedColoring);
    }
  }

  private resetSelectionAndColorMeshes(coloringInfos: ColoringInfo[]) {    
    this.resetSelection();
    this.colorMeshes(coloringInfos);
  }

  private colorMeshes(coloringInfos: ColoringInfo[]) {
    this.removeColoring();

    if (coloringInfos?.length) {
      for (const info of coloringInfos) {
        const color = new Color(info.color);
        const customColor = new ColorRgbRmo(color.r, color.g, color.b, 1, 0, info.opacity);
        info.ids.forEach(x => {
          const meshes = this._loadedMeshesById.get(x);
          if (meshes?.length) {
            meshes.forEach(mesh => {
              mesh.userData.colored = true;
              ColorRgbRmo.setCustomToMesh(mesh, customColor);
              this._meshesNeedColorUpdate.add(mesh);
              this._coloredMeshes.push(mesh);
            });
          }
        });
      }
    }

    this.render();
  }

  private removeColoring() {
    for (const mesh of this._coloredMeshes) {
      mesh.userData.colored = undefined;
      ColorRgbRmo.deleteFromMesh(mesh, true);
      this._meshesNeedColorUpdate.add(mesh);
    }
    this._coloredMeshes.length = 0;
  }
  // #endregion

  // #region item picking 
  private getMeshAt(clientX: number, clientY: number): MeshBgSm {   
    return this._renderer && this._pickingScene
      ? this._pickingScene.getSourceMeshAt(this._cameraControls.camera, this._renderer, clientX, clientY)
      : null;
  }
  // #endregion
  
  // #region item selection/isolation   
  private runQueuedSelection() {    
    if (this._queuedSelection) {
      const { ids, isolate } = this._queuedSelection;
      this.findAndSelectMeshes(ids, isolate);
    }
  }

  private findAndSelectMeshes(ids: string[], isolate: boolean) {    
    const { found } = this.findMeshesByIds(new Set<string>(ids));
    if (found.length) {
      this.selectMeshes(found, false, isolate);
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
      mesh.userData.selected = undefined;
      this._meshesNeedColorUpdate.add(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh.userData.isolated = undefined;
      this._meshesNeedColorUpdate.add(mesh);
    }
    this._isolatedMeshes.length = 0;
  }

  private resetSelection() {    
    this.removeSelection();
    this.removeIsolation();
  }

  private selectMeshAtPoint(clientX: number, clientY: number, keepPreviousSelection: boolean) {
    const mesh = this.getMeshAt(clientX, clientY);
    if (!mesh) {
      this.selectMeshes([], true, false);
      return;
    }

    if (keepPreviousSelection) {
      if (mesh.userData.selected) {
        this.removeFromSelection(mesh);
      } else {        
        this.addToSelection(mesh);
      }
    } else {
      this.selectMeshes([mesh], true, false);
    }
  }

  private addToSelection(mesh: MeshBgSm): boolean {   
    const meshes = [mesh, ...this._selectedMeshes];
    this.selectMeshes(meshes, true, false);
    return true;
  }

  private removeFromSelection(mesh: Mesh): boolean {
    const meshes = this._selectedMeshes.filter(x => x !== mesh);
    this.selectMeshes(meshes, true, false);
    return true;
  }
 
  private selectMeshes(meshes: MeshBgSm[], 
    manual: boolean, isolateSelected: boolean) { 
      
    this.resetSelection();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual, true);
      return null;
    }
    
    meshes.forEach(x => {
      x.userData.selected = true;
      this._meshesNeedColorUpdate.add(x);
    });


    this._selectedMeshes = meshes;
    if (isolateSelected) {
      this.emitSelectionChanged(manual, false);
      this.isolateSelectedMeshes();
    } else {
      this.emitSelectionChanged(manual, true);
    }
  }

  private isolateSelectedMeshes() {
    if (!this._selectedMeshes.length) {
      return;
    }

    this._loadedMeshesArray.forEach(x => {
      if (!x.userData.selected) {
        x.userData.isolated = true;
        this._meshesNeedColorUpdate.add(x);
        this._isolatedMeshes.push(x);
      }
    }); 
    this.render(this._selectedMeshes);
  }

  private emitSelectionChanged(manual: boolean, render: boolean) {
    if (render) {
      this.render(manual ? null : this._selectedMeshes);
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
  private highlightMeshAtPoint(clientX: number, clientY: number) { 
    const mesh = this.getMeshAt(clientX, clientY);  
    this.highlightItem(mesh);
  }

  private highlightItem(mesh: MeshBgSm) {
    if (mesh === this._highlightedMesh) {
      return;
    }

    this.removeHighlighting();
    if (mesh) {
      mesh.userData.highlighted = true;
      this._meshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = mesh;
    }
    this.render();
  }

  private removeHighlighting() {
    if (this._highlightedMesh) {
      const mesh = this._highlightedMesh;
      mesh.userData.highlighted = undefined;
      this._meshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = null;
    }
  }
  // #endregion

  // #region measurements 
  private setSnapMarkerAtPoint(clientX: number, clientY: number) {    
    if (!this._renderer || !this._pickingScene) {
      return;
    } 

    const pickingMesh = this._pickingScene.getPickingMeshAt(this._cameraControls.camera,
      this._renderer, clientX, clientY);
    const snapPoint = this._hudScene.setSnapMarker(this._cameraControls.camera,
      this._renderer, pickingMesh, clientX, clientY);

    this.render(); 
    this._snapPointChange.next(snapPoint);
  }

  private setDistanceMarkerAtPoint(clientX: number, clientY: number) { 
    if (!this._renderer || !this._pickingScene) {
      return;
    } 
    
    const pickingMesh = this._pickingScene.getPickingMeshAt(this._cameraControls.camera,
      this._renderer, clientX, clientY);
    const distance = this._hudScene.setDistanceMarker(this._cameraControls.camera,
      this._renderer, pickingMesh, clientX, clientY);
    
    this.render(); 
    this._distanceMeasureChange.next(distance);
  }

  private clearMeasureMarkers() {
    this._hudScene.resetMeasureMarkers();

    this.render();
    this._distanceMeasureChange.next(null);
  }
  // #endregion
}
