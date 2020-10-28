/* eslint-disable @typescript-eslint/no-use-before-define */
import { Scene, Vector2, Vector3, Matrix4, Object3D, Mesh, Sprite, 
  Material, SpriteMaterial, CanvasTexture,
  Camera, OrthographicCamera, WebGLRenderer, 
  InstancedBufferGeometry, InstancedBufferAttribute } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";

import { Vec4, Distance } from "../common-types";
import { MaterialBuilder } from "../helpers/material-builder";
import { CanvasTextureBuilder } from "../helpers/canvas-texture-builder";

interface IHudElement {
  object3d: Object3D;
  destroy: () => void;
  set: (positions: Vector3[]) => void;
  reset: () => void;
}

class HudUniqueMarker implements IHudElement {
  private _sprite: Sprite;

  get object3d(): Object3D {
    return this._sprite;
  }

  constructor(sprite: Sprite) {
    this._sprite = sprite;
  }

  destroy() {
    this._sprite.geometry.dispose();
    this._sprite = null;
  }

  set(positions: Vector3[]) {
    if (positions?.length !== 1) {
      this.reset();
      return;
    }

    if (!this._sprite.visible) {
      this._sprite.visible = true;
    }
    this._sprite.position.copy(positions[0]);
  } 

  reset() {
    if (this._sprite.visible) {
      this._sprite.visible = false;
      this._sprite.position.set(0, 0, 0);
    }
  }  
}

class HudInstancedMarker implements IHudElement {
  private _sprite: Sprite;

  get object3d(): Object3D {
    return this._sprite;
  }

  constructor(sprite: Sprite) {
    this._sprite = sprite;
  }

  destroy() {
    this._sprite.geometry.dispose();
    this._sprite = null;
  }

  set(positions: Vector3[]) {
    const instancePosition = this._sprite.geometry.getAttribute("positionOffset");
    const maxPositionCount = instancePosition.count;
    if (!positions?.length) {
      this.reset();
      return;
    } else if (positions.length > maxPositionCount) {
      positions = positions.slice(0, maxPositionCount);
    }    
    this._sprite.geometry["instanceCount"] = positions.length;
    positions.forEach((p, i) => {
      instancePosition.setXYZ(i, p.x, p.y, p.z);
    });
    
    // console.log(this._sprite);
  } 

  reset() {
    this._sprite.geometry["instanceCount"] = 0;
  }  
}

class HudLineSegment implements IHudElement {
  private _segment: Line2;

  get object3d(): Object3D {
    return this._segment;
  }

  constructor(segment: Line2) {
    this._segment = segment;
  }

