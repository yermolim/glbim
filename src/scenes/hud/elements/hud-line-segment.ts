import { Vector2, Vector3, Matrix4, Object3D } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { MaterialBuilder } from "../../../helpers/material-builder";
import { HudElement } from "./hud-element";

export class HudLineSegment implements HudElement {
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
