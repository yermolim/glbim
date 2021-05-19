import { BehaviorSubject } from "rxjs";
import { NoToneMapping, Object3D, sRGBEncoding, WebGLRenderer } from "three";

import { GltfViewerOptions } from "../gltf-viewer-options";
import { MeshBgSm } from "../common-types";

import { CameraControls } from "../components/camera-controls";
import { ModelLoader } from "../components/model-loader";

import { ScenesService } from "./scenes-service";

export class RenderService { 
  private readonly _lastFrameTimeSubject: BehaviorSubject<number>;  
  private readonly _container: HTMLElement;

  private _options: GltfViewerOptions;    
  set options(value: GltfViewerOptions) {
    this._options = value;
  }

  private _renderer: WebGLRenderer;
  get renderer(): WebGLRenderer {
    return this._renderer;
  }
  private _deferRender: number;
  
  private readonly _cameraControls: CameraControls; 
  private readonly _loader: ModelLoader;  
  private readonly _scenesService: ScenesService;
  
  private _meshesNeedColorUpdate = new Set<MeshBgSm>();

  constructor(container: HTMLElement, loader: ModelLoader, 
    cameraControls: CameraControls, scenesService: ScenesService, 
    options: GltfViewerOptions, lastFrameTimeSubject?: BehaviorSubject<number>) {
    if (!container) {
      throw new Error("Container is not defined");
    }
    if (!loader) {
      throw new Error("Loader is not defined");
    }
    if (!cameraControls) {
      throw new Error("CameraControls is not defined");
    }
    if (!scenesService) {
      throw new Error("SceneService is not defined");
    }
    if (!options) {
      throw new Error("Options is not defined");
    }

    this._container = container;
    this._loader = loader;
    this._cameraControls = cameraControls;
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

    this._cameraControls.focusCameraOnObjects(null);

    this._container.append(this._renderer.domElement);
  }

  destroy() {
    this._renderer.domElement.remove();
    this._renderer.dispose();
    this._renderer.forceContextLoss();
    this._renderer = null;
  }
    
  resizeRenderer = () => {
    const { width, height } = this._container.getBoundingClientRect();
    this._cameraControls?.resize(width, height);
    if (this._renderer) {
      this._renderer.setSize(width, height, false);
      this.render();   
    }
  };

  async updateRenderSceneAsync(): Promise<void> {
    await this._scenesService.renderScene.updateSceneAsync(this._scenesService.lights.getLights(), 
      this._loader.loadedMeshesArray, this._loader.loadedModelsArray,
      this._options.meshMergeType);
      
    if (this._options.fastRenderType) {
      await this._scenesService.simplifiedScene.updateSceneAsync(this._scenesService.lights.getCopy(), 
        this._loader.loadedMeshesArray, 
        this._options.fastRenderType);
    } else {
      this._scenesService.simplifiedScene.clearScene();
    }

    this.renderWholeScene();
  }

  renderOnCameraMove() {
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

  render(focusObjects: Object3D[] = null, fast = false) {
    this.prepareToRender(focusObjects);
    requestAnimationFrame(() => { 
      if (!this._renderer) {
        return;
      }

      const start = performance.now();

      if (fast && this._scenesService.simplifiedScene?.scene) {
        this._renderer.render(this._scenesService.simplifiedScene.scene, this._cameraControls.camera);
      } else if (this._scenesService.renderScene?.scene) {
        this._renderer.render(this._scenesService.renderScene.scene, this._cameraControls.camera);
      }
      this._scenesService.hudScene?.render(this._cameraControls.camera, this._renderer);
      this._scenesService.axes?.render(this._cameraControls.camera, this._renderer);

      const frameTime = performance.now() - start;
      this._lastFrameTimeSubject?.next(frameTime);
    });
  }  

  renderWholeScene() {    
    this.render(this._loader.loadedMeshesArray.length ? [this._scenesService.renderScene.scene] : null);
  }

  enqueueMeshForColorUpdate(mesh: MeshBgSm) {
    this._meshesNeedColorUpdate.add(mesh);
  }

  private prepareToRender(focusObjects: Object3D[] = null) {
    if (focusObjects?.length) {
      this._cameraControls.focusCameraOnObjects(focusObjects);
    }

    if (this._meshesNeedColorUpdate.size) {
      this._scenesService.renderScene.updateMeshColors(this._meshesNeedColorUpdate);
      this._meshesNeedColorUpdate.clear();
    }  
  }
}
