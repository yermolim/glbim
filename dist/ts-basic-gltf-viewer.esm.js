import { BehaviorSubject, Subject, AsyncSubject } from 'rxjs';
import { AmbientLight, HemisphereLight, DirectionalLight, WebGLRenderer, sRGBEncoding, NoToneMapping, PerspectiveCamera, Scene, Mesh, Uint32BufferAttribute, Float32BufferAttribute, BufferGeometry, Box3, Vector3, WebGLRenderTarget, Color, MeshStandardMaterial, NoBlending, DoubleSide, MeshPhysicalMaterial, NormalBlending } from 'three';
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
class RgbRmoColor {
    constructor(r, g, b, roughness, metalness, opacity) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.roughness = roughness;
        this.metalness = metalness;
        this.opacity = opacity;
    }
    static createFromMaterial(material) {
        return new RgbRmoColor(material.color.r, material.color.g, material.color.b, material.roughness, material.metalness, material.opacity);
    }
    static deleteFromMesh(mesh, deleteCustom = false, deleteDefault = false) {
        mesh[RgbRmoColor.prop] = null;
        if (deleteCustom) {
            mesh[RgbRmoColor.customProp] = null;
        }
        if (deleteDefault) {
            mesh[RgbRmoColor.defaultProp] = null;
        }
    }
    static getDefaultFromMesh(mesh) {
        if (!mesh[RgbRmoColor.defaultProp]) {
            mesh[RgbRmoColor.defaultProp] = RgbRmoColor.createFromMaterial(mesh.material);
        }
        return mesh[RgbRmoColor.defaultProp];
    }
    static getCustomFromMesh(mesh) {
        return mesh[RgbRmoColor.customProp];
    }
    static getFromMesh(mesh) {
        if (mesh[RgbRmoColor.prop]) {
            return mesh[RgbRmoColor.prop];
        }
        if (mesh[RgbRmoColor.customProp]) {
            return mesh[RgbRmoColor.customProp];
        }
        return RgbRmoColor.getDefaultFromMesh(mesh);
    }
    static setCustomToMesh(mesh, rgbRmo) {
        mesh[RgbRmoColor.customProp] = rgbRmo;
    }
    static setToMesh(mesh, rgbRmo) {
        mesh[RgbRmoColor.prop] = rgbRmo;
    }
}
RgbRmoColor.prop = "rgbrmo";
RgbRmoColor.customProp = "rgbrmoC";
RgbRmoColor.defaultProp = "rgbrmoD";
class GltfViewerOptions {
    constructor(item = null) {
        this.dracoDecoderEnabled = true;
        this.dracoDecoderPath = "/assets/draco/";
        this.highlightingEnabled = true;
        this.highlightingLatency = 40;
        this.highlightColor = 0xFFFF00;
        this.selectionColor = 0xFF0000;
        this.isolationColor = 0x555555;
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
        this._pickingMeshById = new Map();
        this._meshByPickingColor = new Map();
        this._lastPickingColor = 0;
        this._pointerEventHelper = { downX: null, downY: null, maxDiff: 10, mouseMoveTimer: null, waitForDouble: false };
        this._loadingInProgress = false;
        this._loadingQueue = [];
        this._loadedModels = new Set();
        this._loadedModelsByGuid = new Map();
        this._loadedModelsArray = [];
        this._loadedMeshes = new Set();
        this._loadedMeshesById = new Map();
        this._loadedMeshesArray = [];
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
        this.initMaterials();
        this.initLigths();
        this.initLoader();
        this.initRenderer();
        this.initCameraWithControls();
        this.addCanvasEventListeners();
        this.render();
        this._initialized.next(true);
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        (_a = this._containerResizeSensor) === null || _a === void 0 ? void 0 : _a.detach();
        (_b = this._renderer) === null || _b === void 0 ? void 0 : _b.dispose();
        (_c = this._orbitControls) === null || _c === void 0 ? void 0 : _c.dispose();
        (_e = (_d = this._loader) === null || _d === void 0 ? void 0 : _d.dracoLoader) === null || _e === void 0 ? void 0 : _e.dispose();
        (_f = this._globalGeometry) === null || _f === void 0 ? void 0 : _f.dispose();
        (_g = this._globalMaterial) === null || _g === void 0 ? void 0 : _g.dispose();
        this._loadedMeshes.forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        [...this._meshByPickingColor.values()].forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        (_h = this._pickingTarget) === null || _h === void 0 ? void 0 : _h.dispose();
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
        if (modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length) {
            this.removeLoadedModels(modelGuids);
        }
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
        const camera = new PerspectiveCamera(75, this._containerWidth / this._containerHeight, 1, 10000);
        const orbitControls = new OrbitControls(camera, this._renderer.domElement);
        orbitControls.addEventListener("change", () => this.render());
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        orbitControls.update();
        this._camera = camera;
        this._orbitControls = orbitControls;
    }
    updateRenderScene() {
        this.rebuildRenderScene();
        if (this._loadedMeshesArray.length) {
            this.fitCameraToObjects([this._renderScene]);
        }
        this._globalGeometryIndicesNeedSort = true;
        this.render();
    }
    rebuildRenderScene() {
        this._renderScene = null;
        const scene = new Scene();
        scene.add(...this._lights);
        this.rebuildGlobalGeometry();
        if (this._globalGeometry) {
            const globalMesh = new Mesh(this._globalGeometry, this._globalMaterial);
            scene.add(globalMesh);
        }
        this._renderScene = scene;
    }
    rebuildGlobalGeometry() {
        var _a, _b;
        this._globalGeometryIndicesByMesh = null;
        this._globalGeometryIndex = null;
        this._globalGeometryColor = null;
        this._globalGeometryRmo = null;
        this._globalGeometryPosition = null;
        (_a = this._globalGeometry) === null || _a === void 0 ? void 0 : _a.dispose();
        this._globalGeometry = null;
        if (!((_b = this._loadedMeshesArray) === null || _b === void 0 ? void 0 : _b.length)) {
            return;
        }
        let positionsLen = 0;
        let indicesLen = 0;
        this._loadedMeshesArray.forEach(x => {
            positionsLen += x.geometry.getAttribute("position").count * 3;
            indicesLen += x.geometry.getIndex().count;
        });
        if (positionsLen === 0) {
            return;
        }
        const indexBuffer = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
        const colorBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
        const rmoBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
        const positionBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
        const indicesByMesh = new Map();
        let positionsOffset = 0;
        let indicesOffset = 0;
        this._loadedMeshesArray.forEach(x => {
            const geometry = x.geometry
                .clone()
                .applyMatrix4(x.matrix);
            const positions = geometry.getAttribute("position").array;
            const indices = geometry.getIndex().array;
            const meshIndices = new Uint32Array(indices.length);
            indicesByMesh.set(x, meshIndices);
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i] + positionsOffset;
                indexBuffer.setX(indicesOffset++, index);
                meshIndices[i] = index;
            }
            for (let i = 0; i < positions.length;) {
                const rgbrmo = RgbRmoColor.getFromMesh(x);
                colorBuffer.setXYZ(positionsOffset, rgbrmo.r, rgbrmo.g, rgbrmo.b);
                rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughness, rgbrmo.metalness, rgbrmo.opacity);
                positionBuffer.setXYZ(positionsOffset++, positions[i++], positions[i++], positions[i++]);
            }
            geometry.dispose();
        });
        const globalGeometry = new BufferGeometry();
        globalGeometry.setIndex(indexBuffer);
        globalGeometry.setAttribute("color", colorBuffer);
        globalGeometry.setAttribute("rmo", rmoBuffer);
        globalGeometry.setAttribute("position", positionBuffer);
        this._globalGeometry = globalGeometry;
        this._globalGeometryIndex = indexBuffer;
        this._globalGeometryColor = colorBuffer;
        this._globalGeometryRmo = rmoBuffer;
        this._globalGeometryPosition = positionBuffer;
        this._globalGeometryIndicesByMesh = indicesByMesh;
    }
    sortGlobalGeometryIndicesByOpacity() {
        if (!this._globalGeometry || !this._globalGeometryIndicesByMesh) {
            return;
        }
        let currentIndex = 0;
        this._loadedMeshesArray.sort((a, b) => RgbRmoColor.getFromMesh(b).opacity - RgbRmoColor.getFromMesh(a).opacity);
        this._loadedMeshesArray.forEach(mesh => {
            this._globalGeometryIndicesByMesh.get(mesh).forEach(value => {
                this._globalGeometryIndex.setX(currentIndex++, value);
            });
        });
        this._globalGeometryIndex.needsUpdate = true;
    }
    render() {
        if (!this._renderer) {
            return;
        }
        if (this._globalGeometryIndicesNeedSort) {
            this.sortGlobalGeometryIndicesByOpacity();
            this._globalGeometryIndicesNeedSort = false;
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
        this._camera.near = Math.min(distance / 100, 1);
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
        this._pickingMeshById.set(mesh.uuid, pickingMesh);
        this._meshByPickingColor.set(colorString, mesh);
    }
    removeMeshFromPickingScene(mesh) {
        const pickingMesh = this._pickingMeshById.get(mesh.uuid);
        if (pickingMesh) {
            this._pickingScene.remove(pickingMesh);
            this._pickingMeshById.delete(mesh.uuid);
            this._meshByPickingColor.delete(pickingMesh.userData.color);
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
        const mesh = this._meshByPickingColor.get(id.toString(16));
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
            this.updateRenderScene();
            this._modelLoadingStateChange.next(false);
            this._loadingInProgress = false;
        });
    }
    removeLoadedModels(modelGuids) {
        modelGuids.forEach(x => {
            this.removeModelFromLoaded(x);
        });
        this.updateRenderScene();
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
            if (x instanceof Mesh
                && x.geometry instanceof BufferGeometry
                && x.material instanceof MeshStandardMaterial) {
                const id = `${modelGuid}|${x.name}`;
                x.userData.id = id;
                x.userData.modelGuid = modelGuid;
                this.addMeshToPickingScene(x);
                this._loadedMeshes.add(x);
                if (this._loadedMeshesById.has(id)) {
                    this._loadedMeshesById.get(id).push(x);
                }
                else {
                    this._loadedMeshesById.set(id, [x]);
                }
                meshes.push(x);
                handles.add(x.name);
            }
        });
        const modelInfo = { gltf: gltf, meshes, handles, name };
        this._loadedModels.add(modelInfo);
        this._loadedModelsByGuid.set(modelGuid, modelInfo);
        this.updateModelsDataArrays();
        this.emitOpenedModelsChanged();
    }
    removeModelFromLoaded(modelGuid) {
        if (!this._loadedModelsByGuid.has(modelGuid)) {
            return;
        }
        const modelData = this._loadedModelsByGuid.get(modelGuid);
        modelData.meshes.forEach(x => {
            var _a;
            this._loadedMeshes.delete(x);
            this._loadedMeshesById.delete(x.userData.id);
            this.removeMeshFromPickingScene(x);
            (_a = x.geometry) === null || _a === void 0 ? void 0 : _a.dispose();
        });
        this._highlightedMesh = null;
        this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._loadedModels.delete(modelData);
        this._loadedModelsByGuid.delete(modelGuid);
        this.updateModelsDataArrays();
        this.emitOpenedModelsChanged();
    }
    updateModelsDataArrays() {
        this._loadedModelsArray = [...this._loadedModels];
        this._loadedMeshesArray = [...this._loadedMeshes];
    }
    emitOpenedModelsChanged() {
        const modelOpenedInfos = [];
        for (const [modelGuid, model] of this._loadedModelsByGuid) {
            modelOpenedInfos.push({ guid: modelGuid, name: model.name, handles: model.handles });
        }
        this._openedModelsChange.next(modelOpenedInfos);
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
                const color = new Color(info.color);
                const customColor = new RgbRmoColor(color.r, color.g, color.b, 1, 0, info.opacity);
                info.ids.forEach(x => {
                    const meshes = this._loadedMeshesById.get(x);
                    if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                        meshes.forEach(y => {
                            y[this._colProp] = true;
                            RgbRmoColor.setCustomToMesh(y, customColor);
                            this.refreshMeshRgbRmo(y);
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
            RgbRmoColor.deleteFromMesh(mesh, true);
            this.refreshMeshRgbRmo(mesh);
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
            this.refreshMeshRgbRmo(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    removeIsolation() {
        for (const mesh of this._isolatedMeshes) {
            mesh[this._isolProp] = undefined;
            this.refreshMeshRgbRmo(mesh);
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
            this.refreshMeshRgbRmo(x);
        });
        if (isolateSelected) {
            this.isolateSelectedMeshes();
        }
        this._selectedMeshes = meshes;
        this.emitSelectionChanged(manual, render);
    }
    isolateSelectedMeshes() {
        this._loadedMeshesArray.forEach(x => {
            if (!x[this._selProp]) {
                x[this._isolProp] = true;
                this.refreshMeshRgbRmo(x);
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
            this.refreshMeshRgbRmo(mesh);
            this._highlightedMesh = mesh;
        }
        this.render();
    }
    removeHighlighting() {
        if (this._highlightedMesh) {
            const mesh = this._highlightedMesh;
            mesh[this._hlProp] = undefined;
            this.refreshMeshRgbRmo(mesh);
            this._highlightedMesh = null;
        }
    }
    initMaterials() {
        const isolationColor = new Color(this._options.isolationColor);
        const isolationRgbRmoColor = new RgbRmoColor(isolationColor.r, isolationColor.g, isolationColor.b, 1, 0, this._options.isolationOpacity);
        const selectionColor = new Color(this._options.selectionColor);
        const highlightColor = new Color(this._options.highlightColor);
        this._globalMaterial = this.buildGlobalMaterial(true);
        this._isolationColor = isolationRgbRmoColor;
        this._selectionColor = selectionColor;
        this._highlightColor = highlightColor;
    }
    buildGlobalMaterial(transparent) {
        const globalMaterial = new MeshPhysicalMaterial({
            vertexColors: true,
            flatShading: true,
            blending: NormalBlending,
            side: DoubleSide,
            transparent,
        });
        globalMaterial.onBeforeCompile = shader => {
            shader.vertexShader =
                `
        attribute vec3 rmo;        
        varying float roughness;
        varying float metalness;
        varying float opacity;
        `
                    + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("void main() {", `
        void main() {
          roughness = rmo.x;
          metalness = rmo.y;
          opacity = rmo.z;
        `);
            shader.fragmentShader = shader.fragmentShader.replace("uniform float roughness;", "varying float roughness;");
            shader.fragmentShader = shader.fragmentShader.replace("uniform float metalness;", "varying float metalness;");
            shader.fragmentShader = shader.fragmentShader.replace("uniform float opacity;", "varying float opacity;");
        };
        return globalMaterial;
    }
    refreshMeshRgbRmo(mesh) {
        if (!mesh) {
            return;
        }
        if (!mesh[this._isolProp]) {
            RgbRmoColor.deleteFromMesh(mesh);
        }
        const initialRgbrmo = RgbRmoColor.getFromMesh(mesh);
        if (mesh[this._hlProp]) {
            RgbRmoColor.setToMesh(mesh, new RgbRmoColor(this._highlightColor.r, this._highlightColor.g, this._highlightColor.b, initialRgbrmo.roughness, initialRgbrmo.metalness, initialRgbrmo.opacity));
        }
        else if (mesh[this._selProp]) {
            RgbRmoColor.setToMesh(mesh, new RgbRmoColor(this._selectionColor.r, this._selectionColor.g, this._selectionColor.b, initialRgbrmo.roughness, initialRgbrmo.metalness, initialRgbrmo.opacity));
        }
        else if (mesh[this._isolProp]) {
            RgbRmoColor.setToMesh(mesh, this._isolationColor);
        }
        const rgbrmo = RgbRmoColor.getFromMesh(mesh);
        this._globalGeometryIndicesByMesh.get(mesh).forEach(i => {
            this._globalGeometryColor.setXYZ(i, rgbrmo.r, rgbrmo.g, rgbrmo.b);
            this._globalGeometryRmo.setXYZ(i, rgbrmo.roughness, rgbrmo.metalness, rgbrmo.opacity);
        });
        this._globalGeometryColor.needsUpdate = true;
        this._globalGeometryRmo.needsUpdate = true;
        if (rgbrmo.opacity !== initialRgbrmo.opacity) {
            this._globalGeometryIndicesNeedSort = true;
        }
    }
}

export { GltfViewer, GltfViewerOptions };
