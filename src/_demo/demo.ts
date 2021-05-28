import { Subscription } from "rxjs";
import { GltfViewer, ModelFileInfo, ModelOpenedInfo, ViewerInteractionMode } from "../gltf-viewer";
import { GltfViewerOptions } from "../gltf-viewer-options";
class LoadingAnimation {
  protected readonly _loaderElement: HTMLElement;

  protected _isShown: boolean;
  protected _hidePromise: Promise<void>;

  constructor() { 
    const template = document.createElement("template");
    template.innerHTML = `    
      <div class="abs-stretch loader-container">
        <div class="loader">
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
    `;    

    this._loaderElement = template.content.childNodes[1] as HTMLElement;
  }

  async showAsync(parent: HTMLElement, zIndex = 8) {
    if (this._hidePromise) {
      await this._hidePromise;
      this._hidePromise = null;
    }

    if (this._isShown || !parent) {
      return;
    }

    this._loaderElement.style.animation = "fadeIn 500ms";
    this._loaderElement.style.zIndex = zIndex + "";
    this._loaderElement.style.top = parent.scrollTop + "px";
    this._loaderElement.style.left = parent.scrollLeft + "px";
    parent.append(this._loaderElement);
    this._isShown = true;
  }

  hide() {
    if (this._hidePromise) {
      return;
    }

    this._loaderElement.style.animation = "fadeOut 500ms";
    this._hidePromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        this._loaderElement.remove();
        this._isShown = false;
        resolve();
      }, 500);
    });
  }
}

class DemoViewer {
  static readonly outerContainerSel = "#outer-container";
  static readonly viewerContainerSel = "#viewer-container";
  static readonly fileInputSel = "#model-file-input";  

  static readonly dataOverlaySel = "#data-overlay";  
  static readonly settingsOverlaySel = "#settings-overlay";  
  static readonly measurementsOverlaySel = "#measurements-overlay";  

  static readonly btnOpenModelsSel = "#btn-open-models";
  static readonly btnCloseModelSel = "#btn-close-model";
  static readonly btnFitModelsToViewSel = "#btn-fit-models";
  static readonly btnFitElementsToViewSel = "#btn-fit-elements";
  static readonly btnHideSelectedSel = "#btn-hide-selected";
  static readonly btnUnhideAllSel = "#btn-unhide-all";
  static readonly btnToggleAutofocusSel = "#btn-toggle-autofocus";
  static readonly btnToggleNavigationSel = "#btn-toggle-navigation";
  static readonly btnToggleDataOverlaySel = "#btn-toggle-data-overlay";
  static readonly btnToggleSettingsOverlaySel = "#btn-toggle-settings-overlay";
  static readonly btnsModeSel = ".btn-mode-selection";

  static readonly cbxAntiAliasingSel = "#cb-aa";
  static readonly cbxPhysicalLightsSel = "#cb-pl";
  static readonly cbxAxesHelperSel = "#cb-axes";

  static readonly selectMeshMergeSel = "#select-mesh-merge-type";
  static readonly selectFastRenderSel = "#select-fast-render-type";
  
  private readonly _outerContainer: HTMLElement;
  private readonly _viewerContainer: HTMLElement;
  private readonly _fileInput: HTMLInputElement;

  private readonly _dataOverlay: HTMLElement;
  private readonly _settingsOverlay: HTMLElement;
  private readonly _measurementsOverlay: HTMLElement;

  private readonly _btnOpenModels: HTMLDivElement;
  private readonly _btnCloseModel: HTMLDivElement;
  private readonly _btnFitModelsToView: HTMLDivElement;
  private readonly _btnFitElementsToView: HTMLDivElement;
  private readonly _btnHideSelected: HTMLDivElement;
  private readonly _btnUnhideAll: HTMLDivElement;
  private readonly _btnToggleAutofocus: HTMLDivElement;
  private readonly _btnToggleNavigation: HTMLDivElement;
  private readonly _btnToggleDataOverlay: HTMLDivElement;
  private readonly _btnToggleSettingsOverlay: HTMLDivElement;
  private readonly _btnModes: HTMLDivElement[] = [];

  private readonly _cbxAntiAliasing: HTMLInputElement;
  private readonly _cbxPhysicalLights: HTMLInputElement;
  private readonly _cbxAxesHelper: HTMLInputElement;

  private readonly _selectMeshMerge: HTMLSelectElement;
  private readonly _selectFastRender: HTMLSelectElement;

