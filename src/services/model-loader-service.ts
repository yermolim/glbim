import { Observable, Subject, BehaviorSubject, AsyncSubject, firstValueFrom } from "rxjs";

import { Mesh, MeshStandardMaterial, BufferGeometry, Matrix4 } from "three";
// eslint-disable-next-line import/named
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

import { ModelLoadedInfo, ModelLoadingInfo, ModelOpenedInfo, 
  ModelGeometryInfo, ModelFileInfo, MeshBgSm, Vec4DoubleCS} from "../common-types";

export class ModelLoaderService {
  // #region public observables
  loadingStateChange$: Observable<boolean>;
  modelLoadingStart$: Observable<ModelLoadedInfo>;
  modelLoadingEnd$: Observable<ModelLoadedInfo>;
  modelLoadingProgress$: Observable<ModelLoadingInfo>;
  modelsOpenedChange$: Observable<ModelOpenedInfo[]>;
  // #endregion  
  
  // #region private rx subjects
  private _loadingStateChange = new BehaviorSubject<boolean>(false);
  private _modelLoadingStart = new Subject<ModelLoadedInfo>();
  private _modelLoadingEnd = new Subject<ModelLoadedInfo>();
  private _modelLoadingProgress = new Subject<ModelLoadingInfo>();
  private _modelsOpenedChange = new BehaviorSubject<ModelOpenedInfo[]>([]);  
  // #endregion

  private _loader: GLTFLoader;  

  private _loadingInProgress = false;
  private _loadingQueue: (() => Promise<void>)[] = [];

  private _loadedModels = new Set<ModelGeometryInfo>();
  private _loadedModelsByGuid = new Map<string, ModelGeometryInfo>();

  private _loadedMeshes = new Set<MeshBgSm>();
  private _loadedMeshesById = new Map<string, MeshBgSm[]>();

  private _loadedModelsArray: ModelGeometryInfo[] = [];
  private _loadedMeshesArray: MeshBgSm[] = [];

  get loadedModelsArray(): ModelGeometryInfo[] {
    return this._loadedModelsArray;
  }
  get loadedMeshesArray(): MeshBgSm[] {
    return this._loadedMeshesArray;
  }

  get openedModelInfos(): ModelOpenedInfo[] {
    return this._modelsOpenedChange.getValue();
  }
  
  get loadingInProgress(): boolean {
    return this._loadingInProgress;
  }

  private _wcsToUcsMatrix: Matrix4;

  private onQueueLoaded: () => Promise<any>;
  private onModelLoaded: (guid: string) => void;
  private onModelUnloaded: (guid: string) => void;
  private onMeshLoaded: (m: MeshBgSm) => void;
  private onMeshUnloaded: (m: MeshBgSm) => void;
  
  constructor(dracoDecoderPath: string,
    onQueueLoaded: () => Promise<any> = null,
    onModelLoaded: (guid: string) => void = null,
    onModelUnloaded: (guid: string) => void = null,
    onMeshLoaded: (m: MeshBgSm) => void = null,
    onMeshUnloaded: (m: MeshBgSm) => void = null,
    basePoint: Vec4DoubleCS = null) {

    this.onQueueLoaded = onQueueLoaded;
    this.onModelLoaded = onModelLoaded;
    this.onModelUnloaded = onModelUnloaded;
    this.onMeshLoaded = onMeshLoaded;
    this.onMeshUnloaded = onMeshUnloaded;
    
    const wcsToUcsMatrix = new Matrix4();
    if (basePoint) {
      wcsToUcsMatrix
        .makeTranslation(basePoint.x, basePoint.y_Yup, basePoint.z_Yup)
        .invert();
    }
    this._wcsToUcsMatrix = wcsToUcsMatrix;
    
    this.loadingStateChange$ = this._loadingStateChange.asObservable();
    this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
    this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
    this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
    this.modelsOpenedChange$ = this._modelsOpenedChange.asObservable();

    const loader = new GLTFLoader();
    if (dracoDecoderPath) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(dracoDecoderPath);
      dracoLoader.preload();
      loader.setDRACOLoader(dracoLoader);
    }
    this._loader = loader;
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
    
    this._loader.dracoLoader?.dispose();  
    this._loader = null;
  }
  
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

  getLoadedMeshesById(id: string): MeshBgSm[] {
    return this._loadedMeshesById.get(id);
  }
  
  findMeshesByIds(ids: Set<string>): {found: MeshBgSm[]; notFound: Set<string>} {
    const found: MeshBgSm[] = [];
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
    if (!this._loader 
        || this._loadingInProgress 
        || !this._loadingQueue.length) {
      return;
    }

    this._loadingInProgress = true;  
    this._loadingStateChange.next(true);

    while (this._loadingQueue.length > 0) {
      const action = this._loadingQueue.shift();
      await action();
    } 
    
    this.updateModelsDataArrays();
    
    if (this.onQueueLoaded) {
      await this.onQueueLoaded();
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
      const model = await this._loader.loadAsync(url,
        (progress) => this.onModelLoadingProgress(progress, url, guid));
      this.addModelToLoaded(model, guid, name);
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

  private addModelToLoaded(gltf: GLTF, modelGuid: string, modelName: string) {
    const name = modelName || modelGuid;
    const scene = gltf.scene;
    scene.userData.guid = modelGuid;
    scene.name = name;

    const meshes: MeshBgSm[] = [];
    const handles = new Set<string>();
    scene.traverse(x => {
      if (x instanceof Mesh
          && x.geometry instanceof BufferGeometry
          && x.material instanceof MeshStandardMaterial) {

        const id = `${modelGuid}|${x.name}`;
        x.userData.id = id;
        x.userData.modelGuid = modelGuid;

        if (this._wcsToUcsMatrix) {
          x.position.applyMatrix4(this._wcsToUcsMatrix);
        }

        this._loadedMeshes.add(x);
        if (this._loadedMeshesById.has(id)) {
          this._loadedMeshesById.get(id).push(x);
        } else {
          this._loadedMeshesById.set(id, [x]);
        }        
        meshes.push(x);
        handles.add(x.name);

        if (this.onMeshLoaded) {
          this.onMeshLoaded(x);
        }
      }
    });
    
    const modelInfo = {name, meshes, handles};
    this._loadedModels.add(modelInfo);
    this._loadedModelsByGuid.set(modelGuid, modelInfo);
    
    if (this.onModelLoaded) {
      this.onModelLoaded(modelGuid);
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

      if (this.onMeshUnloaded) {
        this.onMeshUnloaded(x);
      }
      
      x.geometry?.dispose();
    });

    this._loadedModels.delete(modelData);
    this._loadedModelsByGuid.delete(modelGuid);

    if (this.onModelUnloaded) {
      this.onModelUnloaded(modelGuid);
    }
  }

  private updateModelsDataArrays() {
    this._loadedMeshesArray = [...this._loadedMeshes];
    this._loadedModelsArray = [...this._loadedModels];
  }

  private emitOpenedModelsChanged() {  
    const modelOpenedInfos: ModelOpenedInfo[] = [];
    for (const [ modelGuid, model ] of this._loadedModelsByGuid) {
      modelOpenedInfos.push({guid: modelGuid, name: model.name, handles: model.handles});
    } 
    this._modelsOpenedChange.next(modelOpenedInfos);
  }
}
