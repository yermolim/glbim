import { Scene, Color, Vector2, Vector3, Sprite, SpriteMaterial,
  Camera, OrthographicCamera, WebGLRenderer, Mesh, SphereBufferGeometry, MeshBasicMaterial } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { Vec4, Distance, MeshBgAm } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { PointSnapHelper } from "../helpers/point-snap-helper";

type HudMarkerType = "m_snap" | "m_start" | "m_end";

type HudLineSegmentType = "m_dist_w" | "m_dist_x" | "m_dist_y" | "m_dist_z";

interface HudSpriteMarker {
  sprite: Sprite;
  center3d: Vector3;
}

interface HudLineSegmentInfo {
  segment: Line2;
  start3d: Vector3;
  end3d: Vector3;
}

export class HudScene {
  private _pointSnap: PointSnapHelper;

  private _scene: Scene;
  private _camera: OrthographicCamera;  

  private _lastResolution = new Vector2();
  private _measurePoints: {start: Vector3; end: Vector3} = {start: null, end: null};
  
  private _markerMaterials: SpriteMaterial[] = [];
  private _lineMaterials: LineMaterial[] = [];

  private _uniqueMarkers = new Map<HudMarkerType, HudSpriteMarker>();
  private _uniqueLineSegments = new Map<HudLineSegmentType, HudLineSegmentInfo>();

