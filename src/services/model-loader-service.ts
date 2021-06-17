import { Observable, Subject, BehaviorSubject, AsyncSubject, firstValueFrom } from "rxjs";

import { Mesh, BufferGeometry, Matrix4, Object3D, Scene } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, LoadingQueueInfo,
  ModelGeometryInfo, ModelFileInfo, Mesh_BG, Vec4DoubleCS} from "../common-types";
import { IFCLoader } from "../helpers/ifc-loader";

export class ModelLoaderService {
  // #region public observables
  loadingStateChange$: Observable<boolean>;
  loadingQueueChange$: Observable<LoadingQueueInfo>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  modelsOpenedChange$: Observable<ModelOpenedInfo[]>;
  // #endregion  
  
  // #region private rx subjects
  private _loadingStateChange = new BehaviorSubject<boolean>(false);
  private _loadingQueueChange = new BehaviorSubject<LoadingQueueInfo>(null);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<ModelLoadingInfo>();
  private _modelsOpenedChange = new BehaviorSubject<ModelOpenedInfo[]>([]);  
  // #endregion

  private _glbLoader: GLTFLoader;  
  private _ifcLoader: IFCLoader;  

  private _loadingInProgress = false;
  private _loadingQueue: (() => Promise<void>)[] = [];

  private _loadedModels = new Set<ModelGeometryInfo>();
  private _loadedModelsByGuid = new Map<string, ModelGeometryInfo>();

  private _loadedMeshes = new Set<Mesh_BG>();
  private _loadedMeshesById = new Map<string, Mesh_BG[]>();

  private _loadedModelsArray: ModelGeometryInfo[] = [];
  private _loadedMeshesArray: Mesh_BG[] = [];

  get loadedModelsArray(): ModelGeometryInfo[] {
    return this._loadedModelsArray;
  }
  get loadedMeshesArray(): Mesh_BG[] {
    return this._loadedMeshesArray;
  }

  get openedModelInfos(): ModelOpenedInfo[] {
    return this._modelsOpenedChange.getValue();
  }
  
  get loadingInProgress(): boolean {
    return this._loadingInProgress;
  }

  private _wcsToUcsMatrix: Matrix4;

  private _onQueueLoaded = new Set<() => Promise<void>>();
  private _onModelLoaded = new Set<(guid: string) => void>();
  private _onModelUnloaded = new Set<(guid: string) => void>();
  private _onMeshLoaded = new Set<(m: Mesh_BG) => void>();
  private _onMeshUnloaded = new Set<(m: Mesh_BG) => void>();
  
  constructor(dracoLibPath: string, ifcLibPath: string,
    basePoint: Vec4DoubleCS = null) {
    
    const wcsToUcsMatrix = new Matrix4();
    if (basePoint) {
      wcsToUcsMatrix
        .makeTranslation(basePoint.x, basePoint.y_Yup, basePoint.z_Yup)
        .invert();
    }
    this._wcsToUcsMatrix = wcsToUcsMatrix;
    
    this.loadingStateChange$ = this._loadingStateChange.asObservable();
    this.loadingQueueChange$ = this._loadingQueueChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelsOpenedChange$ = this._modelsOpenedChange.asObservable();

    const glbLoader = new GLTFLoader();
    if (dracoLibPath) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(dracoLibPath);
      dracoLoader.preload();
      glbLoader.setDRACOLoader(dracoLoader);
    }
    this._glbLoader = glbLoader;

