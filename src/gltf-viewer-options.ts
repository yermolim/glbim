import { MeshMergeType } from "./common-types";

export class GltfViewerOptions {
  dracoDecoderEnabled = true;
  dracoDecoderPath = "/assets/draco/";  

  highlightingEnabled = true;
  highlightColor = 0xFFFF00;

  selectionColor = 0xFF0000;
    
  isolationColor = 0x555555;
  isolationOpacity = 0.2;

  physicalLights = false;
  ambientLight = true;
  ambientLightIntensity = 1;
  hemiLight = true;
  hemiLightIntensity = 0.4;
  dirLight = true;
  dirLightIntensity = 0.6;

  useAntialiasing = true;

  meshMergeType: MeshMergeType = null;
  
  constructor(item: object = null) {
    if (item != null) {
      Object.assign(this, item);
    }
  }
}
