import { MeshBgSm } from "../common-types";

import { ModelLoaderService } from "./model-loader-service";
import { PickingService } from "./picking-service";
import { RenderService } from "./render-service";

export class HighlightService {
  private readonly _loaderService: ModelLoaderService;
  private readonly _pickingService: PickingService;
  
  private readonly _highlightedMeshes = new Set<MeshBgSm>();

  constructor(loaderService: ModelLoaderService, pickingService: PickingService) {
    if (!loaderService) {
      throw new Error("LoaderService is not defined");
    }
    if (!pickingService) {
      throw new Error("PickingService is not defined");
    }

    this._loaderService = loaderService;
    this._pickingService = pickingService;
  }

  destroy() {

  }

  highlightInArea(renderService: RenderService, 
    clientMinX: number, clientMinY: number, 
    clientMaxX: number, clientMaxY: number) {

    const ids = this._pickingService.getMeshIdsInArea(renderService,
      clientMinX, clientMinY, clientMaxX, clientMaxY);
    
    const { found } = this._loaderService.findMeshesByIds(new Set<string>(ids));
    this.highlightMeshes(renderService, found);
  }
  
  highlightAtPoint(renderService: RenderService, clientX: number, clientY: number) { 
    const mesh = this._pickingService.getMeshAt(renderService, clientX, clientY);  
    if (mesh) {
      this.highlightMeshes(renderService, [mesh]);
    } else {      
      this.highlightMeshes(renderService, []);
    }
  }

  private highlightMeshes(renderService: RenderService, meshes: MeshBgSm[]) {
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
