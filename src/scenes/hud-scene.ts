/* eslint-disable @typescript-eslint/no-use-before-define */
import { Subject, BehaviorSubject, Observable } from "rxjs";

import { Scene, Vector2, Vector3, Vector4, Matrix4, Object3D, 
  Sprite, CanvasTexture, InstancedBufferAttribute,
  Camera, OrthographicCamera, WebGLRenderer } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { Vec4DoubleCS, Distance, WarningInfo, SnapPoint } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { CanvasTextureBuilder } from "../helpers/canvas-texture-builder";

// #region hud elements
interface IHudElement {
  object3d: Object3D;
  update: () => void;
  destroy: () => void;
  set: (data: any[]) => void;
  reset: () => void;
}

interface HudInstancedMarkerData {
  position: Vector3; 
  uv: Vector4; 
  scale: number;
}

class HudInstancedMarker implements IHudElement {
  private _sprite: Sprite;

  get object3d(): Object3D {
    return this._sprite;
  }

  constructor(hudProjectionMatrix: Matrix4, hudResolution: Vector2, texture: CanvasTexture, 
    sizePx: number, spriteZIndex: number, cameraZIndex: number, keepVisible: boolean, maxInstances = 10000) {
    const material = MaterialBuilder.buildSpriteMaterial(texture);
    material.onBeforeCompile = shader => {    
      shader.uniforms = Object.assign({}, shader.uniforms, { 
        hudMatrix: { value: hudProjectionMatrix },
        resolution: { value: hudResolution },
      });
      shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform vec2 resolution;
        uniform mat4 hudMatrix;
        attribute vec3 instancePosition;
        attribute vec4 instanceUv;
        attribute float instanceScale;

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
      shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `
        #ifdef USE_UV
          vec2 iUv = vec2(uv.x == 0.0 ? instanceUv.x : instanceUv.z, uv.y == 0.0 ? instanceUv.y : instanceUv.w);          
          vUv = (uvTransform * vec3(iUv, 1)).xy;
        #endif
      `);
      shader.vertexShader = shader.vertexShader.replace(
        "vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );", "");
      shader.vertexShader = shader.vertexShader.replace(
        "#ifndef USE_SIZEATTENUATION",
        ` 
          scale.x *= instanceScale;
          scale.y *= instanceScale;

          vec3 hudPosition = applyMatrix4(instancePosition, hudMatrix);
          if (hudPosition.z > 1.0) {
            gl_Position = vec4(0.0, 0.0, 0.0, -1.0);
            return;
          }
          hudPosition.z = ${(spriteZIndex - cameraZIndex).toFixed()}.0;
        `
        + 
        (keepVisible 
          ? `
            vec2 halfRes = resolution * 0.5;
            if (hudPosition.x > halfRes.x) {
              hudPosition.x = halfRes.x - scale.x * 0.5;
            } else if (hudPosition.x < -halfRes.x) {
              hudPosition.x = -halfRes.x + scale.x * 0.5;
            }
            if (hudPosition.y > halfRes.y) {
              hudPosition.y = halfRes.y - scale.y * 0.5;
            } else if (hudPosition.y < -halfRes.y) {
              hudPosition.y = -halfRes.y + scale.y * 0.5;
            }
          `
          : "")
        +        
        `
          vec4 mvPosition = mat4(
            modelViewMatrix[0], 
            modelViewMatrix[1], 
            modelViewMatrix[2], 
            vec4(hudPosition, 1)
          ) * vec4(0.0, 0.0, 0.0, 1.0);

          #ifndef USE_SIZEATTENUATION
        `
      );
    };

    const sprite = new Sprite(material); 
    sprite.geometry = sprite.geometry.clone(); // clone geometry because all sprites use same geometry
    sprite.geometry.setAttribute("instancePosition", new InstancedBufferAttribute(new Float32Array(3 * maxInstances), 3));
    sprite.geometry.setAttribute("instanceUv", new InstancedBufferAttribute(new Float32Array(4 * maxInstances), 4));
    sprite.geometry.setAttribute("instanceScale", new InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    sprite.geometry["isInstancedBufferGeometry"] = false;
    sprite.geometry["instanceCount"] = 0;
    sprite.frustumCulled = false;
    sprite.visible = false;
    sprite.scale.set(sizePx, sizePx, 1);  
    sprite.position.set(0, 0, 0); 

    this._sprite = sprite;
  }

