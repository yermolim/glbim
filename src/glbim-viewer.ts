import { Observable, Subscription, BehaviorSubject } from "rxjs";

import { GlbimOptions } from "./glbim-options";
import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, ModelFileInfo,
  ColoringInfo, PointerEventHelper, Distance, LoadingQueueInfo,
  Vec4DoubleCS, SnapPoint, MarkerInfo, TextureData } from "./common-types";
import { SelectionFrame } from "./components/selection-frame";

import { ModelLoaderService } from "./services/model-loader-service";
import { CameraService } from "./services/camera-service";
import { ScenesService } from "./services/scenes-service";
import { RenderService } from "./services/render-service";
import { PickingService } from "./services/picking-service";
import { HighlightService } from "./services/highlight-service";
import { SelectionService } from "./services/selection-service";
import { ColoringService } from "./services/coloring-service";
import { HudService } from "./services/hud-service";

export { GlbimOptions, ModelFileInfo, ModelOpenedInfo,
  Distance, Vec4DoubleCS, ColoringInfo, SnapPoint, MarkerInfo, TextureData };  

export type ViewerInteractionMode = "select_mesh" | "select_vertex" | "select_sprite" | "measure_distance";

export class GlbimViewer {
  // #region public observables
  optionsChange$: Observable<GlbimOptions>; 
  modeChange$: Observable<ViewerInteractionMode>; 
  
  contextLoss$: Observable<boolean>;
  lastFrameTime$: Observable<number>;

  cameraPositionChange$: Observable<Vec4DoubleCS>;
  
  loadingStateChange$: Observable<boolean>;
  loadingQueueChange$: Observable<LoadingQueueInfo>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  modelsOpenedChange$: Observable<ModelOpenedInfo[]>; 

  meshesSelectionChange$: Observable<Set<string>>;
  meshesManualSelectionChange$: Observable<Set<string>>; 

  meshesHiddenChange$: Observable<Set<string>>; 

  snapPointsHighlightChange$: Observable<SnapPoint>;
  snapPointsManualSelectionChange$: Observable<SnapPoint[]>;  
  
  markersChange$: Observable<MarkerInfo[]>;
  markersHighlightChange$: Observable<MarkerInfo>;
  markersSelectionChange$: Observable<MarkerInfo[]>;
  markersManualSelectionChange$: Observable<MarkerInfo[]>;

  distanceMeasureChange$: Observable<Distance>;
  // #endregion
  
  private _subscriptions: Subscription[] = [];
  
  private _container: HTMLElement;
  private _containerResizeObserver: ResizeObserver;

  private _options: GlbimOptions;  
  private _interactionMode: ViewerInteractionMode;

  private _cameraService: CameraService;   
  private _loaderService: ModelLoaderService;  
  private _scenesService: ScenesService;
  private _renderService: RenderService;
  private _pickingService: PickingService;
  private _highlightService: HighlightService;
  private _selectionService: SelectionService;
  private _coloringService: ColoringService;
  private _hudService: HudService;

  private _pointerEventHelper = PointerEventHelper.default;  

  private _selectionFrame: SelectionFrame;
  
  // #region private rx subjects
  private _modeChange = new BehaviorSubject<ViewerInteractionMode>(null);
  private _optionsChange = new BehaviorSubject<GlbimOptions>(null);
  private _contextLoss = new BehaviorSubject<boolean>(false);  
  private _lastFrameTime = new BehaviorSubject<number>(0);  
  // #endregion

  /**
   * 
   * @param containerSelector parent HTMLElement selector
   * @param dracoLibPath path to the folder with 'draco_decoder.wasm'+'draco_wasm_wrapper.js' 
   * or 'draco_decoder.js' file (https://github.com/google/draco)
   * @param ifcLibPath path to the folder with 'web-ifc.wasm' file (https://github.com/tomvandig/web-ifc)
   * @param options viewer options
   */
  constructor(containerSelector: string, 
    dracoLibPath?: string, 
    ifcLibPath?: string,
    options?: GlbimOptions) {
    this.initObservables();

    this._container = document.getElementById(containerSelector) || document.querySelector(containerSelector);
    if (!this._container) {
      throw new Error("Container not found!");
    }

    this._options = new GlbimOptions(options);  
    this._optionsChange.next(Object.assign({}, this._options));
    
    // init services. the order is important
    this.initLoaderService(dracoLibPath, ifcLibPath);    
    this.initCameraService();
    this.initPickingService();
    this.initHighlightService();   
    this.initSelectionService();
    this.initColoringService();
    this.initScenesService();
    this.initHudService();
    this.initRenderService();
 
    this._containerResizeObserver = new ResizeObserver(() => {
      this._renderService?.resizeRenderer();
    });
    this._containerResizeObserver.observe(this._container);

    this._selectionFrame = new SelectionFrame();

    this.setInteractionMode("select_mesh");
  }

