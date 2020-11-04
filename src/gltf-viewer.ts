import { Observable, Subscription, Subject, BehaviorSubject } from "rxjs";
import { WebGLRenderer, NoToneMapping, sRGBEncoding, Object3D, Mesh, Color, Vector3 } from "three";

import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, ModelFileInfo,
  MeshBgSm, ColoringInfo, PointerEventHelper, ViewerInteractionMode,
  Distance, Vec4DoubleCS, SnapPoint, MarkerInfo, MarkerType } from "./common-types";
import { GltfViewerOptions } from "./gltf-viewer-options";
import { ColorRgbRmo } from "./helpers/color-rgb-rmo";
import { ModelLoader } from "./components/model-loader";
import { CameraControls } from "./components/camera-controls";
import { Lights } from "./components/lights";
import { Axes } from "./components/axes";
import { RenderScene } from "./scenes/render-scene";
import { SimplifiedScene } from "./scenes/simplified-scene";
import { PickingScene } from "./scenes/picking-scene";
import { HudScene } from "./scenes/hud-scene";
import { PointSnapHelper } from "./helpers/point-snap-helper";

export { GltfViewerOptions, ModelFileInfo, ModelOpenedInfo, ViewerInteractionMode,
  Distance, Vec4DoubleCS, SnapPoint, MarkerInfo, MarkerType };

export class GltfViewer {
  // #region public observables
  optionsChange$: Observable<GltfViewerOptions>;  
  lastFrameTime$: Observable<number>;
  
  loadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  modelsOpenedChange$: Observable<ModelOpenedInfo[]>; 

  meshesSelectionChange$: Observable<Set<string>>;
  meshesManualSelectionChange$: Observable<Set<string>>; 

  snapPointsHighlightChange$: Observable<SnapPoint>;
  snapPointsManualSelectionChange$: Observable<SnapPoint[]>;  
  
  markersChange$: Observable<MarkerInfo[]>;
  markersHighlightChange$: Observable<MarkerInfo>;
  markersManualSelectionChange$: Observable<MarkerInfo[]>;

  distanceMeasureChange$: Observable<Distance>;
  // #endregion  
  
  // #region private rx subjects
  private _optionsChange = new BehaviorSubject<GltfViewerOptions>(null);
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();  
  private _lastFrameTime = new BehaviorSubject<number>(0);  
  // #endregion
  
  private _subscriptions: Subscription[] = [];
  
  private _container: HTMLElement;
  private _containerResizeObserver: ResizeObserver;

  private _options: GltfViewerOptions;  
  private _loader: ModelLoader;  

  private _renderer: WebGLRenderer;
  private _deferRender: number;

  private _cameraControls: CameraControls; 
  private _lights: Lights; 

  private _renderScene: RenderScene; 
  private _simplifiedScene: SimplifiedScene; 
  private _hudScene: HudScene; 
  private _axes: Axes;  

  private _meshesNeedColorUpdate = new Set<MeshBgSm>();

  // #region selection/highlighting related fieds
  private _pointerEventHelper = PointerEventHelper.default;
  private _pointSnapHelper: PointSnapHelper;
  private _pickingScene: PickingScene;

  private _queuedColoring: ColoringInfo[] = null;
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;

  private _highlightedMesh: MeshBgSm = null;
  private _selectedMeshes: MeshBgSm[] = [];
  private _isolatedMeshes: MeshBgSm[] = [];
  private _coloredMeshes: MeshBgSm[] = [];

  private _interactionMode: ViewerInteractionMode = "select_mesh";
  // #endregion  

  constructor(containerId: string, dracoDecoderPath: string, options: GltfViewerOptions) {
    this.initObservables();

    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error("Container not found!");
    }

    this._options = new GltfViewerOptions(options);  
    this._optionsChange.next(this._options);

    this._lights = new Lights(
      this._options.usePhysicalLights, 
      this._options.ambientLightIntensity, 
      this._options.hemiLightIntensity, 
      this._options.dirLightIntensity); 

    this._pointSnapHelper = new PointSnapHelper();
    this._pickingScene = new PickingScene();

    this._renderScene = new RenderScene(
      this._options.isolationColor, 
      this._options.isolationOpacity,
      this._options.selectionColor, 
      this._options.highlightColor);
    this._simplifiedScene = new SimplifiedScene();

