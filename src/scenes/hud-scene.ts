import { Scene, Vector2, Vector3, Mesh, Sprite, 
  Material, SpriteMaterial,
  Camera, OrthographicCamera, WebGLRenderer, 
  InstancedBufferGeometry, 
  CanvasTexture,
  PlaneGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Matrix4,
  RawShaderMaterial,
  PointsMaterial,
  BufferGeometry,
  IUniform} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { Vec4, Distance } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { CanvasTextureBuilder } from "../helpers/canvas-texture-builder";
import { PointSnapHelper } from "../helpers/point-snap-helper";

type DmMarkerType = "m_snap" | "m_start" | "m_end";

type DmLineSegmentType = "m_dist_w" | "m_dist_x" | "m_dist_y" | "m_dist_z";

interface IHudSettable {
  set: (positions: Vector3[]) => void;
  reset: () => void;
}

class HudUniqueMarker implements IHudSettable {
  sprite: Sprite;

  constructor(sprite: Sprite) {
    this.sprite = sprite;
  }

  set(positions: Vector3[]) {
    if (positions?.length !== 1) {
      this.reset();
      return;
    }

    if (!this.sprite.visible) {
      this.sprite.visible = true;
    }
    this.sprite.position.copy(positions[0]);
  } 

  reset() {
    if (this.sprite.visible) {
      this.sprite.visible = false;
      this.sprite.position.set(0, 0, 0);
    }
  }  
}

class HudLineSegment implements IHudSettable {
  segment: Line2;

  constructor(segment: Line2) {
    this.segment = segment;
  }

  set(positions: Vector3[]) {
    if (positions?.length !== 2) {
      this.reset();
      return;
    }
    
    const [start, end] = positions;
    if (!this.segment.visible) {
      this.segment.visible = true;
    }
    this.segment.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);    
  }

  reset() {
    if (this.segment.visible) {
      this.segment.visible = false;
      this.segment.geometry.setPositions(new Array(6).fill(0));
    }
  }
}

export class HudScene {
  private readonly _cameraZ = 10;

  private _scene: Scene;
  private _camera: OrthographicCamera;  

  private _hudResolution = new Vector2();
  private _hudScale = new Matrix4();
  private _hudProjectionMatrix  = new Matrix4();

  private _measurePoints: {start: Vector3; end: Vector3} = {start: null, end: null};
  
  private _markerMaterials: SpriteMaterial[] = [];
  private _lineMaterials: LineMaterial[] = [];

  private _uniqueMarkers = new Map<DmMarkerType, HudUniqueMarker>();
  private _uniqueLineSegments = new Map<DmLineSegmentType, HudLineSegment>();

  constructor() { 
    const scene = new Scene();
    this._scene = scene;

    this.initLines();
    this.initMarkers();
  }

  destroy() {
    this.destroyLines();
    this.destroyMarkers();

    this._scene = null;
  }

