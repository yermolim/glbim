import { MeshBgSm } from "../common-types";

import { PickingService } from "./picking-service";
import { RenderService } from "./render-service";

export class HighlightService {
  private readonly _pickingService: PickingService;
  
  private readonly _highlightedMeshes = new Set<MeshBgSm>();

  constructor(pickingService: PickingService) {
    if (!pickingService) {
      throw new Error("PickingService is not defined");
    }
    this._pickingService = pickingService;
  }

  destroy() {

  }
  
  highlightMeshAtPoint(renderService: RenderService, clientX: number, clientY: number) { 
    const mesh = this._pickingService.getMeshAt(renderService, clientX, clientY);  
    if (mesh) {
      this.highlightMeshes(renderService, [mesh]);
    } else {      
      this.highlightMeshes(renderService, []);
    }
  }

  highlightMeshes(renderService: RenderService, meshes: MeshBgSm[]) {
    const meshSet = new Set<MeshBgSm>(meshes || []);    

    const addToHighlightList: MeshBgSm[] = [];
    const removeFromHighlightList: MeshBgSm[] = [];

    this._highlightedMeshes.forEach(mesh => {
      if (!meshSet.has(mesh)) {
        removeFromHighlightList.push(mesh);
      }
    });
    meshSet.forEach(mesh => {
      if (!this._highlightedMeshes.has(mesh)) {
        addToHighlightList.push(mesh);
      }
    });
    
    removeFromHighlightList.forEach(mesh => {
      mesh.userData.highlighted = undefined;
      renderService.enqueueMeshForColorUpdate(mesh);
      this._highlightedMeshes.delete(mesh);
    });

    addToHighlightList.forEach(mesh => {
      mesh.userData.highlighted = true;
      renderService.enqueueMeshForColorUpdate(mesh);
      this._highlightedMeshes.add(mesh);
    });

    renderService.render();
  }
}
