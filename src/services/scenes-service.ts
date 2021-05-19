import { GltfViewerOptions } from "../gltf-viewer-options";

import { Axes } from "../components/axes";
import { Lights } from "../components/lights";

import { HudScene } from "../scenes/hud/hud-scene";
import { RenderScene } from "../scenes/render-scene";
import { SimplifiedScene } from "../scenes/simplified-scene";

import { CameraService } from "./camera-service";
export class ScenesService {  
  private readonly _options: GltfViewerOptions;

  private _lights: Lights; 
  get lights(): Lights {
    return this._lights;
  }
  private _axes: Axes;  
  get axes(): Axes {
    return this._axes;
  }

  private _renderScene: RenderScene; 
  get renderScene(): RenderScene {
    return this._renderScene;
  }
  private _simplifiedScene: SimplifiedScene; 
  get simplifiedScene(): SimplifiedScene {
    return this._simplifiedScene;
  }
  private _hudScene: HudScene; 
  get hudScene(): HudScene {
    return this._hudScene;
  }

  constructor(container: HTMLElement, cameraService: CameraService, 
    options: GltfViewerOptions) {
    if (!options) {
      throw new Error("Options is not defined");
    }
    this._options = options;

    this._lights = new Lights(
      this._options.usePhysicalLights, 
      this._options.ambientLightIntensity, 
      this._options.hemiLightIntensity, 
      this._options.dirLightIntensity);
      
    this._axes = new Axes(container, 
      (axis) => cameraService.rotateToFaceTheAxis(axis, true),
      this._options.axesHelperEnabled,
      this._options.axesHelperPlacement,
      this._options.axesHelperSize);

    this._renderScene = new RenderScene({
      isolationColor: this._options.isolationColor, 
      isolationOpacity: this._options.isolationOpacity,
      selectionColor: this._options.selectionColor, 
      highlightColor: this._options.highlightColor
    });

    this._simplifiedScene = new SimplifiedScene();
    
    this._hudScene = new HudScene();
  }  

  destroy() {
    this._axes?.destroy();
    this._axes = null;

    this._hudScene?.destroy();
    this._hudScene = null;
    
    this._simplifiedScene?.destroy();
    this._simplifiedScene = null;

    this._renderScene?.destroy();
    this._renderScene = null;
  }
}
