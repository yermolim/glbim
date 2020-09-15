import { Observable, Subscription, Subject, BehaviorSubject, AsyncSubject } from "rxjs";
import { first } from "rxjs/operators";

import { WebGLRenderer, NoToneMapping, sRGBEncoding,
  Object3D, Scene, Mesh, Color, MeshStandardMaterial, 
  Light, AmbientLight, HemisphereLight, DirectionalLight,
  BufferGeometry, Uint32BufferAttribute, Float32BufferAttribute } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

import { ResizeSensor } from "css-element-queries";

import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, ModelGeometryInfo, ModelFileInfo,
  MeshMergeType, MeshBgSm, RenderGeometry, ColoringInfo, PointerEventHelper } from "./common-types";
import { ColorRgbRmo, ColorRgbRmoUtils } from "./color-rgb-rmo";
import { PickingScene } from "./picking-scene";
import { CameraControls } from "./camera-controls";
import { GltfViewerOptions } from "./gltf-viewer-options";

export { ModelFileInfo, ModelOpenedInfo, GltfViewerOptions };

export class GltfViewer {
  // #region public observables
  loadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  openedModelsChange$: Observable<ModelOpenedInfo[]>;  
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>; 
  // #endregion  
  
  // #region private rx subjects
  private _loadingStateChange = new BehaviorSubject<boolean>(false);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<ModelLoadingInfo>();
  private _openedModelsChange = new BehaviorSubject<ModelOpenedInfo[]>([]);   
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();  
  // #endregion
  
  private _subscriptions: Subscription[] = [];

  // #region html container related fieds
  private _container: Element;
  private _containerResizeSensor: ResizeSensor;
  // #endregion

  // #region renderer related fieds
  private _renderer: WebGLRenderer;
  private _lights: Light[] = [];
  private _loader: GLTFLoader;
  
  private _colorRgbRmoUtils: ColorRgbRmoUtils;
  private _cameraControls: CameraControls;
  // #endregion

  // #region render scene
  private _renderMeshMergeType: MeshMergeType;
  private _renderScene: Scene;
  private _renderGeometries: RenderGeometry[] = [];
  private _renderGeometryIndexBySourceMesh = new Map<MeshBgSm, number>();
  private _sourceMeshesByRenderGeometryIndex = new Map<number, MeshBgSm[]>();
  private _sourceMeshesNeedColorUpdate = new Set<MeshBgSm>();
  private _renderGeometryIndicesNeedSort = new Set<number>();
  private _renderMeshBySourceMesh = new Map<MeshBgSm, MeshBgSm>();
  // #endregion

  // #region selection related fieds
  private _pointerEventHelper = PointerEventHelper.default;
  private _pickingScene: PickingScene;

  private _queuedColoring: ColoringInfo[] = null;
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;

  private _highlightedMesh: MeshBgSm = null;
  private _selectedMeshes: MeshBgSm[] = [];
  private _isolatedMeshes: MeshBgSm[] = [];
  private _coloredMeshes: MeshBgSm[] = [];
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