    this.initHud();

    this.initLoader(dracoDecoderPath);

    this.initRenderer();
    
    this._axes = new Axes(this._container, 
      (axis) => this._cameraControls.rotateAroundAxis(axis, true),
      this._options.axesHelperEnabled,
      this._options.axesHelperPlacement,
      this._options.axesHelperSize);
 
    this._containerResizeObserver = new ResizeObserver(this.resizeRenderer);
    this._containerResizeObserver.observe(this._container);
  }

  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();  
    this.removeCanvasEventListeners();
    
    this._containerResizeObserver?.disconnect();
    this._containerResizeObserver = null;
    
    this._cameraControls?.destroy();
    this._cameraControls = null;

    this._pointSnapHelper?.destroy();
    this._pointSnapHelper = null;

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

    this._loader?.destroy();
    this._loader = null;

    this._renderer?.dispose();
    this._renderer = null;
  }

  // #region public interaction 

  // common
  async updateOptionsAsync(options: GltfViewerOptions): Promise<GltfViewerOptions> {
    const oldOptions = this._options;
    this._options = new GltfViewerOptions(options);

    let rendererReinitialized = false;
    let axesHelperUpdated = false;
    let lightsUpdated = false;
    let colorsUpdated = false;
    let materialsUpdated = false;
    let sceneUpdated = false;

    if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {
      this.initRenderer();
      rendererReinitialized = true;
    }

    if (this._options.axesHelperEnabled !== oldOptions.axesHelperEnabled
      || this._options.axesHelperPlacement !== oldOptions.axesHelperPlacement
      || this._options.axesHelperSize !== oldOptions.axesHelperSize) {
      this._axes.updateOptions(this._options.axesHelperEnabled,
        this._options.axesHelperPlacement, this._options.axesHelperSize);
      axesHelperUpdated = true;
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
    
    if (!(materialsUpdated || sceneUpdated) 
        && axesHelperUpdated) {
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
  
  setInteractionMode(value: ViewerInteractionMode) {
    if (this._interactionMode === value) {
      return;
    }
    switch (this._interactionMode) {
      case "select_mesh":
        // TODO?: reset mesh selection
        break;
      case "select_vertex":
        this._hudScene.pointSnap.reset();
        break;
      case "select_sprite":
        this._hudScene.markers.highlightMarker(null);
        this._hudScene.markers.resetSelectedMarkers();
        break;
      case "measure_distance":
        this._hudScene.pointSnap.reset();
        this._hudScene.distanceMeasurer.reset();
        break;
      default:
        return;
    }
    this._interactionMode = value;
    this.render();
  }  

  // models
  async openModelsAsync(modelInfos: ModelFileInfo[]): Promise<ModelLoadedInfo[]> {
    return this._loader.openModelsAsync(modelInfos);
  };

  async closeModelsAsync(modelGuids: string[]): Promise<void> {
    return this._loader.closeModelsAsync(modelGuids);
  };

  getOpenedModels(): ModelOpenedInfo[] {
    return this._loader.openedModelInfos;
  }

  // items
  colorItems(coloringInfos: ColoringInfo[]) {
    if (this._loader.loadingInProgress) {
      this._queuedColoring = coloringInfos;
      return;
    }

    this.resetSelectionAndColorMeshes(coloringInfos);
  }

  selectItems(ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loader.loadingInProgress) {
      this._queuedSelection = {ids, isolate: false};
      return;
    }

    this.findAndSelectMeshes(ids, false);
  };

  isolateItems(ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loader.loadingInProgress) {
      this._queuedSelection = {ids, isolate: true};
      return;
    }

    this.findAndSelectMeshes(ids, true);
  };

  zoomToItems(ids: string[]) {
    if (ids?.length) {
      const { found } = this._loader.findMeshesByIds(new Set<string>(ids));     
      if (found.length) {
        this.render(found);
        return;
      }
    }
    this.renderWholeScene();
  }

  getSelectedItems(): Set<string> {
    return this._selectionChange.getValue();
  }

  // markers
  setMarkers(markers: MarkerInfo[]) {
    this._hudScene?.markers.setMarkers(markers);
  }

  // #endregion

  // #region rx
  private initObservables() {
    this.optionsChange$ = this._optionsChange.asObservable();
    this.meshesSelectionChange$ = this._selectionChange.asObservable();
    this.meshesManualSelectionChange$ = this._manualSelectionChange.asObservable();
    this.lastFrameTime$ = this._lastFrameTime.asObservable();
  }

  private closeSubjects() {
    this._optionsChange.complete(); 
    this._selectionChange.complete();
    this._manualSelectionChange.complete();
    this._lastFrameTime.complete();
  }
  // #endregion

  // #region canvas event handlers 
  private onCanvasMouseMove = (e: MouseEvent) => {   
    if (e.buttons) {
      return;
    } 

    clearTimeout(this._pointerEventHelper.mouseMoveTimer);
    this._pointerEventHelper.mouseMoveTimer = null;
    this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
      const x = e.clientX;
      const y = e.clientY;

      switch (this._interactionMode) {
        case "select_mesh":  
          this.highlightMeshAtPoint(x, y);      
          break;
        case "select_vertex":
          this.highlightMeshAtPoint(x, y);
          this.setVertexSnapAtPoint(x, y);
          break;
        case "select_sprite":
          this.highlightSpriteAtPoint(x, y);
          break;
        case "measure_distance":
          this.setVertexSnapAtPoint(x, y);
          break;
      }
    }, 30);
  };

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

    switch (this._interactionMode) {
      case "select_mesh":    
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
        break;
      case "select_vertex":
        this.selectVertexAtPoint(x, y);
        break;
      case "select_sprite":
        this.selectSpriteAtPoint(x, y);
        break;
      case "measure_distance":
        this.measureDistanceAtPoint(x, y);
        break;
    }

    this._pointerEventHelper.downX = null;
    this._pointerEventHelper.downY = null;
  };

  private addCanvasEventListeners() {
    const { highlightingEnabled } = this._options;

    this._renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerDown);
    this._renderer.domElement.addEventListener("pointerup", this.onCanvasPointerUp);
    if (highlightingEnabled) {      
      this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
    }
  }

  private removeCanvasEventListeners() {    
    this._renderer.domElement.removeEventListener("pointerdown", this.onCanvasPointerDown);
    this._renderer.domElement.removeEventListener("pointerup", this.onCanvasPointerUp);   
    this._renderer.domElement.removeEventListener("mousemove", this.onCanvasMouseMove);
  }
  // #endregion

  private initLoader(dracoDecoderPath: string) {
    this._loader = new  ModelLoader(dracoDecoderPath,
      async () => {
        this.runQueuedColoring();
        this.runQueuedSelection();
        await this.updateRenderSceneAsync();
      },
      (guid: string) => {},
      (guid: string) => {
        this._highlightedMesh = null;
        this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== guid);
        this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== guid);
        this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== guid);
      },
      (mesh: MeshBgSm) => {        
        this._pickingScene.add(mesh);
      },
      (mesh: MeshBgSm) => {
        this._pickingScene.remove(mesh);
      },
    );

    this.loadingStateChange$ = this._loader.loadingStateChange$;
    this.modelLoadingStart$ = this._loader.modelLoadingStart$;
    this.modelLoadingEnd$ = this._loader.modelLoadingEnd$;
    this.modelLoadingProgress$ = this._loader.modelLoadingProgress$;
    this.modelsOpenedChange$ = this._loader.modelsOpenedChange$;  
  }

  // #region renderer
  private initRenderer() {    
    if (this._renderer) {
      this.removeCanvasEventListeners();
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
      this._cameraControls.focusCameraOnObjects(null);
    } else {
      this._cameraControls = new CameraControls(this._container, () => this.renderOnCameraMove()); 
    } 
    
    this._container.append(this._renderer.domElement);
  }
  
  private resizeRenderer = () => {
    const { width, height } = this._container.getBoundingClientRect();
    this._cameraControls?.resize(width, height);
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();   
    }
  };

  private async updateRenderSceneAsync(): Promise<void> {
    await this._renderScene.updateSceneAsync(this._lights.getLights(), 
      this._loader.loadedMeshesArray, this._loader.loadedModelsArray,
      this._options.meshMergeType);
      
    if (this._options.fastRenderType) {
      await this._simplifiedScene.updateSceneAsync(this._lights.getCopy(), 
        this._loader.loadedMeshesArray, 
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
      this._hudScene?.render(this._cameraControls.camera, this._renderer);
      this._axes?.render(this._cameraControls.camera, this._renderer);

      const frameTime = performance.now() - start;
      this._lastFrameTime.next(frameTime);
    });
  }  

  private renderWholeScene() {    
    this.render(this._loader.loadedMeshesArray.length ? [this._renderScene.scene] : null);
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
          const meshes = this._loader.getLoadedMeshesById(x);
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

  // #region picking 
  private getMeshAt(clientX: number, clientY: number): MeshBgSm {  
    const position = PointSnapHelper.convertClientToCanvas(this._renderer, clientX, clientY); 
    return this._renderer && this._pickingScene
      ? this._pickingScene.getSourceMeshAt(this._cameraControls.camera, this._renderer, position)
      : null;
  }
  
  private getSnapPointAt(clientX: number, clientY: number): SnapPoint {
    const position = PointSnapHelper.convertClientToCanvas(this._renderer, clientX, clientY);
    const pickingMesh = this._pickingScene.getPickingMeshAt(this._cameraControls.camera,
      this._renderer, position);

    const point = pickingMesh
      ? this._pointSnapHelper.getMeshSnapPointAtPosition(this._cameraControls.camera,
        this._renderer, position, pickingMesh)
      : null;

    const snapPoint = point
      ? { meshId: pickingMesh.userData.sourceId, position: Vec4DoubleCS.fromVector3(point) } 
      : null;

    return snapPoint;
  }
  // #endregion  

  // #region hud methods

  // common
  private initHud() {
    this._hudScene = new HudScene();

    this.snapPointsHighlightChange$ = this._hudScene.pointSnap.snapPointsHighlightChange$;
    this.snapPointsManualSelectionChange$ = this._hudScene.pointSnap.snapPointsManualSelectionChange$;

    this.markersChange$ = this._hudScene.markers.markersChange$;
    this.markersManualSelectionChange$ = this._hudScene.markers.markersManualSelectionChange$;
    this.markersHighlightChange$ = this._hudScene.markers.markersHighlightChange$;

    this.distanceMeasureChange$ = this._hudScene.distanceMeasurer.distanceMeasureChange$;
  }

  // snap points
  private setVertexSnapAtPoint(clientX: number, clientY: number) {    
    if (!this._renderer || !this._pickingScene) {
      return;
    } 
    const snapPoint = this.getSnapPointAt(clientX, clientY);    
    this._hudScene.pointSnap.setSnapPoint(snapPoint);
    this.render(); 
  }
  
  private selectVertexAtPoint(clientX: number, clientY: number) {    
    if (!this._renderer || !this._pickingScene) {
      return;
    } 
    const snapPoint = this.getSnapPointAt(clientX, clientY);    
    this._hudScene.pointSnap.setSelectedSnapPoints(snapPoint ? [snapPoint] : null);
    this.render(); 
  }
  
  // sprites(markers)
  private highlightSpriteAtPoint(clientX: number, clientY: number) {    
    if (!this._renderer || !this._pickingScene) {
      return;
    } 

    const point = PointSnapHelper.convertClientToCanvasZeroCenter(this._renderer, clientX, clientY);
    const marker = this._hudScene.markers.getMarkerAtCanvasPoint(point);
    this._hudScene.markers.highlightMarker(marker);
    this.render(); 
  }
  
  private selectSpriteAtPoint(clientX: number, clientY: number) {    
    if (!this._renderer || !this._pickingScene) {
      return;
    } 

    const point = PointSnapHelper.convertClientToCanvasZeroCenter(this._renderer, clientX, clientY);
    const marker = this._hudScene.markers.getMarkerAtCanvasPoint(point);
    this._hudScene.markers.setSelectedMarkers(marker ? [marker.id] : null);
    this.render(); 
  }

  // distance measure
  private measureDistanceAtPoint(clientX: number, clientY: number) { 
    if (!this._renderer || !this._pickingScene) {
      return;
    }       
    const snapPoint = this.getSnapPointAt(clientX, clientY); 
    this._hudScene.distanceMeasurer.setEndMarker(snapPoint?.position.toVector3()); 
    this.render(); 
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
    const { found } = this._loader.findMeshesByIds(new Set<string>(ids));
    if (found.length) {
      this.selectMeshes(found, false, isolate);
    }
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

    this._loader.loadedMeshesArray.forEach(x => {
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
}