  update() {

  }

  destroy() {
    this._sprite.geometry.dispose();
    this._sprite = null;
  }

  set(data: HudInstancedMarkerData[]) {
    const instancePosition = this._sprite.geometry.getAttribute("instancePosition");
    const instanceUv = this._sprite.geometry.getAttribute("instanceUv");
    const instanceScale = this._sprite.geometry.getAttribute("instanceScale");
    const maxPositionCount = instancePosition.count;
    if (!data?.length) {
      this.reset();
      return;
    } else if (data.length > maxPositionCount) {
      data = data.slice(0, maxPositionCount);
    }    
    this._sprite.geometry["isInstancedBufferGeometry"] = true;
    this._sprite.geometry["instanceCount"] = data.length;
    data.forEach((d, i) => {
      instancePosition.setXYZ(i, d.position.x, d.position.y, d.position.z);
      instanceUv.setXYZW(i, d.uv.x, d.uv.y, d.uv.z, d.uv.w);
      instanceScale.setX(i, d.scale);
    });  
    instancePosition.needsUpdate = true;
    instanceUv.needsUpdate = true;
    instanceScale.needsUpdate = true;
    this._sprite.visible = true;
  } 

  reset() {
    if (this._sprite.visible) {
      this._sprite.visible = false;
      this._sprite.geometry["isInstancedBufferGeometry"] = false;
      this._sprite.geometry["instanceCount"] = 0;
    }
  }  
}

class HudUniqueMarker implements IHudElement {
  private _sprite: Sprite;

  get object3d(): Object3D {
    return this._sprite;
  }

