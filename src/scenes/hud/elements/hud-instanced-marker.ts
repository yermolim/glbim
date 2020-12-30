import { Vector2, Vector4, Matrix4, Object3D, 
  Sprite, CanvasTexture, InstancedBufferAttribute } from "three";
import { Vec4DoubleCS } from "../../../common-types";
import { MaterialBuilder } from "../../../helpers/material-builder";
import { HudElement } from "./hud-element";

export interface HudInstancedMarkerData {
  position: Vec4DoubleCS; 
  uv: Vector4; 
  scale: number;
}

export class HudInstancedMarker implements HudElement {
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
      if (d.position) {
        instancePosition.setXYZ(i, d.position.x, d.position.y_Yup, d.position.z_Yup);
      } else {        
        instancePosition.setXYZ(i, 0, 0, 0);
      }
      if (d.uv) {
        instanceUv.setXYZW(i, d.uv.x, d.uv.y, d.uv.z, d.uv.w);
      } else {        
        instanceUv.setXYZW(i, 0, 0, 1, 1);
      }
      instanceScale.setX(i, d.scale ?? 1);
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