  /**
   * free viewer resources
   */
  destroy() {   
    this._subscriptions.forEach(x => x.unsubscribe()); 
    this.closeSubjects();

    this._selectionFrame.destroy();
    this._selectionFrame = null;
    
    this._containerResizeObserver.disconnect();
    this._containerResizeObserver = null;    

    // destroying services in the reverse order of ther creation
    this._renderService?.destroy();
    this._renderService = null; 

    this._hudService?.destroy();
    this._hudService = null;
    
    this._scenesService?.destroy();
    this._scenesService = null;

    this._coloringService?.destroy();
    this._coloringService = null; 

    this._selectionService?.destroy();
    this._selectionService = null; 
    
    this._highlightService?.destroy();
    this._highlightService = null; 

    this._pickingService?.destroy();
    this._pickingService = null; 
    
    this._cameraService?.destroy();
    this._cameraService = null;

    this._loaderService?.destroy();
    this._loaderService = null;
  }

  // #region public interaction 

  // common
  /**
   * update viewer options. not all options can be changed after construction
   * @param options 
   * @returns 
   */
  async updateOptionsAsync(options: GlbimOptions): Promise<GlbimOptions> {
    const oldOptions = this._options;
    this._options = new GlbimOptions(options);
    this._renderService.options = this._options;

    let rendererReinitialized = false;
    let axesHelperUpdated = false;
    let lightsUpdated = false;
    let colorsUpdated = false;
    let materialsUpdated = false;
    let sceneUpdated = false;  

    if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {      
      this.initRenderService();
      rendererReinitialized = true;
    }

    if (this._options.axesHelperEnabled !== oldOptions.axesHelperEnabled
      || this._options.axesHelperPlacement !== oldOptions.axesHelperPlacement
      || this._options.axesHelperSize !== oldOptions.axesHelperSize) {
      this._scenesService.axes.updateOptions(this._options.axesHelperEnabled,
        this._options.axesHelperPlacement, this._options.axesHelperSize);
      axesHelperUpdated = true;
    }
    
    if (this._options.usePhysicalLights !== oldOptions.usePhysicalLights
        || this._options.ambientLightIntensity !== oldOptions.ambientLightIntensity
        || this._options.hemiLightIntensity !== oldOptions.hemiLightIntensity
        || this._options.dirLightIntensity !== oldOptions.dirLightIntensity) {
      this._renderService.renderer.physicallyCorrectLights = this._options.usePhysicalLights;
      this._scenesService.lights.update(this._options.usePhysicalLights, this._options.ambientLightIntensity,
        this._options.hemiLightIntensity, this._options.dirLightIntensity);
      lightsUpdated = true;
    }  

    if (this._options.isolationColor !== oldOptions.isolationColor
        || this._options.isolationOpacity !== oldOptions.isolationOpacity
        || this._options.selectionColor !== oldOptions.selectionColor
        || this._options.highlightColor !== oldOptions.highlightColor) {      
      this._scenesService.renderScene.updateCommonColors({
        isolationColor: this._options.isolationColor, 
        isolationOpacity: this._options.isolationOpacity,
        selectionColor: this._options.selectionColor, 
        highlightColor: this._options.highlightColor
      });
      colorsUpdated = true;
    }

    if (rendererReinitialized || lightsUpdated || colorsUpdated) {
      this._scenesService.renderScene.updateSceneMaterials();
      this._scenesService.simplifiedScene.updateSceneMaterials();
      materialsUpdated = true;
    }

    if (this._options.meshMergeType !== oldOptions.meshMergeType
        || this._options.fastRenderType !== oldOptions.fastRenderType) {
      await this._renderService.updateRenderSceneAsync();
      sceneUpdated = true;
    }
    
    if (!(materialsUpdated || sceneUpdated) 
        && axesHelperUpdated) {
      this._renderService.render();
    }    

    if (this._options.cameraControlsDisabled) {
      this._cameraService.disableControls();
    } else {
      this._cameraService.enableControls();
    }
    
    this._selectionService.focusOnProgrammaticSelection = this._options.selectionAutoFocusEnabled;
    this._selectionService.resetSelectionOnEmptySet = this._options.resetSelectionOnEmptySet;

    this._optionsChange.next(Object.assign({}, this._options));  
    return this._options;
  }
  