  render(mainCamera: Camera, renderer: WebGLRenderer) {
    const ctx = renderer.getContext();

    this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);  
    this.updateHudProjectionMatrix(mainCamera, renderer);
    
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this._scene, this._camera);

    // restore renderer settings
    renderer.autoClear = true;
  }
  
  // #region distance measurements 
  setMeasureSnapMarker(point: Vector3): Vec4 {
    if (point) {
      this._uniqueMarkers.get("m_snap").set([point]);
      return new Vec4(point.x, point.y, point.z, 0, true);
    } else {
      this._uniqueMarkers.get("m_snap").reset();
      return null;
    }
  }

  setMeasureEndMarker(point: Vector3): Distance {
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
      this._uniqueMarkers.get("m_start").set([this._measurePoints.start]);   
    } else {
      this._uniqueMarkers.get("m_start").reset(); 
    }

    if (this._measurePoints.end) {
      this._uniqueMarkers.get("m_end").set([this._measurePoints.end]);  
      this.setMeasureLines(true);
    } else {      
      this._uniqueMarkers.get("m_end").reset(); 
      this.resetMeasureLines();
    }
    
    if (this._measurePoints.start && this._measurePoints.end) {
      return new Distance(this._measurePoints.start, this._measurePoints.end, true);
    } else {
      return null;
    }
  }
  
  resetMeasures() {
    this._measurePoints.start = null;
    this._measurePoints.end = null;

    this.resetMeasureMarkers();
    this.resetMeasureLines();
  }  
  
  private resetMeasureMarkers() {   
    this._uniqueMarkers.get("m_snap").reset(); 
    this._uniqueMarkers.get("m_start").reset(); 
    this._uniqueMarkers.get("m_end").reset(); 
  }

  private setMeasureLines(toZUp: boolean) {  
    const wStart = this._measurePoints.start;
    const wEnd = this._measurePoints.end;

    const distance = new Vector3().copy(wEnd).sub(wStart);

    const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
    const yEnd = toZUp
      ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
      : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);

    this._uniqueLineSegments.get("m_dist_z").set([yEnd, wEnd]);
    this._uniqueLineSegments.get("m_dist_y").set([xEnd, yEnd]);
    this._uniqueLineSegments.get("m_dist_x").set([wStart, xEnd]);
    this._uniqueLineSegments.get("m_dist_w").set([wStart, wEnd]);
  }

  private resetMeasureLines() {    
    this._uniqueLineSegments.get("m_dist_z").reset();
    this._uniqueLineSegments.get("m_dist_y").reset();
    this._uniqueLineSegments.get("m_dist_x").reset();
    this._uniqueLineSegments.get("m_dist_w").reset();
  }
  // #endregion

  // #region common private methods 
  private updateResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (rendererBufferWidth === this._hudResolution.x
      && rendererBufferHeight === this._hudResolution.y) {
      return;
    }

    this.updateCameraResolution(rendererBufferWidth, rendererBufferHeight);
    this.updateLinesResolution(rendererBufferWidth, rendererBufferHeight);

    this._hudResolution.set(rendererBufferWidth, rendererBufferHeight);
  }

  private updateCameraResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (!this._camera) {
      this._camera = new OrthographicCamera(rendererBufferWidth / -2, rendererBufferWidth / 2,
        rendererBufferHeight / 2, rendererBufferHeight / -2, 1, 10);
      this._camera.position.setZ(this._cameraZ);
    } else {
      this._camera.left = rendererBufferWidth / -2;
      this._camera.right = rendererBufferWidth / 2;
      this._camera.top = rendererBufferHeight / 2;
      this._camera.bottom = rendererBufferHeight / -2;
      this._camera.updateProjectionMatrix();
    }
  }

  private updateHudProjectionMatrix(camera: Camera, renderer: WebGLRenderer) { 
    this._hudScale.makeScale(this._hudResolution.x / 2, this._hudResolution.y / 2, 1);
    this._hudProjectionMatrix.copy(this._hudScale)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
  }

  private projectToHud = (point: Vector3) => {
    point.applyMatrix4(this._hudProjectionMatrix);
    if (point.z > 1) {
      point.x = - point.x;
      point.y = - point.y;
    }
  };
  // #endregion

  // #region markers
  private initMarkers() {     
    this._uniqueMarkers.set("m_start", this.buildRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0x391285), 8, 3));
    this._uniqueMarkers.set("m_end", this.buildRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0x00FFFF), 8, 3));
    this._uniqueMarkers.set("m_snap", this.buildRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0xFF00FF), 8, 3));
  }  

  private destroyMarkers() {
    this._uniqueMarkers.forEach(v => this._scene.remove(v.sprite));
    this._uniqueMarkers = null;
    
    this._markerMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._markerMaterials = null;
  }
  
  private buildRoundMarker(texture: CanvasTexture, sizePx: number, zIndex: number): HudUniqueMarker {
    const material = MaterialBuilder.buildSpriteMaterial(texture); 
    material.onBeforeCompile = shader => {    
      shader.uniforms = Object.assign({}, shader.uniforms,
        { hudMatrix: { value: this._hudProjectionMatrix }});
      shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform mat4 hudMatrix;

        vec3 applyMatrix4(vec3 vec, mat4 mat) {
          vec3 result = vec3(0.0);
          float w = 1.0 / (mat[0].w * vec.x + mat[1].w * vec.y + mat[2].w * vec.z + mat[3].w);
          result .x = (mat[0].x * vec.x + mat[1].x * vec.y + mat[2].x * vec.z + mat[3].x) * w;
          result .y = (mat[0].y * vec.x + mat[1].y * vec.y + mat[2].y * vec.z + mat[3].y) * w;
          result .z = (mat[0].z * vec.x + mat[1].z * vec.y + mat[2].z * vec.z + mat[3].z) * w;
          return result;			
        }

        void main() {
      `);
      shader.vertexShader = shader.vertexShader.replace(
        "vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );",
        ` 
          vec3 globalPosition = modelMatrix[3].xyz;
          vec3 hudPosition = applyMatrix4(globalPosition, hudMatrix);
          if (hudPosition.z > 1.0) {
            hudPosition.x = -hudPosition.x;
            hudPosition.y = -hudPosition.y;
          }
          hudPosition.z = ${(zIndex - this._cameraZ).toFixed()}.0;

          vec4 mvPosition = mat4(
            modelViewMatrix[0], 
            modelViewMatrix[1], 
            modelViewMatrix[2], 
            vec4(hudPosition, 1)
          ) * vec4( 0.0, 0.0, 0.0, 1.0 );
        `
      );
    };
    material.needsUpdate = true;    
    this._markerMaterials.push(material); 

    const sprite = new Sprite(material); 
    sprite.visible = false;  
    sprite.scale.set(sizePx, sizePx, 1); 
    sprite.position.set(0, 0, 2); 
    sprite.frustumCulled = false;
    this._scene.add(sprite);

    return new HudUniqueMarker(sprite);
  }
  // #endregion

  // #region lines
  private initLines() {     
    this._uniqueLineSegments.set("m_dist_z", this.buildLineSegment(0x2c8FFF, 2, 1, true));
    this._uniqueLineSegments.set("m_dist_y", this.buildLineSegment(0x8adb00, 2, 1, true));
    this._uniqueLineSegments.set("m_dist_x", this.buildLineSegment(0xFF3653, 2, 1, true));
    this._uniqueLineSegments.set("m_dist_w", this.buildLineSegment(0x0000FF, 4, 2));
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

  private buildLineSegment(color: number, width: number, zIndex: number, dashed = false): HudLineSegment {
    const material = MaterialBuilder.buildLineMaterial(color, width, dashed);   
    material.onBeforeCompile = shader => {        
      shader.uniforms = Object.assign({}, shader.uniforms,
        { hudMatrix: { value: this._hudProjectionMatrix }});
      shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform mat4 hudMatrix;

        vec3 applyMatrix4(vec3 vec, mat4 mat) {
          vec3 result = vec3(0.0);
          float w = 1.0 / (mat[0].w * vec.x + mat[1].w * vec.y + mat[2].w * vec.z + mat[3].w);
          result .x = (mat[0].x * vec.x + mat[1].x * vec.y + mat[2].x * vec.z + mat[3].x) * w;
          result .y = (mat[0].y * vec.x + mat[1].y * vec.y + mat[2].y * vec.z + mat[3].y) * w;
          result .z = (mat[0].z * vec.x + mat[1].z * vec.y + mat[2].z * vec.z + mat[3].z) * w;
          return result;			
        }

        void main() {
          vec3 hudStart = applyMatrix4(instanceStart, hudMatrix);
          if (hudStart.z > 1.0) {
            hudStart.x = -hudStart.x;
            hudStart.y = -hudStart.y;
          }
          hudStart.z = ${zIndex}.0;

          vec3 hudEnd = applyMatrix4(instanceEnd, hudMatrix);
          if (hudEnd.z > 1.0) {
            hudEnd.x = -hudEnd.x;
            hudEnd.y = -hudEnd.y;
          }
          hudEnd.z = ${zIndex}.0;

          float hudDistanceStart = 0.0;
          float hudDistanceEnd = length(hudEnd - hudStart);
      `);
      shader.vertexShader = shader.vertexShader.replace(
        "vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;",
        "vLineDistance = ( position.y < 0.5 ) ? dashScale * hudDistanceStart : dashScale * hudDistanceEnd;"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );",
        "vec4 start = modelViewMatrix * vec4( hudStart, 1.0 );"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );",
        "vec4 end = modelViewMatrix * vec4( hudEnd, 1.0 );"
      );
    };
    material.needsUpdate = true;    
    this._lineMaterials.push(material);
    
    const geometry = new LineGeometry();
    geometry.setPositions(new Array(6).fill(0));

    const segment = new Line2(geometry, material);   
    segment.frustumCulled = false;
    segment.visible = false;  
    this._scene.add(segment);

    return new HudLineSegment(segment);
  }

  private updateLinesResolution(rendererBufferWidth: number, rendererBufferHeight: number) {    
    this._lineMaterials.forEach(x => x.resolution.set(rendererBufferWidth, rendererBufferHeight));
  }
  // #endregion
}
