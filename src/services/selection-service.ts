import { BehaviorSubject, Observable, Subject } from "rxjs";

import { MeshBgSm } from "../common-types";

import { ModelLoaderService } from "./model-loader-service";
import { PickingService } from "./picking-service";
import { RenderService } from "./render-service";

export class SelectionService {
  selectionChange$: Observable<Set<string>>;
  manualSelectionChange$: Observable<Set<string>>;
  private _selectionChange = new BehaviorSubject<Set<string>>(new Set());
  private _manualSelectionChange = new Subject<Set<string>>();
  
  private readonly _loaderService: ModelLoaderService;
  private readonly _pickingService: PickingService;
  
  private _queuedSelection: {ids: string[]; isolate: boolean} = null;
  private _selectedMeshes: MeshBgSm[] = [];
  private _isolatedMeshes: MeshBgSm[] = [];

  private _focusOnProgrammaticSelection = true;
  set focusOnProgrammaticSelection(value: boolean) {
    this._focusOnProgrammaticSelection = value;
  }

  get selectedIds(): Set<string> {    
    return this._selectionChange.getValue();
  }

  constructor(loaderService: ModelLoaderService, pickingService: PickingService) {
    if (!loaderService) {
      throw new Error("LoaderService is not defined");
    }
    if (!pickingService) {
      throw new Error("PickingService is not defined");
    }

    this._loaderService = loaderService;
    this._pickingService = pickingService;

    this._loaderService.addModelCallback("model-unloaded", this.onLoaderModelUnloaded);
    
    this.selectionChange$ = this._selectionChange.asObservable();
    this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
  }

  destroy() {
    this._selectionChange.complete();
    this._manualSelectionChange.complete();
    
    this._loaderService.removeCallback("model-unloaded", this.onLoaderModelUnloaded);
  }

  select(renderService: RenderService, ids: string[]) {
    ids ||= [];

    if (this._loaderService.loadingInProgress) {
      this._queuedSelection = {ids, isolate: false};
      return;
    }

    this.findAndSelectMeshes(renderService, ids, false);
  };

  isolate(renderService: RenderService, ids: string[]) {
    if (!ids?.length) {
      return;
    }

    if (this._loaderService.loadingInProgress) {
      this._queuedSelection = {ids, isolate: true};
      return;
    }

    this.findAndSelectMeshes(renderService, ids, true);
  };

  isolateSelected(renderService: RenderService) {
    if (!this._selectedMeshes.length) {
      return;
    }

    this._loaderService.loadedMeshesArray.forEach(x => {
      if (!x.userData.selected) {
        x.userData.isolated = true;
        renderService.enqueueMeshForColorUpdate(x);
        this._isolatedMeshes.push(x);
      }
    }); 
    renderService.render(!this._focusOnProgrammaticSelection 
      ? null 
      : this._selectedMeshes);
  }

  selectMeshAtPoint(renderService: RenderService, keepPreviousSelection: boolean, 
    clientX: number, clientY: number) {
    const mesh = this._pickingService.getMeshAt(renderService, clientX, clientY);
    if (!mesh) {
      this.applySelection(renderService, [], true, false);
      return;
    }

    let meshes: MeshBgSm[];
    if (keepPreviousSelection) {
      if (mesh.userData.selected) {
        meshes = this._selectedMeshes.filter(x => x !== mesh);
      } else {        
        meshes = [mesh, ...this._selectedMeshes];
      }
    } else {
      meshes = [mesh];
    }
    
    this.applySelection(renderService, meshes, true, false);
  }
  
  selectMeshesInArea(renderService: RenderService, previousSelection: "remove" | "keep" | "subtract",
    clientMinX: number, clientMinY: number, clientMaxX: number, clientMaxY: number) {

    const found = this._pickingService.getMeshesInArea(renderService,
      clientMinX, clientMinY, clientMaxX, clientMaxY) || [];
    const idSet = new Set<string>(found.map(x => x.userData.id));
    
    let meshes: MeshBgSm[];
    if (previousSelection === "keep") {
      meshes = [...found, ...this._selectedMeshes];
    } else if (previousSelection === "subtract") {
      meshes = [...this._selectedMeshes.filter(x => !idSet.has(x.userData.id))];      
    } else {
      meshes = found;
    }

    if (!meshes?.length) {
      this.clearSelection(renderService);
    } else {
      this.applySelection(renderService, meshes, true, false);
    }
  }

  runQueuedSelection(renderService: RenderService) {    
    if (this._queuedSelection) {
      const { ids, isolate } = this._queuedSelection;
      this.findAndSelectMeshes(renderService, ids, isolate);
    }
  }

  //#region private
  private onLoaderModelUnloaded = (modelGuid: string) => {    
    this.removeModelMeshesFromSelectionArrays(modelGuid);
  };

  private findAndSelectMeshes(renderService: RenderService, ids: string[], isolate: boolean) {    

    const meshes = ids?.length
      ? this._loaderService.findMeshesByIds(new Set<string>(ids)).found
      : [];
    this.applySelection(renderService, meshes, false, isolate);
  }

  private clearSelection(renderService: RenderService) {
    for (const mesh of this._selectedMeshes) {
      mesh.userData.selected = undefined;
      renderService.enqueueMeshForColorUpdate(mesh);
    }
    this._selectedMeshes.length = 0;
  }

  private clearIsolation(renderService: RenderService) {
    for (const mesh of this._isolatedMeshes) {
      mesh.userData.isolated = undefined;
      renderService.enqueueMeshForColorUpdate(mesh);
    }
    this._isolatedMeshes.length = 0;
  }

  private applySelection(renderService: RenderService, meshes: MeshBgSm[], 
    manual: boolean, isolateSelected: boolean) { 
      
    this.clearSelection(renderService);
    this.clearIsolation(renderService);

    if (!meshes?.length) {
      this.emitSelectionChanged(renderService, manual, true);
      return null;
    }
    
    meshes.forEach(x => {
      x.userData.selected = true;
      renderService.enqueueMeshForColorUpdate(x);
    });


    this._selectedMeshes = meshes;
    if (isolateSelected) {
      this.emitSelectionChanged(renderService, manual, false);
      this.isolateSelected(renderService);
    } else {
      this.emitSelectionChanged(renderService, manual, true);
    }
  }

  /**
   * remove all meshes with the specified model GUID from the selection arrays
   * @param modelGuid GUID of model, which meshes must be removed from the selection arrays
   */
  private removeModelMeshesFromSelectionArrays(modelGuid: string) {    
    this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
  }

  private emitSelectionChanged(renderService: RenderService, manual: boolean, render: boolean) {
    if (render) {
      renderService.render(manual || !this._focusOnProgrammaticSelection 
        ? null 
        : this._selectedMeshes);
    }

    const ids = new Set<string>();
    this._selectedMeshes.forEach(x => ids.add(x.userData.id));

    this._selectionChange.next(ids);
    if (manual) {
      this._manualSelectionChange.next(ids);
    }
  }
  //#endregion
}