  /**
   * set viewer interaction mode
   * @param value 
   * @returns 
   */
  setInteractionMode(value: ViewerInteractionMode) {
    if (this._interactionMode === value) {
      return;
    }

    // disable the previous mode
    switch (this._interactionMode) {
      case "select_mesh":
        // TODO?: reset mesh selection
        break;
      case "select_vertex":
        this._scenesService.hudScene.pointSnap.reset();
        break;
      case "select_sprite":
        this._scenesService.hudScene.markers.highlightMarker(null);
        this._scenesService.hudScene.markers.resetSelectedMarkers();
        break;
      case "measure_distance":
        this._scenesService.hudScene.pointSnap.reset();
        this._scenesService.hudScene.distanceMeasurer.reset();
        break;
      default:
        // interaction mode was not set
        break;
    }

    this._interactionMode = value;
    this._modeChange.next(value);
    this._renderService.render();
  }  

  // models
  /**
   * open models
   * @param modelInfos model information objects
   * @returns 
   */
  async openModelsAsync(modelInfos: ModelFileInfo[]): Promise<ModelLoadedInfo[]> {
    return this._loaderService.openModelsAsync(modelInfos);
  };

  /**
   * close models with the specified guids
   * @param modelGuids 
   * @returns 
   */
  async closeModelsAsync(modelGuids: string[]): Promise<void> {
    return this._loaderService.closeModelsAsync(modelGuids);
  };

  /**
   * get a short information about the currently opened models
   * @returns 
   */
  getOpenedModels(): ModelOpenedInfo[] {
    return this._loaderService?.openedModelInfos;
  }

  // items
  /**
   * paint items using the specified coloring information
   * @param coloringInfos coloring information objects
   * @returns 
   */
  colorItems(coloringInfos: ColoringInfo[]) {
    this._coloringService.color(this._renderService, coloringInfos);
  }

  /**
   * select items with the specified ids if found
   * @param ids item identifiers represented as `${model_uuid}|${item_name}`
   * @param manual treat isolation as it was caused by user interaction
   * @returns
   */
  selectItems(ids: string[], manual?: boolean, force?: boolean) {
    const resetSelectionOnEmptySet = this._selectionService.resetSelectionOnEmptySet;
    if (force && !resetSelectionOnEmptySet) {
      // if forced, temporarily enable resetting selection on empty set
      this._selectionService.resetSelectionOnEmptySet = true;
    }

    // the selection call itself
    this._selectionService.select(this._renderService, ids, manual ?? false);

    if (!resetSelectionOnEmptySet) {
      // if resetting selection was disabled, enable it again
      this._selectionService.resetSelectionOnEmptySet = false;
    }
  };

  /**
   * make all items semi-transparent except the ones with the specified ids
   * @param ids item identifiers represented as `${model_uuid}|${item_name}`
   * @param manual treat isolation as it was caused by user interaction
   * @returns 
   */
  isolateItems(ids: string[], manual?: boolean) {
    this._selectionService.isolate(this._renderService, ids, manual ?? false);
  };
  
  /**
   * center view on the items with the specified ids if found
   * @param ids item identifiers represented as `${model_uuid}|${item_name}`
   * @returns 
   */
  zoomToItems(ids: string[]) {
    if (ids?.length) {
      const { found } = this._loaderService.findMeshesByIds(new Set<string>(ids));     
      if (found.length) {
        this._renderService.render(found);
        return;
      }
    }
    this._renderService.renderWholeScene();
  }

  /**
   * hide the currently selected items from the view (sets their opacity to 0)
   */
  hideSelectedItems() {
    this._coloringService.hideSelected(this._renderService);
  }

  /**
   * reveal the currently hidden items (makes them opaque again)
   */
  unhideAllItems() {
    this._coloringService.unhideAll(this._renderService);
  }

  /**
   * get identifiers of the selected items
   * @returns item identifiers represented as `${model_uuid}|${item_name}`
   */
  getSelectedItems(): Set<string> {
    return this._selectionService.selectedIds;
  }

  // markers
  /**
   * add markers to the HUD
   * @param markers marker information objects
   */
  setMarkers(markers: MarkerInfo[]) {
    this._scenesService.hudScene?.markers.setMarkers(markers);
    this._renderService.render();
  }

  /**
   * select markers with the specified ids if found
   * @param ids marker ids
   */
  selectMarkers(ids: string[]) {   
    this._scenesService.hudScene?.markers.setSelectedMarkers(ids, false);
    this._renderService.render();
  }
  // #endregion

