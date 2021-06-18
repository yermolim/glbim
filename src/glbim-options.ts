import { MeshMergeType, FastRenderType, CornerName, Vec4DoubleCS } from "./common-types";

export class GlbimOptions {
  /**
   * Enable WebGL anti-aliasing 
   */
  useAntialiasing = true;
  /**
   * Enable advanced physically correct lights 
   * (the option has no noticeable effect with the currently used materials)
   */
  usePhysicalLights = true; 
  /**
   * Intensity of the main scene ambient light source
   */
  ambientLightIntensity = 1;
  /**
   * Intensity of the main scene hemisphere light source
   */
  hemiLightIntensity = 0.4;
  /**
   * Intensity of the main scene directional light source
   */
  dirLightIntensity = 0.6;

  /**
   * Enable item highlighting on pointer being over the item
   */
  highlightingEnabled = true;
  /**
   * Color of the highlighted items
   * (final color is affected by the scene light settings)
   */
  highlightColor = 0xFFFF00;
  /**
   * Color of the selected items
   * (final color is affected by the scene light settings)
   */
  selectionColor = 0xFF0000;
  /**
   * Color of the isolated items
   * (final color is affected by the scene light settings)
   */
  isolationColor = 0x555555;
  /**
   * Opacity of the isolated items
   */
  isolationOpacity = 0.2;  

  /**
   * The type of mesh merging used to optimize large scenes performance,
   * reducing render calls by the cost of models opening speed and memory consumption.
   * 'model' - each model is merged into one mesh 
   * (slower models opening speed, average memory use, high render performance (with some opacity glitches)).
   * 'model+' - each model is merged into one mesh. large models (more than 1k items) are split into few meshes
   * (slower models opening speed, average memory use, high render performance (with some opacity glitches)).
   * 'scene' - all model in the scene is merged into one mesh
   * (slowest models opening speed, high memory use, highest render performance, recommended option).
   * null - mesh merging disabled (fastest models opening speed, low memory use, lowest render performance).
   */
  meshMergeType: MeshMergeType = null;
  /**
   * Experimental feature for improving render performance when 'meshMergeType' is set to null.
   * 'ch' - items are replaced with their convex hulls when the camera is moving to speed up render.
   * 'aabb' - items are replaced with their axis-aligned bounding boxes when the camera is moving to speed up render.
   * 'ombb' - (NOT IMPLEMENTED YET) items are replaced with their minimum bounding boxes when the camera is moving to speed up render.
   */
  fastRenderType: FastRenderType = null;

  /**
   * show the axes helper in the corner of the view
   */
  axesHelperEnabled = true;
  /**
   * the corner where the axes helper shall be placed
   */
  axesHelperPlacement: CornerName = "top-right";
  /**
   * the axes helper size (in px)
   */
  axesHelperSize = 128;

  /**
   * the base point of the scene. all models will be shifted relatively to this point
   */
  basePoint: Vec4DoubleCS = null;

  /**
   * defines if the camera focus should move to the programmatically selected items
   */
  selectionAutoFocusEnabled = true;

  /**
   * disables panning/zooming and rotating but enables area selection for touch events
   */
  cameraControlsDisabled = false;
  
  constructor(item: object = null) {
    if (item != null) {
      Object.assign(this, item);
    }
  }
}
