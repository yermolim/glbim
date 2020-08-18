import { BehaviorSubject, Subject } from 'rxjs';
import { Scene, AmbientLight, HemisphereLight, WebGLRenderer, sRGBEncoding, NoToneMapping, PerspectiveCamera, Box3, Vector3, WebGLRenderTarget, Color, MeshStandardMaterial, NoBlending, DoubleSide, Mesh, DirectionalLight, MeshPhysicalMaterial, NormalBlending } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ResizeSensor } from 'css-element-queries';

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
        if (item != null) {
            Object.assign(this, item);
        }
    }
}
class GltfViewer {
    constructor(containerId, options) {
        this._initialized = new BehaviorSubject(false);
        this._modelLoadingStateChange = new Subject();
        this._modelLoadingStart = new Subject();
        this._modelLoadingProgress = new Subject();
        this._modelLoadingEnd = new Subject();
        this._openedModelsChange = new Subject();
        this._selectionChange = new Subject();
        this._manualSelectionChange = new Subject();
        this._bakMatProp = "materialBackup";
        this._hlProp = "highlighted";
        this._selProp = "selected";
        this._isolProp = "isolated";
        this._colProp = "colored";
        this._colMatProp = "coloredMaterial";
        this._subscriptions = [];
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
        this.initRendererWithScene();
        this.initSpecialMaterials();
        this.initPickingScene();
        this.initLoader();
        this.addCanvasEventListeners();
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
    openModel(modelInfo) {
        if (modelInfo === null || modelInfo === void 0 ? void 0 : modelInfo.guid) {
            this._loadingQueue.push(modelInfo);
            this.loadQueuedModelsAsync();
        }
    }
    ;
    closeModel(modelGuid) {
        if (modelGuid) {
            this.removeModelFromScene(modelGuid);
        }
    }
    ;
    selectItems(ids) {
        if (ids === null || ids === void 0 ? void 0 : ids.length) {
            const { found, notFound } = this.findMeshesByIds(new Set(ids));
            if (found.length) {
                this.selectMeshes(found, false);
            }
        }
    }
    ;
    isolateItems(ids) {
        if (ids === null || ids === void 0 ? void 0 : ids.length) {
            const { found, notFound } = this.findMeshesByIds(new Set(ids));
            if (found.length) {
                this.selectMeshes(found, false, true);
            }
        }
    }
    ;
    colorItems(coloringInfos) {
        this.removeIsolation();
        this.removeSelection();
        this.colorMeshes(coloringInfos);
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
    initRendererWithScene() {
        const scene = new Scene();
        const ambientLight = new AmbientLight(0x222222, 1);
        const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 1);
        hemiLight.translateY(2000);
        scene.add(ambientLight);
        scene.add(hemiLight);
        const renderer = new WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(this._containerWidth, this._containerHeight, false);
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = sRGBEncoding;
        renderer.physicallyCorrectLights = false;
        renderer.toneMapping = NoToneMapping;
        const camera = new PerspectiveCamera(75, this._containerWidth / this._containerHeight, 0.01, 10000);
        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.addEventListener("change", () => this.render());
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        orbitControls.update();
        this._container.append(renderer.domElement);
        this._renderer = renderer;
        this._mainScene = scene;
        this._camera = camera;
        this._orbitControls = orbitControls;
        this.render();
    }
    render() {
        if (this._renderer) {
            requestAnimationFrame(() => this._renderer.render(this._mainScene, this._camera));
        }
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
                const { url, guid, name } = this._loadingQueue.shift();
                if (!this._loadedModelsByGuid.has(guid)) {
                    yield this.loadModel(url, guid, name);
                }
            }
            this._loadingInProgress = false;
            this._modelLoadingStateChange.next(false);
        });
    }
    loadModel(url, guid, name) {
        return __awaiter(this, void 0, void 0, function* () {
            this.onModelLoadingStart(url, guid);
            try {
                const model = yield this._loader.loadAsync(url, (progress) => this.onModelLoadingProgress(progress));
                this.addModelToScene(model, guid, name);
                this.onModelLoadingEnd(url, guid);
            }
            catch (error) {
                this.onModelLoadingEnd(url, guid, error);
            }
        });
    }
    onModelLoadingStart(url, guid) {
        this._modelLoadingStart.next({ url, guid });
    }
    onModelLoadingProgress(progress) {
        const currentProgress = Math.round(progress.loaded / progress.total * 100);
        this._modelLoadingProgress.next(currentProgress);
    }
    onModelLoadingEnd(url, guid, error = null) {
        if (error) {
            console.log(error);
        }
        this._modelLoadingProgress.next(0);
        this._modelLoadingEnd.next({ url, guid, error });
    }
    addModelToScene(gltf, modelGuid, modelName) {
        if (!this._mainScene) {
            return;
        }
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
                this.backupMeshMaterial(x);
                meshes.push(x);
                handles.add(x.name);
                if (this._loadedMeshesById.has(id)) {
                    this._loadedMeshesById.get(id).push(x);
                }
                else {
                    this._loadedMeshesById.set(id, [x]);
                }
                this.addMeshToPickingScene(x);
            }
        });
        this._mainScene.add(scene);
        this._loadedModelsByGuid.set(modelGuid, { gltf: gltf, meshes, handles, name });
        this.emitOpenedModelsChanged();
        this.fitCameraToObjects([this._mainScene]);
        this.render();
    }
    removeModelFromScene(modelGuid) {
        if (!this._mainScene || !this._loadedModelsByGuid.has(modelGuid)) {
            return;
        }
        const modelData = this._loadedModelsByGuid.get(modelGuid);
        modelData.meshes.forEach(x => {
            this._loadedMeshesById.delete(x.userData.id);
            this.removeMeshFromPickingScene(x);
        });
        this._mainScene.remove(modelData.gltf.scene);
        this._loadedModelsByGuid.delete(modelGuid);
        this.emitOpenedModelsChanged();
        this.render();
    }
    emitOpenedModelsChanged() {
        const openedModelsMap = new Map();
        for (const [modelGuid, model] of this._loadedModelsByGuid) {
            openedModelsMap.set(modelGuid, { name: model.name, handles: model.handles });
        }
        this._openedModelsChange.next(openedModelsMap);
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
    selectMeshAtPoint(x, y, keepPreviousSelection = false) {
        const position = this.getPickingPosition(x, y);
        const mesh = this.getItemAtPickingPosition(position);
        if (!mesh) {
            this.selectMeshes([], true);
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
            this.selectMeshes([mesh], true);
        }
    }
    addToSelection(mesh) {
        const meshes = [mesh, ...this._selectedMeshes];
        this.selectMeshes(meshes, true);
        return true;
    }
    removeFromSelection(mesh) {
        const meshes = this._selectedMeshes.filter(x => x !== mesh);
        this.selectMeshes(meshes, true);
        return true;
    }
    selectMeshes(meshes, manual, isolateSelected = false) {
        this.removeSelection();
        this.removeIsolation();
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.emitSelectionChanged(manual);
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
        this.emitSelectionChanged(manual);
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
    emitSelectionChanged(manual) {
        if (!manual) {
            this.fitCameraToObjects(this._selectedMeshes);
        }
        this.render();
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
    colorMeshes(coloringInfos) {
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
                });
                info.ids.forEach(x => {
                    const meshes = this._loadedMeshesById.get(x);
                    meshes.forEach(y => {
                        y[this._colProp] = true;
                        y[this._colMatProp] = coloredMaterial;
                        y.material = coloredMaterial;
                        this._coloredMeshes.push(y);
                    });
                });
            }
        }
        this.render();
    }
    removeColoring() {
        for (const mesh of this._coloredMeshes) {
            mesh[this._colProp] = undefined;
            this.refreshMeshMaterial(mesh);
        }
        this._coloredMeshes.length = 0;
    }
    initSpecialMaterials() {
        const selectionMaterial = new MeshPhysicalMaterial({
            color: new Color(0xFF0000),
            emissive: new Color(0xFF0000),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        const highlightMaterial = new MeshPhysicalMaterial({
            color: new Color(0xFFFF00),
            emissive: new Color(0x000000),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        const isolateMaterial = new MeshPhysicalMaterial({
            color: new Color(0x555555),
            emissive: new Color(0x000000),
            blending: NormalBlending,
            flatShading: true,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
            opacity: 0.2,
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
