import { BehaviorSubject, Observable } from "rxjs";
import { Color } from "three";

import { ColoringInfo, Mesh_BG } from "../common-types";

import { ColorRgbRmo } from "../helpers/color-rgb-rmo";

import { ModelLoaderService } from "./model-loader-service";
import { SelectionService } from "./selection-service";
import { RenderService } from "./render-service";

export class ColoringService { 
  meshesHiddenChange$: Observable<Set<string>>; 
  private _hiddenIds = new BehaviorSubject<Set<string>>(new Set()); 
   
  private readonly _loaderService: ModelLoaderService;
  private readonly _selectionService: SelectionService;

  private readonly _hiddenColoring: ColoringInfo = {
    color: 0,
    opacity: 0,
    ids: []
  };
  private _queuedColorings: ColoringInfo[] = null;
  private _activeColorings: ColoringInfo[] = null;

  private _coloredMeshes: Mesh_BG[] = [];  

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

    this.meshesHiddenChange$ = this._hiddenIds.asObservable();
  }

  destroy() {
    this._loaderService.removeCallback("model-unloaded", this.onLoaderModelUnloaded);
    this._hiddenIds.complete();
  }

  color(renderService: RenderService, coloringInfos: ColoringInfo[]) {
    if (this._loaderService.loadingInProgress) {
      this._queuedColorings = coloringInfos;
      return;
    }
    this.resetSelectionAndApplyColoring(renderService, coloringInfos);
  }
  
  runQueuedColoring(renderService: RenderService) {
    if (this._queuedColorings) {
      this.resetSelectionAndApplyColoring(renderService, this._queuedColorings);
    }
  }

  hideSelected(renderService: RenderService) {
    const selectedIds = this._selectionService.selectedIds;
    const idSet = new Set<string>([...this._hiddenColoring.ids, ...selectedIds]);
    this.setHiddenIds(idSet);
    this.resetSelectionAndApplyColoring(renderService, this._activeColorings);
  }

  unhideAll(renderService: RenderService) {
    this.setHiddenIds(new Set<string>());
    this.resetSelectionAndApplyColoring(renderService, this._activeColorings);
  }
  
  /**
   * remove all meshes with the specified model GUID from the coloring arrays
   * @param modelGuid GUID of model, which meshes must be removed from the coloring arrays
   */
  private removeModelMeshesFromColoringArrays(modelGuid: string) {
    this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
  }

  private onLoaderModelUnloaded = (modelGuid: string) => {    
    this.removeModelMeshesFromColoringArrays(modelGuid);
  };

  private resetSelectionAndApplyColoring(renderService: RenderService, coloringInfos: ColoringInfo[]) { 
    if (!renderService) {
      throw new Error("Render service is not defined");
    }

    this._selectionService.select(renderService, []);
    this.clearMeshesColoring(renderService);
    this.colorMeshes(renderService, coloringInfos);
  }

  private colorMeshes(renderService: RenderService, coloringInfos: ColoringInfo[]) {
    const coloredMeshes = new Set<Mesh_BG>();
    coloringInfos ||= [];

    let i: number;
    let mesh: Mesh_BG;
    for (const info of [...coloringInfos, this._hiddenColoring]) {
      const threeColor = new Color(info.color);
      const rgbrmoColor = new ColorRgbRmo(threeColor.r, threeColor.g, threeColor.b, 1, 0, info.opacity);
      for (const id of info.ids) {
        const meshes = this._loaderService.getLoadedMeshesById(id);
        if (!meshes?.length) {
          continue;
        }
        for (i = 0; i < meshes.length; i++) {
          mesh = meshes[i];
          mesh.userData.colored = true;
          ColorRgbRmo.setPaintColorToMesh(mesh, rgbrmoColor);
          renderService.enqueueMeshForColorUpdate(mesh);
          coloredMeshes.add(mesh);
        }
      }
    }
    this._activeColorings = coloringInfos;

    this._coloredMeshes = [...coloredMeshes];
    renderService.render();
  }

  private clearMeshesColoring(renderService: RenderService) {
    let mesh: Mesh_BG;
    for (let i = 0; i < this._coloredMeshes.length; i++) {
      mesh = this._coloredMeshes[i];
      mesh.userData.colored = undefined;
      ColorRgbRmo.deleteColorFromMesh(mesh, true);
      renderService.enqueueMeshForColorUpdate(mesh);
    }
    this._coloredMeshes = [];
    this._activeColorings = [];
  }

  private setHiddenIds(idSet: Set<string>) {
    this._hiddenColoring.ids = [...idSet];
    this._hiddenIds.next(idSet);
  }
}