    if (ifcLibPath) {
      this._ifcLoader = new IFCLoader(ifcLibPath);
    }
  }

  destroy() {
    this._loadingStateChange.complete();
    this._modelLoadingStart.complete();
    this._modelLoadingProgress.complete();
    this._modelLoadingEnd.complete();
    this._modelsOpenedChange.complete();
    
    this._loadedMeshes?.forEach(x => {
      x.geometry.dispose();
      x.material.dispose();
    });
    
    this._glbLoader.dracoLoader?.dispose();  
    this._glbLoader = null;
  }

  //#region callbacks
  addQueueCallback(type: "queue-loaded", cb: () => Promise<void>) {
    switch (type) {
      case "queue-loaded":
        this._onQueueLoaded.add(cb);
        return;
    }
  }

  addModelCallback(type: "model-loaded" | "model-unloaded", 
    cb: (guid: string) => void) {    
    switch (type) {
      case "model-loaded":
        this._onModelLoaded.add(cb);
        return;
      case "model-unloaded":
        this._onModelUnloaded.add(cb);
        return;
    }
  }
  
  addMeshCallback(type: "mesh-loaded" | "mesh-unloaded", 
    cb: (m: Mesh_BG) => void) {    
    switch (type) {
      case "mesh-loaded":
        this._onMeshLoaded.add(cb);
        return;
      case "mesh-unloaded":
        this._onMeshUnloaded.add(cb);
        return;
    }
  }

  removeCallback(type: "queue-loaded" 
  | "model-loaded" | "model-unloaded" 
  | "mesh-loaded" | "mesh-unloaded",
  cb: any) {
    switch (type) {
      case "queue-loaded":
        this._onQueueLoaded.delete(cb);
        return;
      case "model-loaded":
        this._onModelLoaded.delete(cb);
        return;
      case "model-unloaded":
        this._onModelUnloaded.delete(cb);
        return;
      case "mesh-loaded":
        this._onMeshLoaded.delete(cb);
        return;
      case "mesh-unloaded":
        this._onMeshUnloaded.delete(cb);
        return;
    }
  }
  //#endregion
  
  async openModelsAsync(modelInfos: ModelFileInfo[]): Promise<ModelLoadedInfo[]> {
    if (!modelInfos?.length) {
      return [];
    }

    const promises: Promise<ModelLoadedInfo>[] = [];
    modelInfos.forEach(x => {
      const resultSubject = new AsyncSubject<ModelLoadedInfo>();
      this._loadingQueue.push(async () => {        
        const { url, guid, name } = x;
        const result = !this._loadedModelsByGuid.has(guid)
          ? await this.loadModel(url, guid, name)
          : { url, guid };
        resultSubject.next(result);
        resultSubject.complete();
      });
      promises.push(firstValueFrom(resultSubject));
    });
    this.processLoadingQueueAsync();

    const overallResult = await Promise.all(promises);
    return overallResult;
  };

  async closeModelsAsync(modelGuids: string[]): Promise<void> {
    if (!modelGuids?.length) {
      return;
    }

    const promises: Promise<boolean>[] = [];
    modelGuids.forEach(x => {      
      const resultSubject = new AsyncSubject<boolean>();
      this._loadingQueue.push(async () => {
        this.removeModelFromLoaded(x);
        resultSubject.next(true);
        resultSubject.complete();
      });
      promises.push(firstValueFrom(resultSubject));
    });    
    this.processLoadingQueueAsync();
    
    await Promise.all(promises);
  };

  async closeAllModelsAsync(): Promise<void> {
    const loadedGuids = this.openedModelInfos.map(x => x.guid);
    return this.closeModelsAsync(loadedGuids);
  }

  getLoadedMeshesById(id: string): Mesh_BG[] {
    return this._loadedMeshesById.get(id);
  }
  
  findMeshesByIds(ids: Set<string>): {found: Mesh_BG[]; notFound: Set<string>} {
    const found: Mesh_BG[] = [];
    const notFound = new Set<string>();

    ids.forEach(x => {
      const meshes = this.getLoadedMeshesById(x);
      if (meshes?.length) {
        found.push(...meshes);
      } else {
        notFound.add(x);
      }
    });

    return {found, notFound};
  }

  private async processLoadingQueueAsync(): Promise<void> {
    if (this._loadingInProgress
        || !this._loadingQueue.length) {
      return;
    }

    this._loadingInProgress = true;  
    this._loadingStateChange.next(true);

    let actionsDone = 0;
    while (this._loadingQueue.length > 0) {
      this._loadingQueueChange.next({actionsDone, actionsLeft: this._loadingQueue.length});

      const action = this._loadingQueue.shift();
      await action();
      actionsDone += 1;
    } 
    this._loadingQueueChange.next(null);
    
    this.updateModelsDataArrays();
    
    if (this._onQueueLoaded.size) {
      for (const callback of this._onQueueLoaded) {
        await callback();
      }
    }

    this.emitOpenedModelsChanged();
    this._loadingStateChange.next(false);
    this._loadingInProgress = false;

    // run loop once more to check queue update while awaiting this.onQueueLoaded()
    await this.processLoadingQueueAsync(); 
  }

  private async loadModel(url: string, guid: string, name: string): Promise<ModelLoadedInfo> {
    this.onModelLoadingStart(url, guid); 
    let error: Error;
    try {
      if (name.endsWith(".glb") || name.endsWith(".gltf")) {
        if (!this._glbLoader) {
          throw new Error("GLB/GLTF loader is not initialized");
        }
        const gltfModel = await this._glbLoader.loadAsync(url,
          (progress) => this.onModelLoadingProgress(progress, url, guid));
        this.addModelToLoaded(gltfModel.scene, guid, name);
      } else if (name.endsWith("ifc")) {
        if (!this._ifcLoader) {
          throw new Error("IFC loader is not initialized");
        }
        const ifcModel: Object3D = await this._ifcLoader.loadAsync(url,
          (progress) => this.onModelLoadingProgress(progress, url, guid));
        this.addModelToLoaded(ifcModel, guid, name);
      } else {
        throw new Error(`Unsupported file format: ${name}`);
      }
    } catch (loadingError) {
      error = loadingError;
    }
    const result = { url, guid, error };
    this.onModelLoadingEnd(result);
    return result;
  }  

  private onModelLoadingStart(url: string, guid: string) {
    this._modelLoadingStart.next({url, guid});
  }  

  private onModelLoadingProgress(progress: ProgressEvent, url: string, guid: string) {   
    const currentProgress = Math.round(progress.loaded / progress.total * 100);
    this._modelLoadingProgress.next({ url, guid, progress: currentProgress });
  }
  
  private onModelLoadingEnd(info: ModelLoadedInfo) {
    const { url, guid } = info;
    this._modelLoadingProgress.next({ url, guid, progress: 0});
    this._modelLoadingEnd.next(info);
  }

  private addModelToLoaded(modelRoot: Object3D, modelGuid: string, modelName: string) {
    const name = modelName || modelGuid;

    const tempScene = new Scene();
    tempScene.add(modelRoot);
    if (this._wcsToUcsMatrix) {
      modelRoot.position.applyMatrix4(this._wcsToUcsMatrix);
    }
    modelRoot.matrixWorldNeedsUpdate = true;
    modelRoot.updateMatrixWorld(true); 
    tempScene.remove(modelRoot);

    let vertexCount = 0;
    const modelMeshes: Mesh_BG[] = [];
    const modelHandles = new Set<string>();
    modelRoot.traverse(x => {
      if (x instanceof Mesh
          // only BufferGeometry is supported
          && x.geometry instanceof BufferGeometry) {
        const handle = x.name || x.uuid;
        const id = `${modelGuid}|${handle}`;
        x.userData.id = id;
        x.userData.modelGuid = modelGuid; 

        this._loadedMeshes.add(x);
        if (this._loadedMeshesById.has(id)) {
          this._loadedMeshesById.get(id).push(x);
        } else {
          this._loadedMeshesById.set(id, [x]);
        }        
        modelMeshes.push(x);
        modelHandles.add(handle);

        if (this._onMeshLoaded.size) {
          for (const callback of this._onMeshLoaded) {
            callback(x);
          }
        }

        vertexCount += x.geometry.getAttribute("position").count;
      }
    });
    
    const modelInfo = {name, meshes: modelMeshes, handles: modelHandles, vertexCount};
    this._loadedModels.add(modelInfo);
    this._loadedModelsByGuid.set(modelGuid, modelInfo);
    
    if (this._onModelLoaded.size) {
      for (const callback of this._onModelLoaded) {
        callback(modelGuid);
      }
    }
  }

  private removeModelFromLoaded(modelGuid: string) {
    if (!this._loadedModelsByGuid.has(modelGuid)) {
      return;
    }

    const modelData = this._loadedModelsByGuid.get(modelGuid);
    modelData.meshes.forEach(x => {  
      this._loadedMeshes.delete(x); 
      this._loadedMeshesById.delete(x.userData.id);

      if (this._onMeshUnloaded.size) {
        for (const callback of this._onMeshUnloaded) {
          callback(x);
        }
      }
      
      x.geometry?.dispose();
    });

    this._loadedModels.delete(modelData);
    this._loadedModelsByGuid.delete(modelGuid);

    if (this._onModelUnloaded.size) {
      for (const callback of this._onModelUnloaded) {
        callback(modelGuid);
      }
    }
  }

  private updateModelsDataArrays() {
    this._loadedMeshesArray = [...this._loadedMeshes];
    this._loadedModelsArray = [...this._loadedModels];
  }

  private emitOpenedModelsChanged() {  
    const modelOpenedInfos: ModelOpenedInfo[] = [];
    for (const [ modelGuid, model ] of this._loadedModelsByGuid) {
      modelOpenedInfos.push({
        guid: modelGuid,
        name: model.name, 
        handles: model.handles,
        meshCount: model.meshes.length,
        vertexCount: model.vertexCount,
      });
    } 
    this._modelsOpenedChange.next(modelOpenedInfos);
  }
}
