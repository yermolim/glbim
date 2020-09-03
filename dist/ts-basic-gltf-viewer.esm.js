import { BehaviorSubject, Subject, AsyncSubject } from 'rxjs';
import { AmbientLight, HemisphereLight, DirectionalLight, WebGLRenderer, sRGBEncoding, NoToneMapping, PerspectiveCamera, Scene, Box3, Vector3, WebGLRenderTarget, Color, MeshStandardMaterial, NoBlending, DoubleSide, Mesh, MeshPhysicalMaterial, NormalBlending } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ResizeSensor } from 'css-element-queries';
import { first } from 'rxjs/operators';

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class GltfViewerOptions {
    constructor(item = null) {
        this.dracoDecoderEnabled = true;
        this.dracoDecoderPath = "/assets/draco/";
        this.highlightingEnabled = true;
        this.highlightingLatency = 300;
        this.highlightColor = 0xFFFF00;
        this.highlightEmissive = 0x000000;
        this.selectionColor = 0xFF0000;
        this.selectionEmissive = 0xFF0000;
        this.isolationColor = 0x555555;
        this.isolationEmissive = 0x000000;
        this.isolationOpacity = 0.2;
        this.physicalLights = false;
        this.ambientLight = true;
        this.ambientLightIntensity = 1;
        this.hemiLight = true;
        this.hemiLightIntensity = 0.4;
        this.dirLight = true;
        this.dirLightIntensity = 0.6;
        this.useAntialiasing = true;
        if (item != null) {
            Object.assign(this, item);
        }
    }
}
class GltfViewer {
    constructor(containerId, options) {
        this._initialized = new BehaviorSubject(false);
        this._modelLoadingStateChange = new BehaviorSubject(false);
        this._modelLoadingStart = new Subject();
        this._modelLoadingEnd = new Subject();
        this._modelLoadingProgress = new Subject();
        this._openedModelsChange = new BehaviorSubject([]);
        this._selectionChange = new BehaviorSubject(new Set());
        this._manualSelectionChange = new Subject();
        this._bakMatProp = "materialBackup";
        this._colMatProp = "materialColored";
        this._hlProp = "highlighted";
        this._selProp = "selected";
        this._isolProp = "isolated";
        this._colProp = "colored";
        this._subscriptions = [];
        this._lights = [];
        this._queuedColoring = null;
        this._queuedSelection = null;
        this._highlightedMesh = null;
        this._selectedMeshes = [];
        this._isolatedMeshes = [];
        this._coloredMeshes = [];
        this._pickingColorToMesh = new Map();
        this._lastPickingColor = 0;
        this._pointerEventHelper = { downX: null, downY: null, maxDiff: 10, mouseMoveTimer: null, waitForDouble: false };
        this._loadingInProgress = false;
        this._loadingQueue = [];
        this._loadedModelsByGuid = new Map();
        this._loadedMeshesById = new Map();
        this._loadedGroups = new Set();
        this._onCanvasPointerDown = (e) => {
            this._pointerEventHelper.downX = e.clientX;
            this._pointerEventHelper.downY = e.clientY;
        };
        this._onCanvasPointerUp = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            if (!this._pointerEventHelper.downX
                || Math.abs(x - this._pointerEventHelper.downX) > this._pointerEventHelper.maxDiff
                || Math.abs(y - this._pointerEventHelper.downY) > this._pointerEventHelper.maxDiff) {
                return;
            }
            if (this._pointerEventHelper.waitForDouble) {
                if (this._selectedMeshes.length) {
                    this.isolateSelectedMeshes();
                    this.fitCameraToObjects(this._selectedMeshes);
                }
                this._pointerEventHelper.waitForDouble = false;
            }
            else {
                this._pointerEventHelper.waitForDouble = true;
                setTimeout(() => {
                    this._pointerEventHelper.waitForDouble = false;
                }, 300);
                this.selectMeshAtPoint(x, y, e.ctrlKey);
            }
            this._pointerEventHelper.downX = null;
            this._pointerEventHelper.downY = null;
        };
        this._onCanvasMouseMove = (e) => {
            if (e.buttons) {
                return;
            }
            clearTimeout(this._pointerEventHelper.mouseMoveTimer);
            this._pointerEventHelper.mouseMoveTimer = null;
            this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
                const x = e.clientX;
                const y = e.clientY;
                this.highlightMeshAtPoint(x, y);
            }, this._options.highlightingLatency);
        };
        this._container = document.getElementById(containerId);
        if (!this._container) {
            throw new Error("Container not found!");
        }
        this._options = new GltfViewerOptions(options);
        this.init();
    }
    init() {
        this._containerResizeSensor = new ResizeSensor(this._container, () => {
            this.updateContainerDimensions();
            this.updateRendererSize();
        });
        this.initObservables();
        this.initPickingScene();
        this.initSpecialMaterials();
        this.initLigths();
        this.initLoader();
        this.initRenderer();
        this.initCameraWithControls();
        this.addCanvasEventListeners();
        this.render();
        this._initialized.next(true);
    }
    destroy() {
        var _a;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        if (this._renderer) {
            this._renderer.dispose();
        }
        if (this._orbitControls) {
            this._orbitControls.dispose();
        }
        if ((_a = this._loader) === null || _a === void 0 ? void 0 : _a.dracoLoader) {
            this._loader.dracoLoader.dispose();
        }
        if (this._containerResizeSensor) {
            this._containerResizeSensor.detach();
        }
    }
    openModelsAsync(modelInfos) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(modelInfos === null || modelInfos === void 0 ? void 0 : modelInfos.length)) {
                return [];
            }
            const promises = [];
            modelInfos.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push({ fileInfo: x, subject: resultSubject });
                promises.push(resultSubject.pipe(first()).toPromise());
            });
            this.loadQueuedModelsAsync();
            const result = yield Promise.all(promises);
            return result;
        });
    }
    ;
    closeModels(modelGuids) {
        if (!(modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length)) {
            return;
        }
        modelGuids.forEach(x => {
            this.removeModelFromLoaded(x);
        });
    }
    ;
    selectItems(ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loadingInProgress) {
            this._queuedSelection = { ids, isolate: false };
            return;
        }
        this.findAndSelectMeshes(ids, false, true);
    }
    ;
    isolateItems(ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loadingInProgress) {
            this._queuedSelection = { ids, isolate: true };
            return;
        }
        this.findAndSelectMeshes(ids, true, true);
    }
    ;
    colorItems(coloringInfos) {
        if (this._loadingInProgress) {
            this._queuedColoring = coloringInfos;
            return;
        }
        this.resetSelectionAndColorMeshes(coloringInfos);
    }
    getOpenedModels() {
        return this._openedModelsChange.getValue();
    }
    getSelectedItems() {
        return this._selectionChange.getValue();
    }
    initObservables() {
        this.initialized$ = this._initialized.asObservable();
        this.modelLoadingStateChange$ = this._modelLoadingStateChange.asObservable();
        this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
        this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
        this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
        this.openedModelsChange$ = this._openedModelsChange.asObservable();
        this.selectionChange$ = this._selectionChange.asObservable();
        this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
    }
    closeSubjects() {
        this._initialized.complete();
        this._modelLoadingStateChange.complete();
        this._modelLoadingStart.complete();
        this._modelLoadingProgress.complete();
        this._modelLoadingEnd.complete();
        this._openedModelsChange.complete();
        this._selectionChange.complete();
        this._manualSelectionChange.complete();
    }
    addCanvasEventListeners() {
        this._renderer.domElement.addEventListener("pointerdown", this._onCanvasPointerDown);
        this._renderer.domElement.addEventListener("pointerup", this._onCanvasPointerUp);
        if (this._options.highlightingEnabled) {
            this._renderer.domElement.addEventListener("mousemove", this._onCanvasMouseMove);
        }
    }
    initLigths() {
        if (this._options.ambientLight) {
            const ambientLight = new AmbientLight(0x222222, this._options.physicalLights
                ? this._options.ambientLightIntensity * Math.PI
                : this._options.ambientLightIntensity);
            this._lights.push(ambientLight);
        }
        if (this._options.hemiLight) {
            const hemiLight = new HemisphereLight(0xffffbb, 0x080820, this._options.physicalLights
                ? this._options.hemiLightIntensity * Math.PI
                : this._options.hemiLightIntensity);
            hemiLight.position.set(0, 2000, 0);
            this._lights.push(hemiLight);
        }
        if (this._options.dirLight) {
            const dirLight = new DirectionalLight(0xffffff, this._options.physicalLights
                ? this._options.dirLightIntensity * Math.PI
                : this._options.dirLightIntensity);
            dirLight.position.set(-2, 10, 2);
            this._lights.push(dirLight);
        }
    }
    initRenderer() {
        const renderer = new WebGLRenderer({
            alpha: true,
            antialias: this._options.useAntialiasing,
        });
        renderer.setSize(this._containerWidth, this._containerHeight, false);
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = sRGBEncoding;
        renderer.physicallyCorrectLights = this._options.physicalLights;
        renderer.toneMapping = NoToneMapping;
        this._container.append(renderer.domElement);
        this._renderer = renderer;
    }
    initCameraWithControls() {
        const camera = new PerspectiveCamera(75, this._containerWidth / this._containerHeight, 0.01, 10000);
        const orbitControls = new OrbitControls(camera, this._renderer.domElement);
        orbitControls.addEventListener("change", () => this.render());
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        orbitControls.update();
        this._camera = camera;
        this._orbitControls = orbitControls;
    }
    refreshRenderScene() {
        const scene = new Scene();
        scene.add(...this._lights);
        if (this._loadedGroups.size) {
            scene.add(...this._loadedGroups);
        }
        this._renderScene = scene;
    }
    render() {
        if (!this._renderer) {
            return;
        }
        if (!this._renderScene) {
            this.refreshRenderScene();
        }
        requestAnimationFrame(() => {
            this._renderer.render(this._renderScene, this._camera);
        });
    }
    fitCameraToObjects(objects, offset = 1.2) {
        if (!(objects === null || objects === void 0 ? void 0 : objects.length)) {
            return;
        }
        const box = new Box3();
        for (const object of objects) {
            box.expandByObject(object);
        }
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this._camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / this._camera.aspect;
        const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
        const direction = this._orbitControls.target.clone()
            .sub(this._camera.position)
            .normalize()
            .multiplyScalar(distance);
        this._orbitControls.maxDistance = Math.max(distance * 10, 10000);
        this._orbitControls.target.copy(center);
        this._camera.near = Math.min(distance / 100, 0.01);
        this._camera.far = Math.max(distance * 100, 10000);
        this._camera.updateProjectionMatrix();
        this._camera.position.copy(this._orbitControls.target).sub(direction);
        this._orbitControls.update();
    }
    initPickingScene() {
        const pickingTarget = new WebGLRenderTarget(1, 1);
        const scene = new Scene();
        scene.background = new Color(0);
        this._pickingTarget = pickingTarget;
        this._pickingScene = scene;
    }
    nextPickingColor() {
        return ++this._lastPickingColor;
    }
    addMeshToPickingScene(mesh) {
        const pickingMeshMaterial = new MeshStandardMaterial({
            color: new Color(this.nextPickingColor()),
            emissive: new Color(this._lastPickingColor),
            blending: NoBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        const colorString = this._lastPickingColor.toString(16);
        const pickingMesh = new Mesh(mesh.geometry, pickingMeshMaterial);
        pickingMesh.userData.originalUuid = mesh.uuid;
        pickingMesh.userData.color = colorString;
        pickingMesh.position.copy(mesh.position);
        pickingMesh.rotation.copy(mesh.rotation);
        pickingMesh.scale.copy(mesh.scale);
        this._pickingScene.add(pickingMesh);
        this._pickingColorToMesh.set(colorString, mesh);
    }
    removeMeshFromPickingScene(mesh) {
        const pickingMesh = this._pickingScene.children.find(x => x.userData.originalUuid === mesh.uuid);
        if (pickingMesh) {
            this._pickingScene.remove(pickingMesh);
            this._pickingColorToMesh.delete(pickingMesh.userData.color);
        }
    }
    getPickingPosition(clientX, clientY) {
        const rect = this._renderer.domElement.getBoundingClientRect();
        const x = (clientX - rect.left) * this._renderer.domElement.width / rect.width;
        const y = (clientY - rect.top) * this._renderer.domElement.height / rect.height;
        return { x, y };
    }
    getItemAtPickingPosition(position) {
        const pixelRatio = this._renderer.getPixelRatio();
        this._camera.setViewOffset(this._renderer.getContext().drawingBufferWidth, this._renderer.getContext().drawingBufferHeight, position.x * pixelRatio || 0, position.y * pixelRatio || 0, 1, 1);
        const light = new DirectionalLight(0xFFFFFF, 1);
        light.position.set(-1, 2, 4);
        this._camera.add(light);
        this._renderer.setRenderTarget(this._pickingTarget);
        this._renderer.render(this._pickingScene, this._camera);
        this._renderer.setRenderTarget(null);
        this._camera.clearViewOffset();
        this._camera.remove(light);
        const pixelBuffer = new Uint8Array(4);
        this._renderer.readRenderTargetPixels(this._pickingTarget, 0, 0, 1, 1, pixelBuffer);
        const id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]);
        const mesh = this._pickingColorToMesh.get(id.toString(16));
        return mesh;
    }
    updateContainerDimensions() {
        const rect = this._container.getBoundingClientRect();
        this._containerWidth = rect.width;
        this._containerHeight = rect.height;
    }
    updateRendererSize() {
        if (this._renderer) {
            this._camera.aspect = this._containerWidth / this._containerHeight;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(this._containerWidth, this._containerHeight, false);
            this.render();
        }
    }
    initLoader() {
        const loader = new GLTFLoader();
        if (this._options.dracoDecoderEnabled) {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(this._options.dracoDecoderPath);
            dracoLoader.preload();
            loader.setDRACOLoader(dracoLoader);
        }
        this._loader = loader;
        this.loadQueuedModelsAsync();
    }
    loadQueuedModelsAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._loader || this._loadingInProgress) {
                return;
            }
            this._loadingInProgress = true;
            this._modelLoadingStateChange.next(true);
            while (this._loadingQueue.length > 0) {
                const { fileInfo, subject } = this._loadingQueue.shift();
                const { url, guid, name } = fileInfo;
                const result = !this._loadedModelsByGuid.has(guid)
                    ? yield this.loadModel(url, guid, name)
                    : { url, guid };
                subject.next(result);
                subject.complete();
            }
            this.runQueuedColoring(false);
            this.runQueuedSelection(false);
            this.render();
            this._modelLoadingStateChange.next(false);
            this._loadingInProgress = false;
        });
    }
    loadModel(url, guid, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.onModelLoadingStart(url, guid);
            let error;
            try {
                const model = yield this._loader.loadAsync(url, (progress) => this.onModelLoadingProgress(progress, url, guid));
                this.addModelToLoaded(model, guid, name);
            }
            catch (loadingError) {
                error = loadingError;
            }
            const result = { url, guid, error };
            this.onModelLoadingEnd(result);
            return result;
        });
    }
    onModelLoadingStart(url, guid) {
        this._modelLoadingStart.next({ url, guid });
    }
    onModelLoadingProgress(progress, url, guid) {
        const currentProgress = Math.round(progress.loaded / progress.total * 100);
        this._modelLoadingProgress.next({ url, guid, progress: currentProgress });
    }
    onModelLoadingEnd(info) {
        const { url, guid } = info;
        this._modelLoadingProgress.next({ url, guid, progress: 0 });
        this._modelLoadingEnd.next(info);
    }
    addModelToLoaded(gltf, modelGuid, modelName) {
        const name = modelName || modelGuid;
        const scene = gltf.scene;
        scene.userData.guid = modelGuid;
        scene.name = name;
        const meshes = [];
        const handles = new Set();
        scene.traverse(x => {
            if (x instanceof Mesh) {
                const id = `${modelGuid}|${x.name}`;
                x.userData.id = id;
                x.userData.modelGuid = modelGuid;
                this.backupMeshMaterial(x);
                if (this._loadedMeshesById.has(id)) {
                    this._loadedMeshesById.get(id).push(x);
                }
                else {
                    this._loadedMeshesById.set(id, [x]);
                }
                this.addMeshToPickingScene(x);
                meshes.push(x);
                handles.add(x.name);
            }
        });
        this._loadedGroups.add(scene);
        this._loadedModelsByGuid.set(modelGuid, { gltf: gltf, meshes, handles, name });
        this.emitOpenedModelsChanged();
    }
    removeModelFromLoaded(modelGuid) {
        if (!this._loadedModelsByGuid.has(modelGuid)) {
            return;
        }
        const modelData = this._loadedModelsByGuid.get(modelGuid);
        modelData.meshes.forEach(x => {
            var _a;
            this._loadedMeshesById.delete(x.userData.id);
            this.removeMeshFromPickingScene(x);
            (_a = x.geometry) === null || _a === void 0 ? void 0 : _a.dispose();
        });
        this._highlightedMesh = null;
        this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._loadedGroups.delete(modelData.gltf.scene);
        this._loadedModelsByGuid.delete(modelGuid);
        this.emitOpenedModelsChanged();
    }
    emitOpenedModelsChanged() {
        const modelOpenedInfos = [];
        for (const [modelGuid, model] of this._loadedModelsByGuid) {
            modelOpenedInfos.push({ guid: modelGuid, name: model.name, handles: model.handles });
        }
        this._openedModelsChange.next(modelOpenedInfos);
        this.refreshRenderScene();
        this.fitCameraToObjects([this._renderScene]);
        this.render();
    }
    runQueuedColoring(render = true) {
        if (this._queuedColoring) {
            this.resetSelectionAndColorMeshes(this._queuedColoring, render);
        }
    }
    resetSelectionAndColorMeshes(coloringInfos, render = true) {
        this.removeIsolation();
        this.removeSelection();
        this.colorMeshes(coloringInfos, render);
    }
    colorMeshes(coloringInfos, render) {
        this.removeColoring();
        if (coloringInfos === null || coloringInfos === void 0 ? void 0 : coloringInfos.length) {
            for (const info of coloringInfos) {
                const coloredMaterial = new MeshPhysicalMaterial({
                    color: new Color(info.color),
                    emissive: new Color(0x000000),
                    blending: NormalBlending,
                    flatShading: true,
                    side: DoubleSide,
                    roughness: 1,
                    metalness: 0,
                    opacity: info.opacity,
                    transparent: info.opacity < 1,
                });
                info.ids.forEach(x => {
                    const meshes = this._loadedMeshesById.get(x);
                    if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                        meshes.forEach(y => {
                            y[this._colProp] = true;
                            y[this._colMatProp] = coloredMaterial;
                            y.material = coloredMaterial;
                            this._coloredMeshes.push(y);
                        });
                    }
                });
            }
        }
        if (render) {
            this.render();
        }
    }
    removeColoring() {
        for (const mesh of this._coloredMeshes) {
            mesh[this._colProp] = undefined;
            this.refreshMeshMaterial(mesh);
        }
        this._coloredMeshes.length = 0;
    }
    runQueuedSelection(render) {
        if (this._queuedSelection) {
            const { ids, isolate } = this._queuedSelection;
            this.findAndSelectMeshes(ids, isolate, render);
        }
    }
    findAndSelectMeshes(ids, isolate, render) {
        const { found } = this.findMeshesByIds(new Set(ids));
        if (found.length) {
            this.selectMeshes(found, false, isolate, render);
        }
    }
    findMeshesByIds(ids) {
        const found = [];
        const notFound = new Set();
        ids.forEach(x => {
            if (this._loadedMeshesById.has(x)) {
                found.push(...this._loadedMeshesById.get(x));
            }
            else {
                notFound.add(x);
            }
        });
        return { found, notFound };
    }
    removeSelection() {
        for (const mesh of this._selectedMeshes) {
            mesh[this._selProp] = undefined;
            this.refreshMeshMaterial(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    removeIsolation() {
        for (const mesh of this._isolatedMeshes) {
            mesh[this._isolProp] = undefined;
            this.refreshMeshMaterial(mesh);
        }
        this._isolatedMeshes.length = 0;
    }
    selectMeshAtPoint(x, y, keepPreviousSelection) {
        const position = this.getPickingPosition(x, y);
        const mesh = this.getItemAtPickingPosition(position);
        if (!mesh) {
            this.selectMeshes([], true, false, true);
            return;
        }
        if (keepPreviousSelection) {
            if (mesh[this._selProp]) {
                this.removeFromSelection(mesh);
            }
            else {
                this.addToSelection(mesh);
            }
        }
        else {
            this.selectMeshes([mesh], true, false, true);
        }
    }
    addToSelection(mesh) {
        const meshes = [mesh, ...this._selectedMeshes];
        this.selectMeshes(meshes, true, false, true);
        return true;
    }
    removeFromSelection(mesh) {
        const meshes = this._selectedMeshes.filter(x => x !== mesh);
        this.selectMeshes(meshes, true, false, true);
        return true;
    }
    selectMeshes(meshes, manual, isolateSelected, render) {
        this.removeSelection();
        this.removeIsolation();
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.emitSelectionChanged(manual, render);
            return null;
        }
        meshes.forEach(x => {
            x[this._selProp] = true;
            this.refreshMeshMaterial(x);
        });
        if (isolateSelected) {
            this.isolateSelectedMeshes();
        }
        this._selectedMeshes = meshes;
        this.emitSelectionChanged(manual, render);
    }
    isolateSelectedMeshes() {
        const loadedMeshes = [...this._loadedMeshesById.values()].flatMap(x => x);
        loadedMeshes.forEach(x => {
            if (!x[this._selProp]) {
                x[this._isolProp] = true;
                this.refreshMeshMaterial(x);
                this._isolatedMeshes.push(x);
            }
        });
    }
    emitSelectionChanged(manual, render) {
        if (!manual) {
            this.fitCameraToObjects(this._selectedMeshes);
        }
        if (render) {
            this.render();
        }
        const ids = new Set();
        this._selectedMeshes.forEach(x => ids.add(x.userData.id));
        this._selectionChange.next(ids);
        if (manual) {
            this._manualSelectionChange.next(ids);
        }
    }
    highlightMeshAtPoint(x, y) {
        const position = this.getPickingPosition(x, y);
        const mesh = this.getItemAtPickingPosition(position);
        this.highlightItem(mesh);
    }
    highlightItem(mesh) {
        if (mesh === this._highlightedMesh) {
            return;
        }
        this.removeHighlighting();
        if (mesh) {
            mesh[this._hlProp] = true;
            this.refreshMeshMaterial(mesh);
            this._highlightedMesh = mesh;
        }
        this.render();
    }
    removeHighlighting() {
        if (this._highlightedMesh) {
            const mesh = this._highlightedMesh;
            mesh[this._hlProp] = undefined;
            this.refreshMeshMaterial(mesh);
            this._highlightedMesh = null;
        }
    }
    initSpecialMaterials() {
        const highlightMaterial = new MeshPhysicalMaterial({
            color: new Color(this._options.highlightColor),
            emissive: new Color(this._options.highlightEmissive),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        const selectionMaterial = new MeshPhysicalMaterial({
            color: new Color(this._options.selectionColor),
            emissive: new Color(this._options.selectionEmissive),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        const isolateMaterial = new MeshPhysicalMaterial({
            color: new Color(this._options.isolationColor),
            emissive: new Color(this._options.isolationEmissive),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
            opacity: this._options.isolationOpacity,
            transparent: true,
        });
        this._selectionMaterial = selectionMaterial;
        this._highlightMaterial = highlightMaterial;
        this._isolationMaterial = isolateMaterial;
    }
    backupMeshMaterial(mesh) {
        mesh[this._bakMatProp] = mesh.material;
    }
    refreshMeshMaterial(mesh) {
        if (mesh[this._hlProp]) {
            mesh.material = this._highlightMaterial;
        }
        else if (mesh[this._selProp]) {
            mesh.material = this._selectionMaterial;
        }
        else if (mesh[this._isolProp]) {
            mesh.material = this._isolationMaterial;
        }
        else if (mesh[this._colProp]) {
            mesh.material = mesh[this._colMatProp];
        }
        else {
            mesh.material = mesh[this._bakMatProp];
        }
    }
}

export { GltfViewer, GltfViewerOptions };