  destroy() {
    this._segment.geometry.dispose();
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

class HudTool {
  protected _hudElements = new Map<string, IHudElement>();

  private _hudScene: Scene;
  
  private _hudResolution = new Vector2();
  private _hudProjectionMatrix  = new Matrix4();
  
  private _spriteMaterials: SpriteMaterial[] = [];
  private _lineMaterials: LineMaterial[] = [];

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4) { 
    this._hudScene = hudScene;

    this._hudResolution = hudResolution;
    this._hudProjectionMatrix = hudProjectionMatrix;
  }

  destroy() {
    this.destroyHudElements();
    this.destroyLineMaterials();
    this.destroySpriteMaterials();
  }

  update() {
    this.updateLinesResolution();
  } 
  
  protected buildUniqueRoundMarker(texture: CanvasTexture, sizePx: number, zIndex: number): HudUniqueMarker {
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
          hudPosition.z = ${(zIndex - HudScene.cameraZ).toFixed()}.0;

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
    this._spriteMaterials.push(material); 

    const sprite = new Sprite(material); 
    sprite.visible = false;  
    sprite.scale.set(sizePx, sizePx, 1); 
    sprite.position.set(0, 0, 0); 
    sprite.frustumCulled = false;
    this._hudScene.add(sprite);

    return new HudUniqueMarker(sprite);
  }

  protected buildInstancedMarker(texture: CanvasTexture, sizePx: number, zIndex: number, keepVisible: boolean,
    maxInstances = 1000): HudInstancedMarker {
    const material = MaterialBuilder.buildSpriteMaterial(texture);
    material.onBeforeCompile = shader => {    
      shader.uniforms = Object.assign({}, shader.uniforms, { 
        hudMatrix: { value: this._hudProjectionMatrix },
        resolution: { value: this._hudResolution },
      });
      shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform vec2 resolution;
        uniform mat4 hudMatrix;
        attribute vec3 positionOffset;

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
        "vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );", "");

      shader.vertexShader = shader.vertexShader.replace(
        "#ifndef USE_SIZEATTENUATION",
        ` 
          vec3 hudPosition = applyMatrix4(positionOffset, hudMatrix);
          if (hudPosition.z > 1.0) {
            hudPosition.x = -hudPosition.x;
            hudPosition.y = -hudPosition.y;
          }
          hudPosition.z = ${(zIndex - HudScene.cameraZ).toFixed()}.0;
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
          ) * vec4( 0.0, 0.0, 0.0, 1.0 );

          #ifndef USE_SIZEATTENUATION
        `
      );

      // console.log(shader.fragmentShader);
      // shader.fragmentShader += "%";
    };
    this._spriteMaterials.push(material); 

    const sprite = new Sprite(material); 
    sprite.geometry["isInstancedBufferGeometry"] = true;
    sprite.geometry["instanceCount"] = 0;
    sprite.geometry.setAttribute("positionOffset", new InstancedBufferAttribute(new Float32Array(3 * maxInstances), 3));
    sprite.scale.set(sizePx, sizePx, 1);  
    sprite.position.set(0, 0, 0); 
    sprite.frustumCulled = false;
    this._hudScene.add(sprite);

    return new HudInstancedMarker(sprite);
  }

  protected buildLineSegment(color: number, width: number, zIndex: number, dashed = false): HudLineSegment {
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
    this._hudScene.add(segment);

    return new HudLineSegment(segment);
  }

  private updateLinesResolution() {    
    this._lineMaterials.forEach(x => x.resolution.copy(this._hudResolution));
  }

  private destroyHudElements() {    
    this._hudElements.forEach(v => {
      if (v?.object3d) {
        this._hudScene.remove(v.object3d);
        v.destroy();
      }
    });
    this._hudElements = null;
  }

  private destroySpriteMaterials() {    
    this._spriteMaterials?.forEach(x => { x.map.dispose(); x.dispose(); });
    this._spriteMaterials = null;
  }

  private destroyLineMaterials() {    
    this._lineMaterials?.forEach(x => x.dispose());
    this._lineMaterials = null;
  }
}

