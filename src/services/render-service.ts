import { BehaviorSubject } from "rxjs";
import { NoToneMapping, Object3D, PerspectiveCamera, 
  sRGBEncoding, Vector2, Vector3, WebGLRenderer } from "three";

import { GltfViewerOptions } from "../gltf-viewer-options";
import { Mesh_BG } from "../common-types";

import { CameraService } from "./camera-service";
import { ModelLoaderService } from "./model-loader-service";
import { ScenesService } from "./scenes-service";

export class RenderService { 
  private readonly _lastFrameTimeSubject: BehaviorSubject<number>;  
  private readonly _container: HTMLElement;
  
  private readonly _cameraService: CameraService; 
  private readonly _loaderService: ModelLoaderService;  
  private readonly _scenesService: ScenesService;

  private _options: GltfViewerOptions;    
  set options(value: GltfViewerOptions) {
    this._options = value;
  }

  private _renderer: WebGLRenderer;
  get renderer(): WebGLRenderer {
    return this._renderer;
  }
  get canvas(): HTMLCanvasElement {
    return this._renderer.domElement;
  }

  get camera(): PerspectiveCamera {
    return this._cameraService.camera;
  }

  private _rendererEventListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  
  private _deferRender: number;
  private _meshesNeedColorUpdate = new Set<Mesh_BG>();

  constructor(container: HTMLElement, loaderService: ModelLoaderService, 
    cameraService: CameraService, scenesService: ScenesService, 
    options: GltfViewerOptions, lastFrameTimeSubject?: BehaviorSubject<number>) {
    if (!container) {
      throw new Error("Container is not defined");
    }
    if (!loaderService) {
      throw new Error("LoaderService is not defined");
    }
    if (!cameraService) {
      throw new Error("CameraService is not defined");
    }
    if (!scenesService) {
      throw new Error("SceneService is not defined");
    }
    if (!options) {
      throw new Error("Options is not defined");
    }

    this._container = container;
    this._loaderService = loaderService;
    this._cameraService = cameraService;
    this._scenesService = scenesService;
    this._options = options;
    this._lastFrameTimeSubject = lastFrameTimeSubject;

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

    this._cameraService.focusCameraOnObjects(null);

    this._container.append(this._renderer.domElement);
  }

  destroy() {
    this.removeAllRendererEventListeners();

    this._renderer.domElement.remove();
    this._renderer.dispose();
    this._renderer.forceContextLoss();
    this._renderer = null;
  }
    