  constructor(renderer: WebGLRenderer) { 
    this._pointSnap = new PointSnapHelper();

    const scene = new Scene();
    this._scene = scene;

    this.buildLines();
    this.buildMarkers();

    const ctx = renderer.getContext();
    this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);
  }

  destroy() {
    this.destroyLines();
    this.destroyMarkers();

    this._scene = null;
  }

  render(mainCamera: Camera, renderer: WebGLRenderer) {
    const ctx = renderer.getContext();

    this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);
    this.updatePositions(mainCamera, renderer);
    
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this._scene, this._camera);

    // restore renderer settings
    renderer.autoClear = true;
  }
  
  // #region distance measurements 
  setSnapMarker(camera: Camera, renderer: WebGLRenderer, mesh: MeshBgAm,
    clientX: number, clientY: number): Vec4 {
    const position = PointSnapHelper.convertClientToCanvas(renderer, clientX, clientY);
    const point = this._pointSnap.getMeshSnapPointAtPosition(camera, renderer, position, mesh);
    return this.setSnapMarkerAtPoint(point);
  }

  setDistanceMarker(camera: Camera, renderer: WebGLRenderer, mesh: MeshBgAm,
    clientX: number, clientY: number): Distance {
    const position = PointSnapHelper.convertClientToCanvas(renderer, clientX, clientY);
    const point = this._pointSnap.getMeshSnapPointAtPosition(camera, renderer, position, mesh);
    return this.setDistanceMarkerAtPoint(point);
  }

  resetMeasureMarkers() {
    this._measurePoints.start = null;
    this._measurePoints.end = null;

    this.resetMarkers();
    this.resetLineSegments();
  }

  private setSnapMarkerAtPoint(point: Vector3): Vec4 {
    if (point) {
      this.setMarker("m_snap", point);
      return new Vec4(point.x, point.y, point.z, 0, true);
    } else {
      this.resetMarker("m_snap");
      return null;
    }
  }

  private setDistanceMarkerAtPoint(point: Vector3): Distance {
    if (!point) {
      if (this._measurePoints.start) {
        this._measurePoints.start = null;
      }
      if (this._measurePoints.end) {
        this._measurePoints.end = null;
      }
    } else {
      if (this._measurePoints.end) {
        this._measurePoints.start = this._measurePoints.end;
        this._measurePoints.end = point;
      } else if (this._measurePoints.start) {
        this._measurePoints.end = point;
      } else {
        this._measurePoints.start = point;     
      }
    }

    if (this._measurePoints.start) {
      this.setMarker("m_start", this._measurePoints.start);   
    } else {
      this.resetMarker("m_start");
    }

    if (this._measurePoints.end) {
      this.setMarker("m_end", this._measurePoints.end);
      this.setDistanceLines(true);
    } else {      
      this.resetMarker("m_end");
      this.resetDistanceLines();
    }
    
    if (this._measurePoints.start && this._measurePoints.end) {
      return new Distance(this._measurePoints.start, this._measurePoints.end, true);
    } else {
      return null;
    }
  }

  private setDistanceLines(toZUp: boolean) {  
    const wStart = this._measurePoints.start;
    const wEnd = this._measurePoints.end;

    const distance = new Vector3().copy(wEnd).sub(wStart);

    const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
    const yEnd = toZUp
      ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
      : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);

    this.setLineSegment("m_dist_z", yEnd, wEnd);
    this.setLineSegment("m_dist_y", xEnd, yEnd);
    this.setLineSegment("m_dist_x", wStart, xEnd);
    this.setLineSegment("m_dist_w", wStart, wEnd);
  }

  private resetDistanceLines() {    
    this.resetLineSegment("m_dist_w");
    this.resetLineSegment("m_dist_x");
    this.resetLineSegment("m_dist_y");
    this.resetLineSegment("m_dist_z");
  }
  // #endregion

  // #region common private methods 
  private updateResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (rendererBufferWidth === this._lastResolution.x
      && rendererBufferHeight === this._lastResolution.y) {
      return;
    }

    this.updateCameraResolution(rendererBufferWidth, rendererBufferHeight);
    this.updateLinesResolution(rendererBufferWidth, rendererBufferHeight);

    this._lastResolution.set(rendererBufferWidth, rendererBufferHeight);
  }

  private updatePositions(mainCamera: Camera, renderer: WebGLRenderer) {
    this.updateLineSegmentsPositions(mainCamera, renderer);
    this.updateMarkersPositions(mainCamera, renderer);
  }

  private updateCameraResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (!this._camera) {
      this._camera = new OrthographicCamera(rendererBufferWidth / -2, rendererBufferWidth / 2,
        rendererBufferHeight / 2, rendererBufferHeight / -2, 1, 10);
      this._camera.position.setZ(10);
    } else {
      this._camera.left = rendererBufferWidth / -2;
      this._camera.right = rendererBufferWidth / 2;
      this._camera.top = rendererBufferHeight / 2;
      this._camera.bottom = rendererBufferHeight / -2;
      this._camera.updateProjectionMatrix();
    }
  }
  // #endregion

  // #region markers
  private buildMarkers() {     
    this._uniqueMarkers.set("m_snap", this.buildRoundMarker(0xFF00FF, 8));
    this._uniqueMarkers.set("m_start", this.buildRoundMarker(0x391285, 8));
    this._uniqueMarkers.set("m_end", this.buildRoundMarker(0x00FFFF, 8));
  }  

  private destroyMarkers() {
    this._uniqueMarkers.forEach(v => this._scene.remove(v.sprite));
    this._uniqueMarkers = null;
    
    this._markerMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._markerMaterials = null;
  }
  
  private buildRoundMarker(color: number, diameterPx: number): HudSpriteMarker {
    const material = MaterialBuilder.buildCircleSpriteMaterial(64, color);
    this._markerMaterials.push(material);
    
    const sprite = new Sprite(material); 
    sprite.frustumCulled = false; 
    sprite.visible = false;  
    sprite.scale.set(diameterPx, diameterPx, 1); 
    sprite.position.set(0, 0, 2); 
    this._scene.add(sprite);

    return {
      sprite,
      center3d: new Vector3(),
    };
  }

  private setMarker(type: HudMarkerType, position: Vector3) {
    const hudMarker = this._uniqueMarkers.get(type);
    if (!hudMarker.sprite.visible) {
      hudMarker.sprite.visible = true;
    }
    hudMarker.center3d.copy(position);
  } 

  private resetMarker(type: HudMarkerType) {
    const hudMarker = this._uniqueMarkers.get(type);
    if (hudMarker.sprite.visible) {
      hudMarker.sprite.visible = false;
      hudMarker.center3d.set(0, 0, 0);
    }
  }  

  private resetMarkers() {
    [...this._uniqueMarkers.keys()].forEach(x => this.resetMarker(x));
  }

  private updateMarkersPositions(mainCamera: Camera, renderer: WebGLRenderer) {
    this._uniqueMarkers.forEach(v => {
      if (v.sprite.visible) {
        const positionProjected = PointSnapHelper.convertWorldToCanvasZeroCenter(mainCamera, renderer, v.center3d);
        v.sprite.position.set(positionProjected.x, positionProjected.y, 2);
      }
    });
  }
  // #endregion

  // #region lines
  private buildLines() {     
    this._uniqueLineSegments.set("m_dist_z", this.buildLineSegment(0x2c8FFF, 2, true));
    this._uniqueLineSegments.set("m_dist_y", this.buildLineSegment(0x8adb00, 2, true));
    this._uniqueLineSegments.set("m_dist_x", this.buildLineSegment(0xFF3653, 2, true));
    this._uniqueLineSegments.set("m_dist_w", this.buildLineSegment(0x0000FF, 4));
  }

  private destroyLines() {
    this._uniqueLineSegments?.forEach(v => { 
      this._scene.remove(v.segment);
      v.segment.geometry.dispose(); 
    });
    this._uniqueLineSegments = null;
    
    this._lineMaterials?.forEach(x => x.dispose());
    this._lineMaterials = null;
  }

  private buildLineSegment(color: number, width: number, dashed = false): HudLineSegmentInfo {
    const material = MaterialBuilder.buildLineMaterial(color, width, dashed);   
    this._lineMaterials.push(material);
    
    const geometry = new LineGeometry();
    geometry.setPositions([0, 0, 1, 0, 0, 1]);

    const segment = new Line2(geometry, material);   
    segment.frustumCulled = false;
    segment.visible = false;  
    this._scene.add(segment);

    return {
      segment: segment,
      start3d: new Vector3(),
      end3d: new Vector3(),
    };
  }

  private setLineSegment(type: HudLineSegmentType, start: Vector3, end: Vector3) {
    const hudLineSegment = this._uniqueLineSegments.get(type);
    if (!hudLineSegment.segment.visible) {
      hudLineSegment.segment.visible = true;
    }
    hudLineSegment.start3d.copy(start);
    hudLineSegment.end3d.copy(end);  
  }

  private resetLineSegment(type: HudLineSegmentType) {
    const hudLine = this._uniqueLineSegments.get(type);
    if (hudLine.segment.visible) {
      hudLine.segment.visible = false;
      hudLine.start3d.set(0, 0, 0);
      hudLine.end3d.set(0, 0, 0);  
    }
  }

  private resetLineSegments() {    
    [...this._uniqueLineSegments.keys()].forEach(x => this.resetLineSegment(x));
  }

  private updateLinesResolution(rendererBufferWidth: number, rendererBufferHeight: number) {    
    this._lineMaterials.forEach(x => x.resolution.set(rendererBufferWidth, rendererBufferHeight));
  }
  
  private updateLineSegmentsPositions(mainCamera: Camera, renderer: WebGLRenderer) {
    this._uniqueLineSegments.forEach(v => {
      if (v.segment.visible) {
        const startProjected = PointSnapHelper.convertWorldToCanvasZeroCenter(mainCamera, renderer, v.start3d);
        const endProjected = PointSnapHelper.convertWorldToCanvasZeroCenter(mainCamera, renderer, v.end3d);

        v.segment.geometry.setPositions([startProjected.x, startProjected.y, 1, endProjected.x, endProjected.y, 1]);
        v.segment.computeLineDistances();
      }
    });
  }
  // #endregion
}