  private readonly _loader: LoadingAnimation;
  private readonly _viewer: GltfViewer;

  private _subscriptions: Subscription[] = [];

  private _options: GltfViewerOptions;
  private _openedModelInfos: ModelOpenedInfo[] = [];
  private _selectedMeshIds: string[] = [];
  private _hiddenMeshIds: string[] = [];

  private _currentModelId = 0;
  private _urlById = new Map<number, string>();

  constructor() {
    this._outerContainer = document.querySelector(DemoViewer.outerContainerSel);
    this._viewerContainer = document.querySelector(DemoViewer.viewerContainerSel);
    this._fileInput = document.querySelector(DemoViewer.fileInputSel);

    this._dataOverlay = document.querySelector(DemoViewer.dataOverlaySel);
    this._settingsOverlay = document.querySelector(DemoViewer.settingsOverlaySel);
    this._measurementsOverlay = document.querySelector(DemoViewer.measurementsOverlaySel);

    this._btnOpenModels = document.querySelector(DemoViewer.btnOpenModelsSel);
    this._btnCloseModel = document.querySelector(DemoViewer.btnCloseModelSel);
    this._btnFitModelsToView = document.querySelector(DemoViewer.btnFitModelsToViewSel);
    this._btnFitElementsToView = document.querySelector(DemoViewer.btnFitElementsToViewSel);
    this._btnHideSelected = document.querySelector(DemoViewer.btnHideSelectedSel);
    this._btnUnhideAll = document.querySelector(DemoViewer.btnUnhideAllSel);
    this._btnToggleAutofocus = document.querySelector(DemoViewer.btnToggleAutofocusSel);
    this._btnToggleNavigation = document.querySelector(DemoViewer.btnToggleNavigationSel);
    this._btnToggleDataOverlay = document.querySelector(DemoViewer.btnToggleDataOverlaySel);
    this._btnToggleSettingsOverlay = document.querySelector(DemoViewer.btnToggleSettingsOverlaySel);
    const modeSelectionButtons = document.querySelectorAll(DemoViewer.btnsModeSel);
    modeSelectionButtons.forEach(x => this._btnModes.push(x as HTMLDivElement));

    this._cbxAntiAliasing = document.querySelector(DemoViewer.cbxAntiAliasingSel);
    this._cbxPhysicalLights = document.querySelector(DemoViewer.cbxPhysicalLightsSel);
    this._cbxAxesHelper = document.querySelector(DemoViewer.cbxAxesHelperSel);

    this._selectMeshMerge = document.querySelector(DemoViewer.selectMeshMergeSel);
    this._selectFastRender = document.querySelector(DemoViewer.selectFastRenderSel);


    this._loader = new LoadingAnimation();
    this._loader.showAsync(this._outerContainer);

    this._viewer = new GltfViewer(DemoViewer.viewerContainerSel, "/assets/draco/", new GltfViewerOptions(<GltfViewerOptions>{
      axesHelperPlacement: "top-right",
      meshMergeType: "scene",     
      fastRenderType: null, 
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
    this._btnHideSelected.addEventListener("click", () => this._viewer.hideSelectedItems());
    this._btnUnhideAll.addEventListener("click", () => this._viewer.unhideAllItems());
    this._btnToggleAutofocus.addEventListener("click", () => {
      this._options.selectionAutoFocusEnabled = !this._options.selectionAutoFocusEnabled;
      this._viewer.updateOptionsAsync(this._options);
    });
    this._btnToggleNavigation.addEventListener("click", () => {
      this._options.cameraControlsDisabled = !this._options.cameraControlsDisabled;
      this._viewer.updateOptionsAsync(this._options);
    });
    this._btnToggleDataOverlay.addEventListener("click", () => {
      this._dataOverlay.classList.toggle("hidden");
      this._btnToggleDataOverlay.classList.toggle("active");
    });
    this._btnToggleSettingsOverlay.addEventListener("click", () => {
      this._settingsOverlay.classList.toggle("hidden");
      this._btnToggleSettingsOverlay.classList.toggle("active");
    });
    this._btnModes.forEach(x => {
      x.addEventListener("click", () => this.setMode(<any>x.dataset.mode));
    });
    this._cbxAntiAliasing.addEventListener("change", () => {
      this._options.useAntialiasing = this._cbxAntiAliasing.checked;
      this._viewer.updateOptionsAsync(this._options);
    });
    this._cbxPhysicalLights.addEventListener("change", () => {
      this._options.usePhysicalLights = this._cbxPhysicalLights.checked;
      this._viewer.updateOptionsAsync(this._options);
    });
    this._cbxAxesHelper.addEventListener("change", () => {
      this._options.axesHelperEnabled = this._cbxAxesHelper.checked;
      this._viewer.updateOptionsAsync(this._options);
    });
    this._selectMeshMerge.addEventListener("change", () => {
      if (!this._selectMeshMerge.value) {
        this._options.meshMergeType = null;
      } else {
        this._options.meshMergeType = <any>this._selectMeshMerge.value;
      }
      this._viewer.updateOptionsAsync(this._options);
    });
    this._selectFastRender.addEventListener("change", () => {
      if (!this._selectFastRender.value) {
        this._options.fastRenderType = null;
      } else {
        this._options.fastRenderType = <any>this._selectFastRender.value;
      }
      this._viewer.updateOptionsAsync(this._options);
    });
  }

  private initSubscriptions() {
    this._subscriptions.push(
      this._viewer.optionsChange$.subscribe(x => {
        this._options = x;
        if (this._options.cameraControlsDisabled) {
          this._btnToggleNavigation.classList.remove("active");
        } else {
          this._btnToggleNavigation.classList.add("active");
        }
        if (this._options.selectionAutoFocusEnabled) {
          this._btnToggleAutofocus.classList.add("active");
        } else {
          this._btnToggleAutofocus.classList.remove("active");
        }
        this._cbxAntiAliasing.checked = this._options.useAntialiasing;
        this._cbxPhysicalLights.checked = this._options.usePhysicalLights;
        this._cbxAxesHelper.checked = this._options.axesHelperEnabled;
        this._selectMeshMerge.value = this._options.meshMergeType || "";
        this._selectFastRender.value = this._options.fastRenderType || "";
      }),
      this._viewer.loadingStateChange$.subscribe(x => {
        if (x) {
          this._loader.showAsync(this._outerContainer);
        } else {
          this._loader.hide();
        }
      }),
      this._viewer.meshesSelectionChange$.subscribe(x => {
        this._selectedMeshIds = [...x];
        if (this._selectedMeshIds.length === 1) {
          this._btnCloseModel.classList.remove("disabled");
        } else {          
          this._btnCloseModel.classList.add("disabled");
        }
        if (this._selectedMeshIds.length) {
          this._btnFitElementsToView.classList.remove("disabled");
          this._btnHideSelected.classList.remove("disabled");
        } else {
          this._btnFitElementsToView.classList.add("disabled");
          this._btnHideSelected.classList.add("disabled");
        }
      }),
      this._viewer.modelsOpenedChange$.subscribe(x => {
        this._openedModelInfos = [...x];
        if (this._openedModelInfos.length) {
          this._btnFitModelsToView.classList.remove("disabled");
        } else {
          this._btnFitModelsToView.classList.add("disabled");
        }
      }),
      this._viewer.meshesHiddenChange$.subscribe(x => {
        this._hiddenMeshIds = [...x];
        if (this._hiddenMeshIds.length) {
          this._btnUnhideAll.classList.remove("disabled");
        } else {
          this._btnUnhideAll.classList.add("disabled");
        }
      }),
      this._viewer.distanceMeasureChange$.subscribe(x => {
        if (!x) {
          this._measurementsOverlay.classList.add("hidden");
          return;
        }
        console.log(x.start?.x.toFixed(3));
        
        this._measurementsOverlay.querySelector("#start-x-value").innerHTML = x.start?.x.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#start-y-value").innerHTML = x.start?.y.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#start-z-value").innerHTML = x.start?.z.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#end-x-value").innerHTML = x.end?.x.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#end-y-value").innerHTML = x.end?.y.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#end-z-value").innerHTML = x.end?.z.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#distance-x-value").innerHTML = x.distance?.x.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#distance-y-value").innerHTML = x.distance?.y.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#distance-z-value").innerHTML = x.distance?.z.toFixed(3) || 0 + "";
        this._measurementsOverlay.querySelector("#distance-value").innerHTML = x.distance?.w.toFixed(3) || 0 + "";
        this._measurementsOverlay.classList.remove("hidden");
      }),
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

  private setMode(mode: ViewerInteractionMode) {
    this._viewer.setInteractionMode(mode);
    this._btnModes.forEach(x => {
      if (x.dataset.mode === mode) {
        x.classList.add("active");
      } else {        
        x.classList.remove("active");
      }
    });
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