  // #region rx
  private initObservables() {
    this.modeChange$ = this._modeChange.asObservable();
    this.contextLoss$ = this._contextLoss.asObservable();
    this.optionsChange$ = this._optionsChange.asObservable();
    this.lastFrameTime$ = this._lastFrameTime.asObservable();
  }

  private closeSubjects() {
    this._modeChange.complete();
    this._contextLoss.complete();
    this._optionsChange.complete(); 
    this._lastFrameTime.complete();
  }
  // #endregion

  // #region renderer events
  private clearDownPoint() {    
    this._pointerEventHelper.downX = null;
    this._pointerEventHelper.downY = null;
  }

  private onRendererPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button === 1 || e.button === 2) {
      // ignore all pointer events except the primary one
      return;
    }

    this._pointerEventHelper.touch = e.pointerType === "touch";
    this._pointerEventHelper.allowArea = e.pointerType !== "touch" || this._options.cameraControlsDisabled;
    this._pointerEventHelper.downX = e.clientX;
    this._pointerEventHelper.downY = e.clientY;
  };

  private onRendererPointerMove = (e: PointerEvent) => {
    if (!e.isPrimary) {
      // ignore all pointer events except the primary one
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    if (this._interactionMode === "select_mesh") {
      const { downX, downY, allowArea, maxDiff } = this._pointerEventHelper;
      if (allowArea
        && downX !== undefined && downX !== null && allowArea
        && (Math.abs(x - downX) > maxDiff || Math.abs(y - downY) > maxDiff)) {
        this._selectionFrame.show(this._container, downX, downY, x, y);
      }
    }

    if (!this._options.highlightingEnabled) {
      // return if highlighting is disabled
      // because the further code affects highlighting only
      return;
    }

    clearTimeout(this._pointerEventHelper.mouseMoveTimer);
    this._pointerEventHelper.mouseMoveTimer = null;
    this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
      const { downX, downY, allowArea } = this._pointerEventHelper;
      switch (this._interactionMode) {
        case "select_mesh":
          if (downX !== undefined && downX !== null && allowArea) {
            this._highlightService.highlightInArea(this._renderService, downX, downY, x, y); 
          } else {
            this._highlightService.highlightAtPoint(this._renderService, x, y);   
          }       
          break;
        case "select_vertex":
          this._highlightService.highlightAtPoint(this._renderService, x, y);     
          this._hudService.setVertexSnapAtPoint(this._renderService, x, y);
          break;
        case "select_sprite":
          this._hudService.highlightSpriteAtPoint(this._renderService, x, y);
          break;
        case "measure_distance":
          this._hudService.setVertexSnapAtPoint(this._renderService, x, y);
          break;
      }
    }, 30);
  };

  private onRendererPointerUp = (e: PointerEvent) => {
    if (!e.isPrimary || e.button === 1 || e.button === 2) {
      // ignore all pointer events except the primary one
      return;
    }

    this._selectionFrame.hide();
    this._highlightService.clearHighlight(this._renderService);

    const x = e.clientX;
    const y = e.clientY;
    const { downX, downY, touch, allowArea, maxDiff } = this._pointerEventHelper;

    if (!downX) {
      // no 'down' coordinates. the pointer was set down outside the renderer canvas
      return;
    }

    if (Math.abs(x - downX) > maxDiff
      || Math.abs(y - downY) > maxDiff) {
      // the pointer moved away from the 'down' point.

      if (this._interactionMode === "select_mesh" && allowArea) {
        let previousSelection: "remove" | "keep" | "subtract";
        if (e.ctrlKey || touch) {
          // add to selection if touch action or 'ctrl' key pressed
          previousSelection = "keep";
        } else if (e.altKey) {
          // subtract from selection if 'alt' key pressed
          previousSelection = "subtract";
        } else {
          // replace selection
          previousSelection = "remove";
        }

        // apply area selection if the corresponding mode is set
        this._selectionService.selectMeshesInArea(this._renderService, 
          previousSelection, downX, downY, x, y);
      }
      this.clearDownPoint();
      return;
    }

    switch (this._interactionMode) {
      case "select_mesh":    
        if (this._pointerEventHelper.waitForDouble) {
          this._selectionService.isolateSelected(this._renderService);
          this._pointerEventHelper.waitForDouble = false;
        } else {
          this._pointerEventHelper.waitForDouble = true;
          setTimeout(() => {
            this._pointerEventHelper.waitForDouble = false;
          }, 300);
          this._selectionService.selectMeshAtPoint(this._renderService, 
            // add/remove to/from selection if touch action or 'ctrl' key pressed
            e.ctrlKey || touch,
            x, y,); 
        }      
        break;
      case "select_vertex":
        this._hudService.selectVertexAtPoint(this._renderService, x, y);
        break;
      case "select_sprite":
        this._hudService.selectSpriteAtPoint(this._renderService, x, y);
        break;
      case "measure_distance":
        this._hudService.measureDistanceAtPoint(this._renderService, x, y);
        break;
    }

    this.clearDownPoint();
  };

  private onRendererContextLoss = () => {
    this._contextLoss.next(true);
    this._loaderService?.closeAllModelsAsync();
  };

  private onRendererContextRestore = () => {
    this._contextLoss.next(false);     
  };
  // #endregion

  // #region services initialization
  private initLoaderService(dracoLibPath: string, ifcLibPath: string) {
    this._loaderService = new ModelLoaderService(dracoLibPath, ifcLibPath, this._options.basePoint);
    this._loaderService.addQueueCallback("queue-loaded", 
      async () => {
        this._coloringService.runQueuedColoring(this._renderService);
        this._selectionService.runQueuedSelection(this._renderService);
        await this._renderService.updateRenderSceneAsync();
      });

    this.loadingStateChange$ = this._loaderService.loadingStateChange$.pipe();
    this.loadingQueueChange$ = this._loaderService.loadingQueueChange$.pipe();
    this.modelLoadingStart$ = this._loaderService.modelLoadingStart$.pipe();
    this.modelLoadingEnd$ = this._loaderService.modelLoadingEnd$.pipe();
    this.modelLoadingProgress$ = this._loaderService.modelLoadingProgress$.pipe();
    this.modelsOpenedChange$ = this._loaderService.modelsOpenedChange$.pipe();  
  }

  private initCameraService() {
    this._cameraService = new CameraService(this._container, () => {
      this._renderService?.renderOnCameraMove();
    }); 
    if (this._options.cameraControlsDisabled) {
      this._cameraService.disableControls();
    }
    this.cameraPositionChange$ = this._cameraService.cameraPositionChange$.pipe();
  }

  private initPickingService() {
    this._pickingService = new PickingService(this._loaderService); 
  }

  private initHighlightService() {
    this._highlightService = new HighlightService(this._pickingService);
  }

  private initSelectionService() {    
    this._selectionService = new SelectionService(this._loaderService, this._pickingService);
    this._selectionService.focusOnProgrammaticSelection = this._options.selectionAutoFocusEnabled;
    this._selectionService.resetSelectionOnEmptySet = this._options.resetSelectionOnEmptySet;
    
    this.meshesSelectionChange$ = this._selectionService.selectionChange$.pipe();
    this.meshesManualSelectionChange$ = this._selectionService.manualSelectionChange$.pipe();
  }

  private initColoringService() {    
    this._coloringService = new ColoringService(this._loaderService, this._selectionService);

    this.meshesHiddenChange$ = this._coloringService.meshesHiddenChange$.pipe();
  }

  private initScenesService() {
    this._scenesService = new ScenesService(this._container, this._cameraService, this._options);

    this.snapPointsHighlightChange$ = this._scenesService.hudScene.pointSnap.snapPointsHighlightChange$.pipe();
    this.snapPointsManualSelectionChange$ = this._scenesService.hudScene.pointSnap.snapPointsManualSelectionChange$.pipe();
    this.markersChange$ = this._scenesService.hudScene.markers.markersChange$.pipe();
    this.markersSelectionChange$ = this._scenesService.hudScene.markers.markersSelectionChange$.pipe();
    this.markersManualSelectionChange$ = this._scenesService.hudScene.markers.markersManualSelectionChange$.pipe();
    this.markersHighlightChange$ = this._scenesService.hudScene.markers.markersHighlightChange$.pipe();
    this.distanceMeasureChange$ = this._scenesService.hudScene.distanceMeasurer.distanceMeasureChange$.pipe();
  }
  
  private initHudService() {
    this._hudService = new HudService(this._scenesService, this._pickingService);
  }

  private initRenderService() {    
    if (this._renderService) {
      this._renderService.destroy();
      this._renderService = null;
    }
    
    this._renderService = new RenderService(this._container, this._loaderService, 
      this._cameraService, this._scenesService, this._options, this._lastFrameTime);  
      
    this._renderService.addRendererEventListener("webglcontextlost", this.onRendererContextLoss);
    this._renderService.addRendererEventListener("webglcontextrestored ", this.onRendererContextRestore);

    this._container.addEventListener("pointerdown", this.onRendererPointerDown);
    this._container.addEventListener("pointermove", this.onRendererPointerMove);
    this._container.addEventListener("pointerup", this.onRendererPointerUp);
  }
  // #endregion
}