class HudDistanceMeasurer extends HudTool {
  private _measurePoints: {start: Vector3; end: Vector3} = {start: null, end: null};

  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4) { 
    super(hudScene, hudResolution, hudProjectionMatrix);

    this.initLines();
    this.initSprites();
  }
  
  setSnapMarker(point: Vector3): Vec4 {
    if (point) {
      this._hudElements.get("s_dm_snap").set([point]);
      return new Vec4(point.x, point.y, point.z, 0, true);
    } else {
      this._hudElements.get("s_dm_snap").reset();
      return null;
    }
  }

  setEndMarker(point: Vector3): Distance {
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
      this._hudElements.get("s_dm_start").set([this._measurePoints.start]);   
    } else {
      this._hudElements.get("s_dm_start").reset(); 
    }

    if (this._measurePoints.end) {
      this._hudElements.get("s_dm_end").set([this._measurePoints.end]);  
      this.setLines(true);
    } else {      
      this._hudElements.get("s_dm_end").reset(); 
      this.resetLines();
    }
    
    if (this._measurePoints.start && this._measurePoints.end) {
      return new Distance(this._measurePoints.start, this._measurePoints.end, true);
    } else {
      return null;
    }
  }
  
  reset() {
    this._measurePoints.start = null;
    this._measurePoints.end = null;

    this.resetarkers();
    this.resetLines();
  }  

  private initSprites() {     
    this._hudElements.set("s_dm_start", 
      this.buildUniqueRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0x391285), 8, 3));
    this._hudElements.set("s_dm_end", 
      this.buildUniqueRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0x00FFFF), 8, 3));
    this._hudElements.set("s_dm_snap", 
      this.buildUniqueRoundMarker(CanvasTextureBuilder.buildCircleTexture(64, 0xFF00FF), 8, 3));  
  }  

  private initLines() {     
    this._hudElements.set("l_dm_z", this.buildLineSegment(0x2c8FFF, 2, 1, true));
    this._hudElements.set("l_dm_y", this.buildLineSegment(0x8adb00, 2, 1, true));
    this._hudElements.set("l_dm_x", this.buildLineSegment(0xFF3653, 2, 1, true));
    this._hudElements.set("l_dm_w", this.buildLineSegment(0x0000FF, 4, 2));
  }
  
  private resetarkers() {   
    this._hudElements.get("s_dm_snap").reset(); 
    this._hudElements.get("s_dm_start").reset(); 
    this._hudElements.get("s_dm_end").reset(); 
  }

  private setLines(toZUp: boolean) {  
    const wStart = this._measurePoints.start;
    const wEnd = this._measurePoints.end;

    const distance = new Vector3().copy(wEnd).sub(wStart);

    const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
    const yEnd = toZUp
      ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
      : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);

    this._hudElements.get("l_dm_z").set([yEnd, wEnd]);
    this._hudElements.get("l_dm_y").set([xEnd, yEnd]);
    this._hudElements.get("l_dm_x").set([wStart, xEnd]);
    this._hudElements.get("l_dm_w").set([wStart, wEnd]);
  }

  private resetLines() {    
    this._hudElements.get("l_dm_z").reset();
    this._hudElements.get("l_dm_y").reset();
    this._hudElements.get("l_dm_x").reset();
    this._hudElements.get("l_dm_w").reset();
  }
}

class HudWarnings extends HudTool {  
  constructor(hudScene: Scene, hudResolution: Vector2, hudProjectionMatrix: Matrix4) { 
    super(hudScene, hudResolution, hudProjectionMatrix);

    this.initSprites();
  }

  private initSprites() {     
    // this._hudElements.set("s_warn_0", 
    //   this.buildInstancedMarker(CanvasTextureBuilder.buildWarningMarkersTexture(), 16, 1, true, 1000));

    // TEMP
    // const warn0 = this._hudElements.get("s_warn_0");
    // warn0.set([
    //   new Vector3(191.436, 565.367, 8.763),
    //   new Vector3(209.942, 559.872, 9.238),
    //   new Vector3(218.496, 560.040, 5.882),
    // ]);
    // console.log(warn0);    
  }  
}

export class HudScene {
  static readonly cameraZ = 10;

  private _scene = new Scene();
  private _camera: OrthographicCamera;  

  private _hudResolution = new Vector2();
  private _hudScale = new Matrix4();
  private _hudProjectionMatrix  = new Matrix4();

  private _distanceMeasurer: HudDistanceMeasurer;
  get distanceMeasurer(): HudDistanceMeasurer {
    return this._distanceMeasurer;
  }

  private _warnings: HudWarnings;
  get warnings(): HudWarnings {
    return this._warnings;
  }

  constructor() { 
    this._distanceMeasurer = new HudDistanceMeasurer(this._scene,
      this._hudResolution, this._hudProjectionMatrix);
    this._warnings = new HudWarnings(this._scene,
      this._hudResolution, this._hudProjectionMatrix);
  }

  destroy() {
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
      this._camera.position.setZ(HudScene.cameraZ);
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