  resizeRenderer = () => {
    const { width, height } = this._container.getBoundingClientRect();
    this._cameraService?.resize(width, height);
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();   
    }
  };  

  //#region event listeners
  addRendererEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const existingListenersForType = this._rendererEventListeners.get(type);
    if (existingListenersForType) {
      if (existingListenersForType.has(listener)) {
        // same listener for the same event type is already present.
        return;
      }
      existingListenersForType.add(listener);
    } else {
      this._rendererEventListeners.set(type, new Set<EventListenerOrEventListenerObject>([listener]));
    }

    this._renderer.domElement.addEventListener(type, listener);
  };
  
  removeRendererEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this._renderer.domElement.removeEventListener(type, listener);
    
    const existingListenersForType = this._rendererEventListeners.get(type);
    if (existingListenersForType) {
      existingListenersForType.delete(listener);
    }
  };

  removeAllRendererEventListeners() {
    this._rendererEventListeners.forEach((v, k) => {      
      v.forEach(x => this._renderer.domElement.removeEventListener(k, x));
    });
    this._rendererEventListeners.clear();
  }
  //#endregion

  //#region public render
  /**
   * rebuild the current render scene using the actual render options
   */
  async updateRenderSceneAsync(): Promise<void> {
    await this._scenesService.renderScene.updateSceneAsync(this._scenesService.lights.getLights(), 
      this._loaderService.loadedMeshesArray, this._loaderService.loadedModelsArray,
      this._options.meshMergeType);
      
    if (this._options.fastRenderType) {
      await this._scenesService.simplifiedScene.updateSceneAsync(this._scenesService.lights.getCopy(), 
        this._loaderService.loadedMeshesArray, 
        this._options.fastRenderType);
    } else {
      this._scenesService.simplifiedScene.clearScene();
    }

    this.renderWholeScene();
  }

  /**
   * a specific render call designed to be invoked when the camera moves
   */
  renderOnCameraMove() {
    if (this._options.fastRenderType) {
      // is fast rendering is enabled, renders the simplified scene, 
      // deferring rendering of the normal scene by 300 ms from the last render call
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

  /**
   * render the next frame
   * @param focusObjects an array of objects the camera should focus on
   * @param fast if 'true', a simplified scene is used for rendering
   */
  render(focusObjects: Object3D[] = null, fast = false) {
    this.prepareToRender(focusObjects);
    requestAnimationFrame(() => { 
      if (!this._renderer) {
        return;
      }

      const start = performance.now();

      if (fast && this._scenesService.simplifiedScene?.scene) {
        this._renderer.render(this._scenesService.simplifiedScene.scene, this._cameraService.camera);
      } else if (this._scenesService.renderScene?.scene) {
        this._renderer.render(this._scenesService.renderScene.scene, this._cameraService.camera);
      }
      this._scenesService.hudScene?.render(this._cameraService.camera, this._renderer);
      this._scenesService.axes?.render(this._cameraService.camera, this._renderer);

      const frameTime = performance.now() - start;
      this._lastFrameTimeSubject?.next(frameTime);
    });
  }  

  /**
   * fit all the scene inside the view and render the next frame
   */
  renderWholeScene() {    
    this.render(this._loaderService.loadedMeshesArray.length ? [this._scenesService.renderScene.scene] : null);
  }

  /**
   * force mesh color to be actualized during the next render call
   * @param mesh 
   */
  enqueueMeshForColorUpdate(mesh: Mesh_BG) {
    this._meshesNeedColorUpdate.add(mesh);
  }
  //#endregion  
  
  //#region coordinates conversion
  convertClientToCanvas(clientX: number, clientY: number): Vector2 {    
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = this.renderer.getPixelRatio();
    const x = (clientX - rect.left) * (this.canvas.width / rect.width) * pixelRatio || 0;
    const y = (clientY - rect.top) * (this.canvas.height / rect.height) * pixelRatio || 0;

    return new Vector2(x, y);
  }  

  convertClientToCanvasZeroCenter(clientX: number, clientY: number): Vector2 {    
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = this.renderer.getPixelRatio();
    const canvasRatioW = (this.canvas.width / rect.width) * pixelRatio || 0;
    const canvasRatioH = (this.canvas.height / rect.height) * pixelRatio || 0;
    const x = (clientX - rect.left) * canvasRatioW;
    const y = (clientY - rect.top) * canvasRatioH; 
    
    const canvasHalfWidth = rect.width * canvasRatioW / 2;
    const canvasHalfHeight = rect.height * canvasRatioH / 2;    
    const xC =  x - canvasHalfWidth;
    const yC =  canvasHalfHeight - y;

    return new Vector2(xC, yC);
  }
  
  convertClientToCanvasZeroCenterNormalized(clientX: number, clientY: number): Vector2 {    
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = this.renderer.getPixelRatio();
    const canvasRatioW = (this.canvas.width / rect.width) * pixelRatio || 0;
    const canvasRatioH = (this.canvas.height / rect.height) * pixelRatio || 0;
    const x = (clientX - rect.left) * canvasRatioW;
    const y = (clientY - rect.top) * canvasRatioH; 
    
    const canvasHalfWidth = rect.width * canvasRatioW / 2;
    const canvasHalfHeight = rect.height * canvasRatioH / 2;    
    const xC =  (x - canvasHalfWidth) / canvasHalfWidth;
    const yC =  (canvasHalfHeight - y) / canvasHalfHeight;

    return new Vector2(xC, yC);
  }

  convertWorldToCanvas(point: Vector3): Vector2 {
    const nPoint = new Vector3().copy(point).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    const canvasWidth = this.canvas.width / (this.canvas.width / rect.width) || 0;
    const canvasHeight = this.canvas.height / (this.canvas.height / rect.height) || 0;
    const x = (nPoint.x + 1) * canvasWidth / 2;
    const y = (nPoint.y - 1) * canvasHeight / -2;

    return new Vector2(x, y);
  }
  
  convertWorldToCanvasZeroCenter(point: Vector3): Vector2 {
    const nPoint = new Vector3().copy(point).project(this.camera);     

    // primitive hack to keep point in the right direction if it is outside of camera coverage
    if (nPoint.z > 1) {
      nPoint.x = - nPoint.x;
      nPoint.y = - nPoint.y;
    }

    const rect = this.canvas.getBoundingClientRect();
    const canvasWidth = this.canvas.width / (this.canvas.width / rect.width) || 0;
    const canvasHeight = this.canvas.height / (this.canvas.height / rect.height) || 0;
    const x = nPoint.x * canvasWidth / 2;
    const y = nPoint.y * canvasHeight / 2;

    return new Vector2(x, y);
  }
  //#endregion

  /**
   * prepare the scene for the next render frame
   * @param focusObjects 
   */
  private prepareToRender(focusObjects: Object3D[] = null) {
    if (focusObjects?.length) {
      this._cameraService.focusCameraOnObjects(focusObjects);
    }

    if (this._meshesNeedColorUpdate.size) {
      this._scenesService.renderScene.updateMeshColors(this._meshesNeedColorUpdate);
      this._meshesNeedColorUpdate.clear();
    }  
  }
}
