import { Color } from "three";

import { ColoringInfo, MeshBgSm } from "../common-types";

import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

import { ModelLoaderService } from "./model-loader-service";
import { SelectionService } from "./selection-service";
import { RenderService } from "./render-service";

export class ColoringService { 
  private readonly _loaderService: ModelLoaderService;
  private readonly _selectionService: SelectionService;

  private _queuedColoring: ColoringInfo[] = null;
  private _coloredMeshes: MeshBgSm[] = [];

  constructor(loaderService: ModelLoaderService, selectionService: SelectionService) {
    if (!loaderService) {
      throw new Error("LoaderService is not defined");
    }
    if (!selectionService) {
      throw new Error("SelectionService is not defined");
    }

    this._loaderService = loaderService;
    this._selectionService = selectionService;
    
    this._loaderService.addModelCallback("model-unloaded", this.onLoaderModelUnloaded);
  }

  destroy() {
    this._loaderService.removeCallback("model-unloaded", this.onLoaderModelUnloaded);
  }

  color(renderService: RenderService, coloringInfos: ColoringInfo[]) {
    if (this._loaderService.loadingInProgress) {
      this._queuedColoring = coloringInfos;
      return;
    }

    this.resetSelectionAndColorMeshes(renderService, coloringInfos);
  }
  
  runQueuedColoring(renderService: RenderService) {
    if (this._queuedColoring) {
      this.resetSelectionAndColorMeshes(renderService, this._queuedColoring);
    }
  }
  
  /**
   * remove all meshes with the specified model GUID from the coloring arrays
   * @param modelGuid GUID of model, which meshes must be removed from the coloring arrays
   */
  removeFromColoringArrays(modelGuid: string) {
    this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
  }

  private onLoaderModelUnloaded = (modelGuid: string) => {    
    this.removeFromColoringArrays(modelGuid);
  };

  private resetSelectionAndColorMeshes(renderService: RenderService, coloringInfos: ColoringInfo[]) {    
    this._selectionService.reset(renderService);
    this.colorMeshes(renderService, coloringInfos);
  }

  private colorMeshes(renderService: RenderService, coloringInfos: ColoringInfo[]) {
    this.removeColoring(renderService);

    if (coloringInfos?.length) {
      for (const info of coloringInfos) {
        const color = new Color(info.color);
        const customColor = new ColorRgbRmo(color.r, color.g, color.b, 1, 0, info.opacity);
        info.ids.forEach(x => {
          const meshes = this._loaderService.getLoadedMeshesById(x);
          if (meshes?.length) {
            meshes.forEach(mesh => {
              mesh.userData.colored = true;
              ColorRgbRmo.setCustomToMesh(mesh, customColor);
              renderService.enqueueMeshForColorUpdate(mesh);
              this._coloredMeshes.push(mesh);
            });
          }
        });
      }
    }

    renderService.render();
  }

  private removeColoring(renderService: RenderService) {
    for (const mesh of this._coloredMeshes) {
      mesh.userData.colored = undefined;
      ColorRgbRmo.deleteFromMesh(mesh, true);
      renderService.enqueueMeshForColorUpdate(mesh);
    }
    this._coloredMeshes.length = 0;
  }
}
