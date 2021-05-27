import { Subscription } from "rxjs";
import { GltfViewer, ModelFileInfo, ModelOpenedInfo } from "../gltf-viewer";
import { GltfViewerOptions } from "../gltf-viewer-options";

class DemoViewer {
  static readonly containerSelector = "#gltf-viewer-container";
  static readonly fileInputSelector = "#model-file-input";  
  static readonly buttonOpenModelsSelector = "#btn-open-models";
  static readonly buttonCloseModelSelector = "#btn-close-model";
  static readonly buttonFitModelsToViewSelector = "#btn-fit-models";
  static readonly buttonFitElementsToViewSelector = "#btn-fit-elements";

  private readonly _container: HTMLElement;
  private readonly _fileInput: HTMLInputElement;

  private readonly _btnOpenModels: HTMLDivElement;
  private readonly _btnCloseModel: HTMLDivElement;
  private readonly _btnFitModelsToView: HTMLDivElement;
  private readonly _btnFitElementsToView: HTMLDivElement;

  private readonly _viewer: GltfViewer;

  private _subscriptions: Subscription[] = [];

  private _openedModelInfos: ModelOpenedInfo[] = [];
  private _selectedMeshIds: string[] = [];

  private _currentModelId = 0;
  private _urlById = new Map<number, string>();

  constructor() {
    this._container = document.querySelector(DemoViewer.containerSelector);
    this._fileInput = document.querySelector(DemoViewer.fileInputSelector);
    this._btnOpenModels = document.querySelector(DemoViewer.buttonOpenModelsSelector);
    this._btnCloseModel = document.querySelector(DemoViewer.buttonCloseModelSelector);
    this._btnFitModelsToView = document.querySelector(DemoViewer.buttonFitModelsToViewSelector);
    this._btnFitElementsToView = document.querySelector(DemoViewer.buttonFitElementsToViewSelector);

    this._viewer = new GltfViewer(DemoViewer.containerSelector, "/assets/draco/", new GltfViewerOptions(<GltfViewerOptions>{
      axesHelperPlacement: "top-right",
      meshMergeType: "scene",      
    }));

    this.initEventHandlers();
    this.initSubscriptions();
  }

  run() {
    // this._viewer.openModelsAsync([
    //   {
    //     url: "/assets/models/building_frame.glb",
    //     guid: "094c317c-ec3c-4964-888d-942c31107463",
    //     name: "building frame"
    //   },
    //   {
    //     url: "/assets/models/building_staircase.glb",
    //     guid: "d047287c-6a59-4ebf-9bc8-ffb01a6da7f6",
    //     name: "building staircase"
    //   },
    // ]);
  }

  private initEventHandlers() {
    this._fileInput.addEventListener("change", this.onFileInput);
    this._btnOpenModels.addEventListener("click", () => this._fileInput.click());
    this._btnCloseModel.addEventListener("click", () => {
      this.closeModelsAsync();
      this._btnCloseModel.classList.add("disabled");
    });
    this._btnFitModelsToView.addEventListener("click", () => this._viewer.zoomToItems([]));
    this._btnFitElementsToView.addEventListener("click", () => this._viewer.zoomToItems(this._selectedMeshIds));
  }

  private initSubscriptions() {
    this._subscriptions.push(
      this._viewer.meshesSelectionChange$.subscribe(x => {
        this._selectedMeshIds = [...x];
        if (this._selectedMeshIds.length === 1) {
          this._btnCloseModel.classList.remove("disabled");
        } else {          
          this._btnCloseModel.classList.add("disabled");
        }
        if (this._selectedMeshIds.length) {
          this._btnFitElementsToView.classList.remove("disabled");
        } else {
          this._btnFitElementsToView.classList.add("disabled");
        }
      }),
      this._viewer.modelsOpenedChange$.subscribe(x => {
        this._openedModelInfos = [...x];
        if (this._openedModelInfos.length) {
          this._btnFitModelsToView.classList.remove("disabled");
        } else {
          this._btnFitModelsToView.classList.add("disabled");
        }
      })
    );
  }
  
  private async closeModelsAsync() {
    const selectedMeshId = this._selectedMeshIds[0];
    if (!selectedMeshId) {
      return;
    }
    const modelId = selectedMeshId.split("|")[0];
    await this._viewer.closeModelsAsync([modelId]);
  }

  private async openModelsAsync(files: File[]) {
    const modelInfos: ModelFileInfo[] = files.map(x => {
      const url = URL.createObjectURL(x);
      this._urlById.set(this._currentModelId, url);
      return {
        url,
        guid: this._currentModelId++ + "",
        name: x.name,
      };
    });

    await this._viewer.openModelsAsync(modelInfos);
  }
  
  private onFileInput = () => {
    const fileList = this._fileInput.files;    
    if (fileList.length === 0) {
      return;
    }

    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      files.push(fileList[i]);
    }
    this.openModelsAsync(files);    

    this._fileInput.value = null;
  };
}

const demoViewer = new DemoViewer();
demoViewer.run();
