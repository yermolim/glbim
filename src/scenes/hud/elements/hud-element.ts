import { Object3D } from "three";

export interface HudElement {
  object3d: Object3D;
  update: () => void;
  destroy: () => void;
  set: (data: any[]) => void;
  reset: () => void;
}