  constructor(hudProjectionMatrix: Matrix4, texture: CanvasTexture, sizePx: number, 
    markerZIndex: number, cameraZIndex: number) {
    const material = MaterialBuilder.buildSpriteMaterial(texture); 
    material.onBeforeCompile = shader => {    
      shader.uniforms = Object.assign({}, shader.uniforms,
        { hudMatrix: { value: hudProjectionMatrix }});
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
          hudPosition.z = ${(markerZIndex - cameraZIndex).toFixed()}.0;

          vec4 mvPosition = mat4(
            modelViewMatrix[0], 
            modelViewMatrix[1], 
            modelViewMatrix[2], 
            vec4(hudPosition, 1)
          ) * vec4( 0.0, 0.0, 0.0, 1.0 );
        `
      );
    };    

    const sprite = new Sprite(material); 
    sprite.visible = false;  
    sprite.scale.set(sizePx, sizePx, 1); 
    sprite.position.set(0, 0, 0); 
    sprite.frustumCulled = false;

    this._sprite = sprite;
  }

  update() {

  }

  destroy() {
    // this._sprite.geometry.dispose(); // don't dispose, because all sprites use same geometry
    this._sprite.material.dispose();
    this._sprite = null;
  }

  set(positions: Vector3[]) {
    if (positions?.length !== 1) {
      this.reset();
      return;
    }
    this._sprite.position.copy(positions[0]);
    this._sprite.visible = true;
  } 

  reset() {
    if (this._sprite.visible) {
      this._sprite.visible = false;
      this._sprite.position.set(0, 0, 0);
    }
  }  
}

class HudLineSegment implements IHudElement {
  private _hudResolution: Vector2;
  private _segment: Line2;

  get object3d(): Object3D {
    return this._segment;
  }

  constructor(hudProjectionMatrix: Matrix4, hudResolution: Vector2,
    color: number, width: number, zIndex: number, dashed = false) {
    this._hudResolution = hudResolution;

    const material = MaterialBuilder.buildLineMaterial(color, width, dashed);   
    material.onBeforeCompile = shader => {        
      shader.uniforms = Object.assign({}, shader.uniforms,
        { hudMatrix: { value: hudProjectionMatrix }});
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
    
    const geometry = new LineGeometry();
    geometry.setPositions(new Array(6).fill(0));
    
    const segment = new Line2(geometry, material);   
    segment.frustumCulled = false;
    segment.visible = false;

    this._segment = segment;
  }

  update() {
    this._segment.material.resolution.copy(this._hudResolution);
  }

  destroy() {
    this._segment.geometry.dispose();
    this._segment.material.dispose();
    this._segment = null;
  }

  set(positions: Vector3[]) {
    if (positions?.length !== 2) {
      this.reset();
      return;
    }
    
    const [start, end] = positions;
    if (!this._segment.visible) {
      this._segment.visible = true;
    }
    this._segment.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);    
  }

  reset() {
    if (this._segment.visible) {
      this._segment.visible = false;
      this._segment.geometry.setPositions(new Array(6).fill(0));
    }
  }
}
// #endregion

// #region hud tools 
class HudTool {
  protected _hudResolution = new Vector2();
  protected _hudProjectionMatrix  = new Matrix4();
  protected _hudScene: Scene;

  protected _toolZIndex: number;
  protected _cameraZIndex: number;

  protected _subjects: Subject<any>[] = [];

  private _hudElements = new Map<string, IHudElement>();


  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4,
    toolZIndex: number, cameraZIndex: number) { 
    this._hudScene = hudScene;
    this._hudResolution = hudResolution;
    this._hudProjectionMatrix = hudProjectionMatrix;

    this._toolZIndex = toolZIndex;
    this._cameraZIndex = cameraZIndex;
  }

  destroy() {
    this.destroyHudElements();
    this._subjects.forEach(x => x.complete());
  }

  update() {
    this._hudElements.forEach(x => x.update());
  }

  protected getHudElement(key: string) {
    return this._hudElements.get(key);
  }
  
  protected addHudElement(element: IHudElement, key: string) {
    if (!element?.object3d) {
      return;
    }
    if (this._hudElements.has(key)) {
      this.removeHudElement(key);
    }
    this._hudElements.set(key, element);
    this._hudScene.add(element.object3d);
  }
    
  protected removeHudElement(key: string) {
    const element = this._hudElements.get(key);
    if (element) {
      this._hudScene.remove(element.object3d);
      element.destroy();
      this._hudElements.delete(key);
    }
  }
      
  protected clearHudElements() {
    this._hudElements.forEach(v => {
      this._hudScene.remove(v.object3d);
      v.destroy();
    });
    this._hudElements.clear();
  }

  private destroyHudElements() {    
    this._hudElements.forEach(v => {
      this._hudScene.remove(v.object3d);
      v.destroy();
    });
    this._hudElements = null;
  }
}

class HudPointSnap extends HudTool { 
  snapPointChange$: Observable<SnapPoint>;
  snapPointSelectionChange$: Observable<SnapPoint[]>;
  
  private _snapPointChange = new Subject<SnapPoint>();  
  private _snapPointSelectionChange: BehaviorSubject<SnapPoint[]>;

  private _selectedPoints = new Map<string, Vector3>();
  
  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex);

    this._snapPointChange = new Subject<SnapPoint>();
    this._snapPointSelectionChange = new BehaviorSubject<SnapPoint[]>([]);
    this._subjects.push(this._snapPointChange, this._snapPointSelectionChange);    
    this.snapPointChange$ = this._snapPointChange.asObservable();
    this.snapPointSelectionChange$ = this._snapPointSelectionChange.asObservable();

    this.initSprites();    
  }
    
  setSnapMarker(snapPoint: SnapPoint) {
    if (snapPoint) {
      this.getHudElement("s_snap").set([snapPoint.position.toVector3()]);
      this._snapPointChange.next(snapPoint);
    } else {
      this.getHudElement("s_snap").reset();
      this._snapPointChange.next(null);
    }
  }

  addSelectedPoint(point: SnapPoint) {

  }

  removeSelectedPoint(point: SnapPoint) {

  }

  setSelectedPoints(points: SnapPoint[]) {
    
  }

  resetSelectedPoints() {

  }
  
  reset() {
    this.resetSprites();
  } 
  
  private initSprites() {
    this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution,
      CanvasTextureBuilder.buildCircleTexture(64, 0xFF0000), 8, 
      this._toolZIndex, this._cameraZIndex, false), "s_snap_selection");
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0xFF00FF), 8, 
      this._toolZIndex, this._cameraZIndex), "s_snap");
  }  
    
  private resetSprites() {   
    this.getHudElement("s_snap").reset(); 
  }
}

class HudDistanceMeasurer extends HudTool {  
  distanceMeasureChange$: Observable<Distance>;

  private _distanceMeasureChange: Subject<Distance>;  

  private _measurePoints: {start: Vector3; end: Vector3} = {start: null, end: null};

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex);

    this._distanceMeasureChange = new Subject<Distance>(); 
    this._subjects.push(this._distanceMeasureChange);
    this.distanceMeasureChange$ = this._distanceMeasureChange.asObservable();

    this.initLines();
    this.initSprites();
  }

  setEndMarker(point: Vector3) {
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
      this.getHudElement("s_dm_start").set([this._measurePoints.start]);   
    } else {
      this.getHudElement("s_dm_start").reset(); 
    }

    if (this._measurePoints.end) {
      this.getHudElement("s_dm_end").set([this._measurePoints.end]);  
      this.setLines(true);
    } else {      
      this.getHudElement("s_dm_end").reset(); 
      this.resetLines();
    }
    
    if (this._measurePoints.start && this._measurePoints.end) {
      const start = Vec4DoubleCS.fromVector3(this._measurePoints.start);
      const end = Vec4DoubleCS.fromVector3(this._measurePoints.end);
      const distance = new Distance(start.toVec4(true), end.toVec4(true));
      this._distanceMeasureChange.next(distance);
    } else {
      this._distanceMeasureChange.next(null); 
    }
  }
  
  reset() {
    this._measurePoints.start = null;
    this._measurePoints.end = null;

    this.resetSprites();
    this.resetLines();
  }  

  private initLines() {    
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution,
      0x2c8FFF, 2, this._toolZIndex, true), "l_dm_z");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0x8adb00, 2, this._toolZIndex, true), "l_dm_y");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0xFF3653, 2, this._toolZIndex, true), "l_dm_x");
    this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 
      0x0000FF, 4, this._toolZIndex), "l_dm_w");
  }

  private setLines(toZUp: boolean) {  
    const wStart = this._measurePoints.start;
    const wEnd = this._measurePoints.end;

    const distance = new Vector3().copy(wEnd).sub(wStart);

    const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
    const yEnd = toZUp
      ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
      : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);

    this.getHudElement("l_dm_z").set([yEnd, wEnd]);
    this.getHudElement("l_dm_y").set([xEnd, yEnd]);
    this.getHudElement("l_dm_x").set([wStart, xEnd]);
    this.getHudElement("l_dm_w").set([wStart, wEnd]);
  }

  private resetLines() {    
    this.getHudElement("l_dm_z").reset();
    this.getHudElement("l_dm_y").reset();
    this.getHudElement("l_dm_x").reset();
    this.getHudElement("l_dm_w").reset();
  }

  private initSprites() {     
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0x391285), 8, this._toolZIndex, this._cameraZIndex), "s_dm_start");
    this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, 
      CanvasTextureBuilder.buildCircleTexture(64, 0x00FFFF), 8, this._toolZIndex, this._cameraZIndex), "s_dm_end");
  }  
  
  private resetSprites() {   
    this.getHudElement("s_dm_start").reset(); 
    this.getHudElement("s_dm_end").reset(); 
  }
}

class HudWarnings extends HudTool {  
  private readonly _spriteSize = 16;
  
  private _warnings = new Map<string, WarningInfo>();  
  private _selectedWarnings = new Set<WarningInfo>();  
  private _hoveredWarning: WarningInfo;

  private _tempVec3 = new Vector3();
  private _tempVec2 = new Vector2();

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4, 
    toolZIndex: number, cameraZIndex: number) { 
    super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex);

    this.initSprites();
    
    // TEMP
    // const warnings = new Array(10000);
    // for (let i = 0; i < 10000; i++) {
    //   warnings[i] = {
    //     id: i + "",
    //     position: new Vector3(Math.random() * 100 + 150, Math.random() * 100 + 550, Math.random() * 100 -50),
    //     description: "",
    //     meshId: null,
    //     importance: Math.floor(Math.random() * 3.99),
    //   };
    // }
    // this.setWarnings(warnings); 

    // setInterval(() => {
    //   const w = this.getWarningAtCanvasPoint(new Vector2(0, 0));
    //   if (w) {       
    //     this._hoveredWarning = w;
    //     this.updateSprites();
    //   }
    // }, 20);
    // TEMP END
  }

  addWarning(warning: WarningInfo) {
    if (!warning) {
      return;
    }
    this._warnings.set(warning.id, warning);
    this.updateSprites();
  }

  removeWarning(warningId: string) {
    this._warnings.delete(warningId);
    this.updateSprites();
  }

  setWarnings(warnings: WarningInfo[]) {
    if (!warnings) {
      return;
    }
    warnings.forEach(x => {      
      this._warnings.set(x.id, x);
    });
    this.updateSprites();
  }

  resetWarnings() {
    this._warnings.clear();
    this.updateSprites();
  }

  getWarningAtCanvasPoint(canvasPositionZeroCenter: Vector2): WarningInfo {
    if (this._warnings.size) {
      const maxDistance = this._spriteSize / 2;
      
      // for (const warning of [...this._warnings.values()].reverse()) {      
      for (const warning of this._warnings.values()) {      
        this._tempVec3.copy(warning.position).applyMatrix4(this._hudProjectionMatrix);
        if (this._tempVec3.z > 1) {
          continue;
        }
        this._tempVec2.set(this._tempVec3.x, this._tempVec3.y);
        if (this._tempVec2.distanceTo(canvasPositionZeroCenter) < maxDistance){
          return warning;
        }
      }
    }
    return null;
  }

  private initSprites() {
    this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution,
      CanvasTextureBuilder.buildWarningMarkersTexture(), 
      this._spriteSize, this._toolZIndex, this._cameraZIndex, true, 1000), "s_warn");
  }  

  private updateSprites() {
    const instanceData: HudInstancedMarkerData[] = [];
    this._warnings.forEach(v => {
      const uv = new Vector4();
      switch (v.importance) {
        case 0: 
          uv.set(0, 0.5, 0.5, 1);
          break;
        case 1: 
          uv.set(0.5, 0.5, 1, 1);
          break;
        case 2: 
          uv.set(0, 0, 0.5, 0.5);
          break;
        case 3: 
          uv.set(0.5, 0, 1, 0.5);
          break;
      }
      instanceData.push({
        position: v.position,
        // scale: this._selectedWarnings.has(v) ? 1.5 : 1,
        scale: this._hoveredWarning === v ? 1.5 : 1,
        uv
      });
    });
    this.getHudElement("s_warn").set(instanceData);
  }
}
// #endregion

export class HudScene {
  private readonly _cameraZ = 10;

  private _scene = new Scene();
  private _camera: OrthographicCamera;  

  private _hudResolution = new Vector2();
  private _hudScale = new Matrix4();
  private _hudProjectionMatrix  = new Matrix4();

  private _pointSnap: HudPointSnap;
  get pointSnap(): HudPointSnap {
    return this._pointSnap;
  }

  private _distanceMeasurer: HudDistanceMeasurer;
  get distanceMeasurer(): HudDistanceMeasurer {
    return this._distanceMeasurer;
  }

  private _warnings: HudWarnings;
  get warnings(): HudWarnings {
    return this._warnings;
  }

  constructor() { 
    this._pointSnap = new HudPointSnap(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 9, this._cameraZ);
    this._distanceMeasurer = new HudDistanceMeasurer(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 8, this._cameraZ);
    this._warnings = new HudWarnings(this._scene,
      this._hudResolution, this._hudProjectionMatrix, 1, this._cameraZ);
  }

  destroy() {
    this._pointSnap.destroy();
    this._pointSnap = null;

    this._distanceMeasurer.destroy();
    this._distanceMeasurer = null;

    this._warnings.destroy();
    this._warnings = null;

    this._scene = null;
  }

  render(mainCamera: Camera, renderer: WebGLRenderer) {
    const ctx = renderer.getContext();

    this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);  
    this.updateHudProjectionMatrix(mainCamera);

    this._distanceMeasurer.update();
    
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this._scene, this._camera);

    // restore renderer settings
    renderer.autoClear = true;
  }

  private updateResolution(rendererBufferWidth: number, rendererBufferHeight: number) {
    if (rendererBufferWidth === this._hudResolution.x
      && rendererBufferHeight === this._hudResolution.y) {
      return;
    }

    this._hudResolution.set(rendererBufferWidth, rendererBufferHeight);
    this.updateCameraResolution();
  }

  private updateCameraResolution() {
    if (!this._camera) {
      this._camera = new OrthographicCamera(this._hudResolution.x / -2, this._hudResolution.x / 2,
        this._hudResolution.y / 2, this._hudResolution.y / -2, 1, 10);
      this._camera.position.setZ(this._cameraZ);
    } else {
      this._camera.left = this._hudResolution.x / -2;
      this._camera.right = this._hudResolution.x / 2;
      this._camera.top = this._hudResolution.y / 2;
      this._camera.bottom = this._hudResolution.y / -2;
      this._camera.updateProjectionMatrix();
    }
  }

  private updateHudProjectionMatrix(camera: Camera) { 
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
}