    this.init(new GltfViewerOptions(options));
  }

  init(options: GltfViewerOptions) {
    this.initObservables();

    this._pickingScene = new PickingScene();
    this._colorRgbRmoUtils = new ColorRgbRmoUtils(options);

    this.initLights(options); 
    this.initLoader(options); 
    this.initRenderer(options);

    this._cameraControls = new CameraControls(this._renderer.domElement, () => this.render());    
    this._containerResizeSensor = new ResizeSensor(this._container, () => {
      const { width, height } = this._container.getBoundingClientRect();
      this._cameraControls.resize(width, height);
      this.resizeRenderer(width, height);
    }); 

    this.addCanvasEventListeners(options);
    this.render();
  }

  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();

    this._containerResizeSensor?.detach();
    this._containerResizeSensor = null;    
    
    this._cameraControls?.destroy();
    this._cameraControls = null;

    this._pickingScene?.destroy();
    this._pickingScene = null;

    this._colorRgbRmoUtils?.destroy();
    this._colorRgbRmoUtils = null;

    this._loadedMeshes?.forEach(x => {
      x.geometry.dispose();
      x.material.dispose();
    });
    this._loadedMeshes = null;

    this._renderGeometries?.forEach(x => x.geometry.dispose());
    this._renderGeometries = null;
    this._renderScene = null;

    this._renderer?.dispose();
    this._loader?.dracoLoader?.dispose();    
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

  getOpenedModels(): ModelOpenedInfo[] {
    return this._openedModelsChange.getValue();
  }

  getSelectedItems(): Set<string> {
    return this._selectionChange.getValue();
  }
  // #endregion

  // #region rx
  private initObservables() {
    this.loadingStateChange$ = this._loadingStateChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.openedModelsChange$ = this._openedModelsChange.asObservable();
    this.selectionChange$ = this._selectionChange.asObservable();
    this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
  }

  private closeSubjects() {
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
      this.isolateSelectedMeshes();
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
    }, 30);
  };

  private addCanvasEventListeners(options: GltfViewerOptions) {
    const { highlightingEnabled } = options;

    this._renderer.domElement.addEventListener("pointerdown", this._onCanvasPointerDown);
    this._renderer.domElement.addEventListener("pointerup", this._onCanvasPointerUp);
    if (highlightingEnabled) {      
      this._renderer.domElement.addEventListener("mousemove", this._onCanvasMouseMove);
    }
  }
  // #endregion

  // #region renderer
  private initLights(options: GltfViewerOptions) {
    if (options.ambientLight) {
      const ambientLight = new AmbientLight(0x222222, 
        options.physicalLights 
          ? options.ambientLightIntensity * Math.PI 
          : options.ambientLightIntensity);
      this._lights.push(ambientLight);
    }
    if (options.hemiLight) {
      const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 
        options.physicalLights 
          ? options.hemiLightIntensity * Math.PI 
          : options.hemiLightIntensity);
      hemiLight.position.set(0, 2000, 0);
      this._lights.push(hemiLight);
    }    
    if (options.dirLight) {
      const dirLight = new DirectionalLight(0xffffff,
        options.physicalLights 
          ? options.dirLightIntensity * Math.PI 
          : options.dirLightIntensity);
      dirLight.position.set(-2, 10, 2);
      this._lights.push(dirLight);
    }
  }

  private initRenderer(options: GltfViewerOptions) {
    const { useAntialiasing, physicalLights, meshMergeType } = options;

    const renderer = new WebGLRenderer({
      alpha: true, 
      antialias: useAntialiasing,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = sRGBEncoding;
    renderer.physicallyCorrectLights = physicalLights;
    renderer.toneMapping = NoToneMapping;

    this._container.append(renderer.domElement);
    this._renderer = renderer;
    this._renderMeshMergeType = meshMergeType;
  }
  
  private resizeRenderer(width: number, height: number) {
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();      
    }
  }

  private async updateRenderSceneAsync(): Promise<void> {
    this._renderScene = null;

    const scene = new Scene();
    scene.add(...this._lights);     

    this._renderGeometries.forEach(x => x.geometry.dispose());
    this._renderGeometries.length = 0;
    this._renderGeometryIndexBySourceMesh.clear();   
    this._sourceMeshesByRenderGeometryIndex.clear(); 
    this._renderMeshBySourceMesh.clear();  
    this._renderGeometryIndicesNeedSort.clear();  

    if (this._renderMeshMergeType) {
      const grouppedMeshes = await this.groupModelMeshesByMergeType(this._loadedMeshesArray, 
        this._loadedModelsArray, this._renderMeshMergeType);
      for (const meshes of grouppedMeshes) {
        if (meshes.length) {
          const geometry = await this.buildRenderGeometryAsync(meshes);          
          this._renderGeometries.push(geometry);
          const i = this._renderGeometries.length - 1;
          this._sourceMeshesByRenderGeometryIndex.set(i, meshes);
          this._renderGeometryIndicesNeedSort.add(i);
          meshes.forEach(x => {
            this._renderGeometryIndexBySourceMesh.set(x, i);
          });
        }
      }
      this._renderGeometries.forEach(x => {    
        const mesh = new Mesh(x.geometry, this._colorRgbRmoUtils.globalMaterial);
        scene.add(mesh);
      });
    } else {
      this._loadedMeshesArray.forEach(sourceMesh => {
        const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
        const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
        const renderMesh = new Mesh(sourceMesh.geometry, material);
        renderMesh.applyMatrix4(sourceMesh.matrix);
        this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
        scene.add(renderMesh); 
      });
    } 

    this._renderScene = scene;
    this.render(this._loadedMeshesArray.length ? [this._renderScene] : null);
  }

  private async groupModelMeshesByMergeType(meshes: MeshBgSm[], models: ModelGeometryInfo[], 
    meshMergeType: MeshMergeType): Promise<MeshBgSm[][]> {

    let grouppedMeshes: MeshBgSm[][];
    switch (meshMergeType) {
      case "scene":
        grouppedMeshes = [meshes];
        break;
      case "model_uncapped":
        grouppedMeshes = models.map(x => x.meshes).filter(x => x.length);
        break;
      case "model_capped":
        grouppedMeshes = [];  
        const chunkSize = 1000;
        models.map(x => x.meshes).filter(x => x.length).forEach(x => {
          if (x.length <= chunkSize) {
            grouppedMeshes.push(x);
          } else {
            for (let i = 0; i < x.length; i += chunkSize) {
              const chunk = x.slice(i, i + chunkSize);
              grouppedMeshes.push(chunk);
            }
          }
        });
        break;
      default:
        grouppedMeshes = [];
    }   

    return grouppedMeshes;
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
          const rgbrmo = ColorRgbRmo.getFromMesh(x);
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

  private updateMeshRenderMaterials() {
    this._sourceMeshesNeedColorUpdate.forEach(sourceMesh => { 
      const { rgbRmo } = this._colorRgbRmoUtils.refreshMeshColors(sourceMesh);      
      const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
      const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
      renderMesh.material = material;
    });
  }

  private sortRenderGeometriesIndicesByOpacity() {
    this._renderGeometryIndicesNeedSort.forEach(i => {
      const meshes = this._sourceMeshesByRenderGeometryIndex.get(i);

      const opaqueMeshes: MeshBgSm[] = [];
      const transparentMeshes: MeshBgSm[] = [];
      meshes.forEach(x => {
        if (ColorRgbRmo.getFromMesh(x).opacity === 1) {
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
      const { rgbRmo, opacityChanged } = this._colorRgbRmoUtils
        .refreshMeshColors(mesh); 
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

  private render(focusObjects: Object3D[] = null) {
    if (!this._renderScene) {
      return;
    }

    if (focusObjects?.length) {
      this._cameraControls.focusCameraOnObjects(focusObjects);
    }

    if (this._sourceMeshesNeedColorUpdate.size) {
      if (this._renderMeshMergeType) {
        this.updateRenderGeometriesColors();
      } else {
        this.updateMeshRenderMaterials();
      }
      this._sourceMeshesNeedColorUpdate.clear();
    }

    if (this._renderGeometryIndicesNeedSort.size) {
      this.sortRenderGeometriesIndicesByOpacity();
      this._renderGeometryIndicesNeedSort.clear();
    }    

    requestAnimationFrame(() => { 
      this._renderer.render(this._renderScene, this._cameraControls.camera);
    });
  }
  // #endregion

  // #region loading models
  private initLoader(options: GltfViewerOptions) {
    const { dracoDecoderEnabled, dracoDecoderPath } = options;

    const loader = new GLTFLoader();

    if (dracoDecoderEnabled) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(dracoDecoderPath);
      dracoLoader.preload();
      loader.setDRACOLoader(dracoLoader);
    }

    this._loader = loader;
    this.processLoadingQueueAsync();
  }

  private async processLoadingQueueAsync(): Promise<void> {
    if (!this._renderer || !this._loader || this._loadingInProgress) {
      return;
    }  

    this._loadingInProgress = true;  
    this._loadingStateChange.next(true);

    while (this._loadingQueue.length > 0) {
      const action = this._loadingQueue.shift();
      await action();
    } 
    
    this.runQueuedColoring();
    this.runQueuedSelection();
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
      this._pickingScene.remove(x);
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
  private runQueuedColoring() {
    if (this._queuedColoring) {
      this.resetSelectionAndColorMeshes(this._queuedColoring);
    }
  }

  private resetSelectionAndColorMeshes(coloringInfos: ColoringInfo[]) {    
    this.removeIsolation();
    this.removeSelection();

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
              this._sourceMeshesNeedColorUpdate.add(mesh);
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
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._coloredMeshes.length = 0;
  }
  // #endregion

  // #region item selection/isolation    
  private getMeshAt(clientX: number, clientY: number): MeshBgSm {   
    return this._pickingScene
      ? this._pickingScene.getMeshAt(this._cameraControls.camera, this._renderer, clientX, clientY)
      : null;
  }
  
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
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private removeIsolation() {
    for (const mesh of this._isolatedMeshes) {
      mesh.userData.isolated = undefined;
      this._sourceMeshesNeedColorUpdate.add(mesh);
    }
    this._isolatedMeshes.length = 0;
  }

  private selectMeshAtPoint(x: number, y: number, keepPreviousSelection: boolean) {
    const mesh = this.getMeshAt(x, y);
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
      
    this.removeSelection();
    this.removeIsolation();

    if (!meshes?.length) {
      this.emitSelectionChanged(manual, true);
      return null;
    }
    
    meshes.forEach(x => {
      x.userData.selected = true;
      this._sourceMeshesNeedColorUpdate.add(x);
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
        this._sourceMeshesNeedColorUpdate.add(x);
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
  private highlightMeshAtPoint(x: number, y: number) { 
    const mesh = this.getMeshAt(x, y);  
    this.highlightItem(mesh);
  }

  private highlightItem(mesh: MeshBgSm) {
    if (mesh === this._highlightedMesh) {
      return;
    }

    this.removeHighlighting();
    if (mesh) {
      mesh.userData.highlighted = true;
      this._sourceMeshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = mesh;
    }
    this.render();
  }

  private removeHighlighting() {
    if (this._highlightedMesh) {
      const mesh = this._highlightedMesh;
      mesh.userData.highlighted = undefined;
      this._sourceMeshesNeedColorUpdate.add(mesh);
      this._highlightedMesh = null;
    }
  }
  // #endregion
}
