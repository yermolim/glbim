import { Observable, Subscription, BehaviorSubject } from "rxjs";

import { GltfViewerOptions } from "./gltf-viewer-options";
import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, ModelFileInfo,
  ColoringInfo, PointerEventHelper, Distance, 
  Vec4DoubleCS, SnapPoint, MarkerInfo, MarkerType } from "./common-types";
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

export { GltfViewerOptions, ModelFileInfo, ModelOpenedInfo,
  Distance, Vec4DoubleCS, ColoringInfo, SnapPoint, MarkerInfo, MarkerType };  

export type ViewerInteractionMode = "select_mesh" | "select_vertex" | "select_sprite" | "measure_distance";

export class GltfViewer {
  // #region public observables
  optionsChange$: Observable<GltfViewerOptions>; 
  modeChange$: Observable<ViewerInteractionMode>; 
  
  contextLoss$: Observable<boolean>;
  lastFrameTime$: Observable<number>;

  cameraPositionChange$: Observable<Vec4DoubleCS>;
  
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
  markersSelectionChange$: Observable<MarkerInfo[]>;
  markersManualSelectionChange$: Observable<MarkerInfo[]>;

  distanceMeasureChange$: Observable<Distance>;
  // #endregion
  
  private _subscriptions: Subscription[] = [];
  
  private _container: HTMLElement;
  private _containerResizeObserver: ResizeObserver;

  private _options: GltfViewerOptions;  
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
  private _optionsChange = new BehaviorSubject<GltfViewerOptions>(null);
  private _contextLoss = new BehaviorSubject<boolean>(false);  
  private _lastFrameTime = new BehaviorSubject<number>(0);  
  // #endregion

  /**
   * 
   * @param containerId HTMLElement id
   * @param dracoDecoderPath path to the folder with 'draco_decoder.js' file
   * @param options viewer options
   */
  constructor(containerId: string, dracoDecoderPath: string, options: GltfViewerOptions) {
    this.initObservables();

    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error("Container not found!");
    }

    this._options = new GltfViewerOptions(options);  
    this._optionsChange.next(this._options);
    
    // init services. the order is important
    this.initLoaderService(dracoDecoderPath);    
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
  async updateOptionsAsync(options: GltfViewerOptions): Promise<GltfViewerOptions> {
    const oldOptions = this._options;
    this._options = new GltfViewerOptions(options);
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

    this._optionsChange.next(this._options);  
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
   * @returns
   */
  selectItems(ids: string[]) {
    this._selectionService.select(this._renderService, ids);
  };

  /**
   * make all items semi-transparent except the ones with the specified ids
   * @param ids item identifiers represented as `${model_uuid}|${item_name}`
   * @returns 
   */
  isolateItems(ids: string[]) {
    this._selectionService.isolate(this._renderService, ids);
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

    if (!this._options.highlightingEnabled) {
      // return if highlighting is disabled
      // because the further code affects highlighting only
      return;
    } 

    const x = e.clientX;
    const y = e.clientY;
    const { downX, downY, allowArea, maxDiff } = this._pointerEventHelper;
    if (this._interactionMode === "select_mesh"
      && allowArea
      && downX !== undefined && downX !== null && allowArea
      && (Math.abs(x - downX) > maxDiff || Math.abs(y - downY) > maxDiff)) {
      this._selectionFrame.show(this._container, downX, downY, x, y);
    }

    clearTimeout(this._pointerEventHelper.mouseMoveTimer);
    this._pointerEventHelper.mouseMoveTimer = null;
    this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
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
        // apply area selection if the corresponding mode is set
        this._selectionService.selectMeshesInArea(this._renderService, 
          // add to selection if touch action or 'ctrl' key pressed
          e.ctrlKey || touch,
          downX, downY, x, y);
        this._highlightService.clearHighlight(this._renderService);
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
          this._selectionService.selectMeshAtPoint(this._renderService, x, y, 
            // add/remove to/from selection if touch action or 'ctrl' key pressed
            e.ctrlKey || touch); 
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
  private initLoaderService(dracoDecoderPath: string) {
    this._loaderService = new ModelLoaderService(dracoDecoderPath, this._options.basePoint);
    this._loaderService.addQueueCallback("queue-loaded", 
      async () => {
        this._coloringService.runQueuedColoring(this._renderService);
        this._selectionService.runQueuedSelection(this._renderService);
        await this._renderService.updateRenderSceneAsync();
      });

    this.loadingStateChange$ = this._loaderService.loadingStateChange$;
    this.modelLoadingStart$ = this._loaderService.modelLoadingStart$;
    this.modelLoadingEnd$ = this._loaderService.modelLoadingEnd$;
    this.modelLoadingProgress$ = this._loaderService.modelLoadingProgress$;
    this.modelsOpenedChange$ = this._loaderService.modelsOpenedChange$;  
  }

  private initCameraService() {
    this._cameraService = new CameraService(this._container, () => {
      this._renderService?.renderOnCameraMove();
    }); 
    if (this._options.cameraControlsDisabled) {
      this._cameraService.disableControls();
    }
    this.cameraPositionChange$ = this._cameraService.cameraPositionChange$;
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
    
    this.meshesSelectionChange$ = this._selectionService.selectionChange$;
    this.meshesManualSelectionChange$ = this._selectionService.manualSelectionChange$;
  }

  private initColoringService() {    
    this._coloringService = new ColoringService(this._loaderService, this._selectionService);
  }

  private initScenesService() {
    this._scenesService = new ScenesService(this._container, this._cameraService, this._options);

    this.snapPointsHighlightChange$ = this._scenesService.hudScene.pointSnap.snapPointsHighlightChange$;
    this.snapPointsManualSelectionChange$ = this._scenesService.hudScene.pointSnap.snapPointsManualSelectionChange$;
    this.markersChange$ = this._scenesService.hudScene.markers.markersChange$;
    this.markersSelectionChange$ = this._scenesService.hudScene.markers.markersSelectionChange$;
    this.markersManualSelectionChange$ = this._scenesService.hudScene.markers.markersManualSelectionChange$;
    this.markersHighlightChange$ = this._scenesService.hudScene.markers.markersHighlightChange$;
    this.distanceMeasureChange$ = this._scenesService.hudScene.distanceMeasurer.distanceMeasureChange$;
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
    this._renderService.addRendererEventListener("pointerdown", <any>this.onRendererPointerDown); // TODO: edit code to keep typings
    this._renderService.addRendererEventListener("pointermove", <any>this.onRendererPointerMove); // TODO: edit code to keep typings
    this._renderService.addRendererEventListener("pointerup", <any>this.onRendererPointerUp); // TODO: edit code to keep typings
    this._renderService.addRendererEventListener("pointerout", <any>this.onRendererPointerUp); // TODO: edit code to keep typings
    this._renderService.addRendererEventListener("pointerleave", <any>this.onRendererPointerUp); // TODO: edit code to keep typings
  }
  // #endregion
}
