import { Vector3, Matrix4, Object3D, Sprite, CanvasTexture } from "three";
import { MaterialBuilder } from "../../../helpers/material-builder";
import { HudElement } from "./hud-element";

export class HudUniqueMarker implements HudElement {
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
