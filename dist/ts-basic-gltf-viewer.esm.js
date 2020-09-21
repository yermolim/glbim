import { BehaviorSubject, Subject, AsyncSubject } from 'rxjs';
import { first } from 'rxjs/operators';
import { Color, MeshPhysicalMaterial, NormalBlending, DoubleSide, WebGLRenderTarget, Scene, DirectionalLight, Mesh, MeshStandardMaterial, NoBlending, PerspectiveCamera, Box3, Vector3, AmbientLight, HemisphereLight, WebGLRenderer, sRGBEncoding, NoToneMapping, Uint32BufferAttribute, Float32BufferAttribute, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { ResizeSensor } from 'css-element-queries';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

class PointerEventHelper {
    static get default() {
        return {
            downX: null,
            downY: null,
            maxDiff: 10,
            mouseMoveTimer: null,
            waitForDouble: false
        };
    }
}

class ColorRgbRmo {
    constructor(r, g, b, roughness, metalness, opacity) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.roughness = roughness;
        this.metalness = metalness;
        this.opacity = opacity;
    }
    static createFromMaterial(material) {
        return new ColorRgbRmo(material.color.r, material.color.g, material.color.b, material.roughness, material.metalness, material.opacity);
    }
    static deleteFromMesh(mesh, deleteCustom = false, deleteDefault = false) {
        mesh[ColorRgbRmo.prop] = null;
        if (deleteCustom) {
            mesh[ColorRgbRmo.customProp] = null;
        }
        if (deleteDefault) {
            mesh[ColorRgbRmo.defaultProp] = null;
        }
    }
    static getDefaultFromMesh(mesh) {
        if (!mesh[ColorRgbRmo.defaultProp]) {
            mesh[ColorRgbRmo.defaultProp] = ColorRgbRmo.createFromMaterial(mesh.material);
        }
        return mesh[ColorRgbRmo.defaultProp];
    }
    static getCustomFromMesh(mesh) {
        return mesh[ColorRgbRmo.customProp];
    }
    static getFromMesh(mesh) {
        if (mesh[ColorRgbRmo.prop]) {
            return mesh[ColorRgbRmo.prop];
        }
        if (mesh[ColorRgbRmo.customProp]) {
            return mesh[ColorRgbRmo.customProp];
        }
        return ColorRgbRmo.getDefaultFromMesh(mesh);
    }
    static setCustomToMesh(mesh, rgbRmo) {
        mesh[ColorRgbRmo.customProp] = rgbRmo;
    }
    static setToMesh(mesh, rgbRmo) {
        mesh[ColorRgbRmo.prop] = rgbRmo;
    }
    toString() {
        return `${this.r}|${this.g}|${this.b}|${this.roughness}|${this.metalness}|${this.opacity}`;
    }
}
ColorRgbRmo.prop = "rgbrmo";
ColorRgbRmo.customProp = "rgbrmoC";
ColorRgbRmo.defaultProp = "rgbrmoD";
class ColorRgbRmoUtils {
    constructor(options) {
        this._materials = new Map();
        const { isolationColor, isolationOpacity, selectionColor, highlightColor } = options;
        this._isolationColor = this.buildIsolationColor(isolationColor, isolationOpacity);
        this._selectionColor = new Color(selectionColor);
        this._highlightColor = new Color(highlightColor);
        this.globalMaterial = this.buildGlobalMaterial();
    }
    destroy() {
        this._materials.forEach(v => v.dispose());
        this._materials = null;
        this.globalMaterial.dispose();
        this.globalMaterial = null;
    }
    refreshMeshColors(mesh) {
        const initialRgbRmo = ColorRgbRmo.getFromMesh(mesh);
        if (!mesh.userData.isolated) {
            ColorRgbRmo.deleteFromMesh(mesh);
        }
        const baseRgbRmo = ColorRgbRmo.getFromMesh(mesh);
        let newRgbRmo;
        if (mesh.userData.highlighted) {
            newRgbRmo = new ColorRgbRmo(this._highlightColor.r, this._highlightColor.g, this._highlightColor.b, baseRgbRmo.roughness, baseRgbRmo.metalness, baseRgbRmo.opacity);
        }
        else if (mesh.userData.selected) {
            newRgbRmo = new ColorRgbRmo(this._selectionColor.r, this._selectionColor.g, this._selectionColor.b, baseRgbRmo.roughness, baseRgbRmo.metalness, baseRgbRmo.opacity);
        }
        else if (mesh.userData.isolated) {
            newRgbRmo = this._isolationColor;
        }
        else {
            newRgbRmo = baseRgbRmo;
        }
        ColorRgbRmo.setToMesh(mesh, newRgbRmo);
        return {
            rgbRmo: newRgbRmo,
            opacityChanged: newRgbRmo.opacity !== initialRgbRmo.opacity,
        };
    }
    getMaterial(rgbRmo) {
        const key = rgbRmo.toString();
        if (this._materials.has(key)) {
            return this._materials.get(key);
        }
        const material = this.buildMaterial(rgbRmo);
        this._materials.set(key, material);
        return material;
    }
    buildIsolationColor(hex, opacity) {
        const isolationColor = new Color(hex);
        const isolationColorRgbRmo = new ColorRgbRmo(isolationColor.r, isolationColor.g, isolationColor.b, 1, 0, opacity);
        return isolationColorRgbRmo;
    }
    buildGlobalMaterial() {
        const material = new MeshPhysicalMaterial({
            vertexColors: true,
            flatShading: true,
            blending: NormalBlending,
            side: DoubleSide,
            transparent: true,
        });
        material.onBeforeCompile = shader => {
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
        return material;
    }
    buildMaterial(rgbRmo) {
        const material = new MeshPhysicalMaterial({
            blending: NormalBlending,
            side: DoubleSide,
            flatShading: true,
            color: new Color(rgbRmo.r, rgbRmo.g, rgbRmo.b),
            transparent: rgbRmo.opacity !== 1,
            roughness: rgbRmo.roughness,
            metalness: rgbRmo.metalness,
            opacity: rgbRmo.opacity,
        });
        return material;
    }
}

class PickingScene {
    constructor() {
        this._lastPickingColor = 0;
        this._materials = [];
        this._releasedMaterials = [];
        this._pickingMeshById = new Map();
        this._sourceMeshByPickingColor = new Map();
        const target = new WebGLRenderTarget(1, 1);
        const scene = new Scene();
        scene.background = new Color(0);
        const cameraLight = new DirectionalLight(0xFFFFFF, 1);
        cameraLight.position.set(-1, 2, 4);
        this._scene = scene;
        this._target = target;
        this._cameraLight = cameraLight;
    }
    destroy() {
        this._materials.forEach(x => x.dispose());
        this._materials = null;
        this._target.dispose();
        this._target = null;
    }
    add(sourceMesh) {
        const pickingMeshMaterial = this.getMaterial();
        const colorString = pickingMeshMaterial.color.getHex().toString(16);
        const pickingMesh = new Mesh(sourceMesh.geometry, pickingMeshMaterial);
        pickingMesh.userData.originalUuid = sourceMesh.uuid;
        pickingMesh.userData.color = colorString;
        pickingMesh.position.copy(sourceMesh.position);
        pickingMesh.rotation.copy(sourceMesh.rotation);
        pickingMesh.scale.copy(sourceMesh.scale);
        this._scene.add(pickingMesh);
        this._pickingMeshById.set(sourceMesh.uuid, pickingMesh);
        this._sourceMeshByPickingColor.set(colorString, sourceMesh);
    }
    remove(sourceMesh) {
        const pickingMesh = this._pickingMeshById.get(sourceMesh.uuid);
        if (pickingMesh) {
            this._scene.remove(pickingMesh);
            this._pickingMeshById.delete(sourceMesh.uuid);
            this._sourceMeshByPickingColor.delete(pickingMesh.userData.color);
            this.releaseMaterial(pickingMesh.material);
        }
    }
    getMeshAt(camera, renderer, clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (clientX - rect.left) * renderer.domElement.width / rect.width;
        const y = (clientY - rect.top) * renderer.domElement.height / rect.height;
        const pixelRatio = renderer.getPixelRatio();
        camera.setViewOffset(renderer.getContext().drawingBufferWidth, renderer.getContext().drawingBufferHeight, x * pixelRatio || 0, y * pixelRatio || 0, 1, 1);
        camera.add(this._cameraLight);
        renderer.setRenderTarget(this._target);
        renderer.render(this._scene, camera);
        renderer.setRenderTarget(null);
        camera.clearViewOffset();
        camera.remove(this._cameraLight);
        const pixelBuffer = new Uint8Array(4);
        renderer.readRenderTargetPixels(this._target, 0, 0, 1, 1, pixelBuffer);
        const hex = ((pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2])).toString(16);
        const mesh = this._sourceMeshByPickingColor.get(hex);
        return mesh;
    }
    nextPickingColor() {
        if (this._lastPickingColor === 16777215) {
            this._lastPickingColor = 0;
        }
        return ++this._lastPickingColor;
    }
    getMaterial() {
        if (this._releasedMaterials.length) {
            return this._releasedMaterials.pop();
        }
        const color = new Color(this.nextPickingColor());
        const material = new MeshStandardMaterial({
            color: color,
            emissive: color,
            flatShading: true,
            blending: NoBlending,
            side: DoubleSide,
            roughness: 1,
            metalness: 0,
        });
        this._materials.push(material);
        return material;
    }
    releaseMaterial(material) {
        this._releasedMaterials.push(material);
    }
}

class CameraControls {
    constructor(rendererCanvas, changeCallback) {
        const camera = new PerspectiveCamera(75, 1, 1, 10000);
        const orbitControls = new OrbitControls(camera, rendererCanvas);
        orbitControls.addEventListener("change", changeCallback);
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        orbitControls.update();
        this._camera = camera;
        this._orbitControls = orbitControls;
    }
    get camera() {
        return this._camera;
    }
    destroy() {
        this._orbitControls.dispose();
    }
    resize(width, height) {
        if (this._camera) {
            this._camera.aspect = width / height;
            this._camera.updateProjectionMatrix();
        }
    }
    focusCameraOnObjects(objects, offset = 1.2) {
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
}

class GltfViewerOptions {
    constructor(item = null) {
        this.dracoDecoderEnabled = true;
        this.dracoDecoderPath = "/assets/draco/";
        this.highlightingEnabled = true;
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
        this.meshMergeType = null;
        if (item != null) {
            Object.assign(this, item);
        }
    }
}

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class GltfViewer {
    constructor(containerId, options) {
        this._loadingStateChange = new BehaviorSubject(false);
        this._modelLoadingStart = new Subject();
        this._modelLoadingEnd = new Subject();
        this._modelLoadingProgress = new Subject();
        this._openedModelsChange = new BehaviorSubject([]);
        this._selectionChange = new BehaviorSubject(new Set());
        this._manualSelectionChange = new Subject();
        this._subscriptions = [];
        this._lights = [];
        this._renderGeometries = [];
        this._renderGeometryIndexBySourceMesh = new Map();
        this._sourceMeshesByRenderGeometryIndex = new Map();
        this._sourceMeshesNeedColorUpdate = new Set();
        this._renderGeometryIndicesNeedSort = new Set();
        this._renderMeshBySourceMesh = new Map();
        this._pointerEventHelper = PointerEventHelper.default;
        this._queuedColoring = null;
        this._queuedSelection = null;
        this._highlightedMesh = null;
        this._selectedMeshes = [];
        this._isolatedMeshes = [];
        this._coloredMeshes = [];
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
                this.isolateSelectedMeshes();
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
            }, 30);
        };
        this._container = document.getElementById(containerId);
        if (!this._container) {
            throw new Error("Container not found!");
        }
        const viewerOptions = new GltfViewerOptions(options);
        this.initObservables();
        this._pickingScene = new PickingScene();
        this._colorRgbRmoUtils = new ColorRgbRmoUtils(viewerOptions);
        this.initLights(viewerOptions);
        this.initLoader(viewerOptions);
        this.initRenderer(viewerOptions);
        this._cameraControls = new CameraControls(this._renderer.domElement, () => this.render());
        this._containerResizeSensor = new ResizeSensor(this._container, () => {
            const { width, height } = this._container.getBoundingClientRect();
            this._cameraControls.resize(width, height);
            this.resizeRenderer(width, height);
        });
        this.addCanvasEventListeners(viewerOptions);
        this.render();
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        (_a = this._containerResizeSensor) === null || _a === void 0 ? void 0 : _a.detach();
        this._containerResizeSensor = null;
        (_b = this._cameraControls) === null || _b === void 0 ? void 0 : _b.destroy();
        this._cameraControls = null;
        (_c = this._pickingScene) === null || _c === void 0 ? void 0 : _c.destroy();
        this._pickingScene = null;
        (_d = this._colorRgbRmoUtils) === null || _d === void 0 ? void 0 : _d.destroy();
        this._colorRgbRmoUtils = null;
        (_e = this._loadedMeshes) === null || _e === void 0 ? void 0 : _e.forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        this._loadedMeshes = null;
        (_f = this._renderGeometries) === null || _f === void 0 ? void 0 : _f.forEach(x => x.geometry.dispose());
        this._renderGeometries = null;
        this._renderScene = null;
        (_g = this._renderer) === null || _g === void 0 ? void 0 : _g.dispose();
        (_j = (_h = this._loader) === null || _h === void 0 ? void 0 : _h.dracoLoader) === null || _j === void 0 ? void 0 : _j.dispose();
    }
    openModelsAsync(modelInfos) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(modelInfos === null || modelInfos === void 0 ? void 0 : modelInfos.length)) {
                return [];
            }
            const promises = [];
            modelInfos.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                    const { url, guid, name } = x;
                    const result = !this._loadedModelsByGuid.has(guid)
                        ? yield this.loadModel(url, guid, name)
                        : { url, guid };
                    resultSubject.next(result);
                    resultSubject.complete();
                }));
                promises.push(resultSubject.pipe(first()).toPromise());
            });
            this.processLoadingQueueAsync();
            const overallResult = yield Promise.all(promises);
            return overallResult;
        });
    }
    ;
    closeModelsAsync(modelGuids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length)) {
                return;
            }
            const promises = [];
            modelGuids.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                    this.removeModelFromLoaded(x);
                    resultSubject.next(true);
                    resultSubject.complete();
                }));
                promises.push(resultSubject.pipe(first()).toPromise());
            });
            this.processLoadingQueueAsync();
            yield Promise.all(promises);
        });
    }
    ;
    colorItems(coloringInfos) {
        if (this._loadingInProgress) {
            this._queuedColoring = coloringInfos;
            return;
        }
        this.resetSelectionAndColorMeshes(coloringInfos);
    }
    selectItems(ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loadingInProgress) {
            this._queuedSelection = { ids, isolate: false };
            return;
        }
        this.findAndSelectMeshes(ids, false);
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
        this.findAndSelectMeshes(ids, true);
    }
    ;
    getOpenedModels() {
        return this._openedModelsChange.getValue();
    }
    getSelectedItems() {
        return this._selectionChange.getValue();
    }
    initObservables() {
        this.loadingStateChange$ = this._loadingStateChange.asObservable();
        this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
        this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
        this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
        this.openedModelsChange$ = this._openedModelsChange.asObservable();
        this.selectionChange$ = this._selectionChange.asObservable();
        this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
    }
    closeSubjects() {
        this._loadingStateChange.complete();
        this._modelLoadingStart.complete();
        this._modelLoadingProgress.complete();
        this._modelLoadingEnd.complete();
        this._openedModelsChange.complete();
        this._selectionChange.complete();
        this._manualSelectionChange.complete();
    }
    addCanvasEventListeners(options) {
        const { highlightingEnabled } = options;
        this._renderer.domElement.addEventListener("pointerdown", this._onCanvasPointerDown);
        this._renderer.domElement.addEventListener("pointerup", this._onCanvasPointerUp);
        if (highlightingEnabled) {
            this._renderer.domElement.addEventListener("mousemove", this._onCanvasMouseMove);
        }
    }
    initLights(options) {
        if (options.ambientLight) {
            const ambientLight = new AmbientLight(0x222222, options.physicalLights
                ? options.ambientLightIntensity * Math.PI
                : options.ambientLightIntensity);
            this._lights.push(ambientLight);
        }
        if (options.hemiLight) {
            const hemiLight = new HemisphereLight(0xffffbb, 0x080820, options.physicalLights
                ? options.hemiLightIntensity * Math.PI
                : options.hemiLightIntensity);
            hemiLight.position.set(0, 2000, 0);
            this._lights.push(hemiLight);
        }
        if (options.dirLight) {
            const dirLight = new DirectionalLight(0xffffff, options.physicalLights
                ? options.dirLightIntensity * Math.PI
                : options.dirLightIntensity);
            dirLight.position.set(-2, 10, 2);
            this._lights.push(dirLight);
        }
    }
    initRenderer(options) {
        const { useAntialiasing, physicalLights, meshMergeType } = options;
        const renderer = new WebGLRenderer({
            alpha: true,
            antialias: useAntialiasing,
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = sRGBEncoding;
        renderer.physicallyCorrectLights = physicalLights;
        renderer.toneMapping = NoToneMapping;
        this._container.append(renderer.domElement);
        this._renderer = renderer;
        this._renderMeshMergeType = meshMergeType;
    }
    resizeRenderer(width, height) {
        if (this._renderer) {
            this._renderer.setSize(width, height, false);
            this.render();
        }
    }
    updateRenderSceneAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            this._renderScene = null;
            const scene = new Scene();
            scene.add(...this._lights);
            this._renderGeometries.forEach(x => x.geometry.dispose());
            this._renderGeometries.length = 0;
            this._renderGeometryIndexBySourceMesh.clear();
            this._sourceMeshesByRenderGeometryIndex.clear();
            this._renderMeshBySourceMesh.clear();
            this._renderGeometryIndicesNeedSort.clear();
            if (this._renderMeshMergeType) {
                const grouppedMeshes = yield this.groupModelMeshesByMergeType(this._loadedMeshesArray, this._loadedModelsArray, this._renderMeshMergeType);
                for (const meshes of grouppedMeshes) {
                    if (meshes.length) {
                        const geometry = yield this.buildRenderGeometryAsync(meshes);
                        this._renderGeometries.push(geometry);
                        const i = this._renderGeometries.length - 1;
                        this._sourceMeshesByRenderGeometryIndex.set(i, meshes);
                        this._renderGeometryIndicesNeedSort.add(i);
                        meshes.forEach(x => {
                            this._renderGeometryIndexBySourceMesh.set(x, i);
                        });
                    }
                }
                this._renderGeometries.forEach(x => {
                    const mesh = new Mesh(x.geometry, this._colorRgbRmoUtils.globalMaterial);
                    scene.add(mesh);
                });
            }
            else {
                this._loadedMeshesArray.forEach(sourceMesh => {
                    const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
                    const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
                    const renderMesh = new Mesh(sourceMesh.geometry, material);
                    renderMesh.applyMatrix4(sourceMesh.matrix);
                    this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
                    scene.add(renderMesh);
                });
            }
            this._renderScene = scene;
            this.render(this._loadedMeshesArray.length ? [this._renderScene] : null);
        });
    }
    groupModelMeshesByMergeType(meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
            let grouppedMeshes;
            switch (meshMergeType) {
                case "scene":
                    grouppedMeshes = [meshes];
                    break;
                case "model_uncapped":
                    grouppedMeshes = models.map(x => x.meshes).filter(x => x.length);
                    break;
                case "model_capped":
                    grouppedMeshes = [];
                    const chunkSize = 1000;
                    models.map(x => x.meshes).filter(x => x.length).forEach(x => {
                        if (x.length <= chunkSize) {
                            grouppedMeshes.push(x);
                        }
                        else {
                            for (let i = 0; i < x.length; i += chunkSize) {
                                const chunk = x.slice(i, i + chunkSize);
                                grouppedMeshes.push(chunk);
                            }
                        }
                    });
                    break;
                default:
                    grouppedMeshes = [];
            }
            return grouppedMeshes;
        });
    }
    buildRenderGeometryAsync(meshes) {
        return __awaiter(this, void 0, void 0, function* () {
            let positionsLen = 0;
            let indicesLen = 0;
            meshes.forEach(x => {
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
            const indicesBySourceMesh = new Map();
            let positionsOffset = 0;
            let indicesOffset = 0;
            const chunkSize = 100;
            const processChunk = (chunk) => {
                chunk.forEach(x => {
                    const geometry = x.geometry
                        .clone()
                        .applyMatrix4(x.matrix);
                    const positions = geometry.getAttribute("position").array;
                    const indices = geometry.getIndex().array;
                    const meshIndices = new Uint32Array(indices.length);
                    indicesBySourceMesh.set(x, meshIndices);
                    for (let i = 0; i < indices.length; i++) {
                        const index = indices[i] + positionsOffset;
                        indexBuffer.setX(indicesOffset++, index);
                        meshIndices[i] = index;
                    }
                    for (let i = 0; i < positions.length;) {
                        const rgbrmo = ColorRgbRmo.getFromMesh(x);
                        colorBuffer.setXYZ(positionsOffset, rgbrmo.r, rgbrmo.g, rgbrmo.b);
                        rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughness, rgbrmo.metalness, rgbrmo.opacity);
                        positionBuffer.setXYZ(positionsOffset++, positions[i++], positions[i++], positions[i++]);
                    }
                    geometry.dispose();
                });
            };
            for (let i = 0; i < meshes.length; i += chunkSize) {
                yield new Promise((resolve) => {
                    setTimeout(() => {
                        processChunk(meshes.slice(i, i + chunkSize));
                        resolve();
                    }, 0);
                });
            }
            const renderGeometry = new BufferGeometry();
            renderGeometry.setIndex(indexBuffer);
            renderGeometry.setAttribute("color", colorBuffer);
            renderGeometry.setAttribute("rmo", rmoBuffer);
            renderGeometry.setAttribute("position", positionBuffer);
            return {
                geometry: renderGeometry,
                positions: positionBuffer,
                colors: colorBuffer,
                rmos: rmoBuffer,
                indices: indexBuffer,
                indicesBySourceMesh,
            };
        });
    }
    updateMeshRenderMaterials() {
        this._sourceMeshesNeedColorUpdate.forEach(sourceMesh => {
            const { rgbRmo } = this._colorRgbRmoUtils.refreshMeshColors(sourceMesh);
            const material = this._colorRgbRmoUtils.getMaterial(rgbRmo);
            const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
            renderMesh.material = material;
        });
    }
    sortRenderGeometriesIndicesByOpacity() {
        this._renderGeometryIndicesNeedSort.forEach(i => {
            const meshes = this._sourceMeshesByRenderGeometryIndex.get(i);
            const opaqueMeshes = [];
            const transparentMeshes = [];
            meshes.forEach(x => {
                if (ColorRgbRmo.getFromMesh(x).opacity === 1) {
                    opaqueMeshes.push(x);
                }
                else {
                    transparentMeshes.push(x);
                }
            });
            const { indices, indicesBySourceMesh } = this._renderGeometries[i];
            let currentIndex = 0;
            opaqueMeshes.forEach(mesh => {
                indicesBySourceMesh.get(mesh).forEach(value => {
                    indices.setX(currentIndex++, value);
                });
            });
            transparentMeshes.forEach(mesh => {
                indicesBySourceMesh.get(mesh).forEach(value => {
                    indices.setX(currentIndex++, value);
                });
            });
            indices.needsUpdate = true;
        });
    }
    updateRenderGeometriesColors() {
        const meshesByRgIndex = new Map();
        this._sourceMeshesNeedColorUpdate.forEach(mesh => {
            const rgIndex = this._renderGeometryIndexBySourceMesh.get(mesh);
            if (meshesByRgIndex.has(rgIndex)) {
                meshesByRgIndex.get(rgIndex).push(mesh);
            }
            else {
                meshesByRgIndex.set(rgIndex, [mesh]);
            }
        });
        meshesByRgIndex.forEach((v, k) => {
            this.updateRenderGeometryColors(k, v);
        });
    }
    updateRenderGeometryColors(rgIndex, meshes) {
        const { colors, rmos, indicesBySourceMesh } = this._renderGeometries[rgIndex];
        let anyMeshOpacityChanged = false;
        meshes.forEach(mesh => {
            const { rgbRmo, opacityChanged } = this._colorRgbRmoUtils
                .refreshMeshColors(mesh);
            indicesBySourceMesh.get(mesh).forEach(i => {
                colors.setXYZ(i, rgbRmo.r, rgbRmo.g, rgbRmo.b);
                rmos.setXYZ(i, rgbRmo.roughness, rgbRmo.metalness, rgbRmo.opacity);
            });
            if (!anyMeshOpacityChanged && opacityChanged) {
                anyMeshOpacityChanged = true;
            }
        });
        colors.needsUpdate = true;
        rmos.needsUpdate = true;
        if (anyMeshOpacityChanged) {
            this._renderGeometryIndicesNeedSort.add(rgIndex);
        }
    }
    prepareToRender(focusObjects = null) {
        if (focusObjects === null || focusObjects === void 0 ? void 0 : focusObjects.length) {
            this._cameraControls.focusCameraOnObjects(focusObjects);
        }
        if (this._sourceMeshesNeedColorUpdate.size) {
            if (this._renderMeshMergeType) {
                this.updateRenderGeometriesColors();
            }
            else {
                this.updateMeshRenderMaterials();
            }
            this._sourceMeshesNeedColorUpdate.clear();
        }
        if (this._renderGeometryIndicesNeedSort.size) {
            this.sortRenderGeometriesIndicesByOpacity();
            this._renderGeometryIndicesNeedSort.clear();
        }
    }
    render(focusObjects = null) {
        this.prepareToRender(focusObjects);
        requestAnimationFrame(() => {
            if (this._renderScene) {
                this._renderer.render(this._renderScene, this._cameraControls.camera);
            }
        });
    }
    initLoader(options) {
        const { dracoDecoderEnabled, dracoDecoderPath } = options;
        const loader = new GLTFLoader();
        if (dracoDecoderEnabled) {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(dracoDecoderPath);
            dracoLoader.preload();
            loader.setDRACOLoader(dracoLoader);
        }
        this._loader = loader;
        this.processLoadingQueueAsync();
    }
    processLoadingQueueAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._renderer || !this._loader || this._loadingInProgress) {
                return;
            }
            this._loadingInProgress = true;
            this._loadingStateChange.next(true);
            while (this._loadingQueue.length > 0) {
                const action = this._loadingQueue.shift();
                yield action();
            }
            this.runQueuedColoring();
            this.runQueuedSelection();
            yield this.updateRenderSceneAsync();
            this._loadingStateChange.next(false);
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
            if (x instanceof Mesh
                && x.geometry instanceof BufferGeometry
                && x.material instanceof MeshStandardMaterial) {
                const id = `${modelGuid}|${x.name}`;
                x.userData.id = id;
                x.userData.modelGuid = modelGuid;
                this._pickingScene.add(x);
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
        const modelInfo = { name, meshes, handles };
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
            this._pickingScene.remove(x);
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
        this._loadedMeshesArray = [...this._loadedMeshes];
        this._loadedModelsArray = [...this._loadedModels];
    }
    emitOpenedModelsChanged() {
        const modelOpenedInfos = [];
        for (const [modelGuid, model] of this._loadedModelsByGuid) {
            modelOpenedInfos.push({ guid: modelGuid, name: model.name, handles: model.handles });
        }
        this._openedModelsChange.next(modelOpenedInfos);
    }
    runQueuedColoring() {
        if (this._queuedColoring) {
            this.resetSelectionAndColorMeshes(this._queuedColoring);
        }
    }
    resetSelectionAndColorMeshes(coloringInfos) {
        this.removeIsolation();
        this.removeSelection();
        this.colorMeshes(coloringInfos);
    }
    colorMeshes(coloringInfos) {
        this.removeColoring();
        if (coloringInfos === null || coloringInfos === void 0 ? void 0 : coloringInfos.length) {
            for (const info of coloringInfos) {
                const color = new Color(info.color);
                const customColor = new ColorRgbRmo(color.r, color.g, color.b, 1, 0, info.opacity);
                info.ids.forEach(x => {
                    const meshes = this._loadedMeshesById.get(x);
                    if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                        meshes.forEach(mesh => {
                            mesh.userData.colored = true;
                            ColorRgbRmo.setCustomToMesh(mesh, customColor);
                            this._sourceMeshesNeedColorUpdate.add(mesh);
                            this._coloredMeshes.push(mesh);
                        });
                    }
                });
            }
        }
        this.render();
    }
    removeColoring() {
        for (const mesh of this._coloredMeshes) {
            mesh.userData.colored = undefined;
            ColorRgbRmo.deleteFromMesh(mesh, true);
            this._sourceMeshesNeedColorUpdate.add(mesh);
        }
        this._coloredMeshes.length = 0;
    }
    getMeshAt(clientX, clientY) {
        return this._pickingScene
            ? this._pickingScene.getMeshAt(this._cameraControls.camera, this._renderer, clientX, clientY)
            : null;
    }
    runQueuedSelection() {
        if (this._queuedSelection) {
            const { ids, isolate } = this._queuedSelection;
            this.findAndSelectMeshes(ids, isolate);
        }
    }
    findAndSelectMeshes(ids, isolate) {
        const { found } = this.findMeshesByIds(new Set(ids));
        if (found.length) {
            this.selectMeshes(found, false, isolate);
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
            mesh.userData.selected = undefined;
            this._sourceMeshesNeedColorUpdate.add(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    removeIsolation() {
        for (const mesh of this._isolatedMeshes) {
            mesh.userData.isolated = undefined;
            this._sourceMeshesNeedColorUpdate.add(mesh);
        }
        this._isolatedMeshes.length = 0;
    }
    selectMeshAtPoint(x, y, keepPreviousSelection) {
        const mesh = this.getMeshAt(x, y);
        if (!mesh) {
            this.selectMeshes([], true, false);
            return;
        }
        if (keepPreviousSelection) {
            if (mesh.userData.selected) {
                this.removeFromSelection(mesh);
            }
            else {
                this.addToSelection(mesh);
            }
        }
        else {
            this.selectMeshes([mesh], true, false);
        }
    }
    addToSelection(mesh) {
        const meshes = [mesh, ...this._selectedMeshes];
        this.selectMeshes(meshes, true, false);
        return true;
    }
    removeFromSelection(mesh) {
        const meshes = this._selectedMeshes.filter(x => x !== mesh);
        this.selectMeshes(meshes, true, false);
        return true;
    }
    selectMeshes(meshes, manual, isolateSelected) {
        this.removeSelection();
        this.removeIsolation();
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.emitSelectionChanged(manual, true);
            return null;
        }
        meshes.forEach(x => {
            x.userData.selected = true;
            this._sourceMeshesNeedColorUpdate.add(x);
        });
        this._selectedMeshes = meshes;
        if (isolateSelected) {
            this.emitSelectionChanged(manual, false);
            this.isolateSelectedMeshes();
        }
        else {
            this.emitSelectionChanged(manual, true);
        }
    }
    isolateSelectedMeshes() {
        if (!this._selectedMeshes.length) {
            return;
        }
        this._loadedMeshesArray.forEach(x => {
            if (!x.userData.selected) {
                x.userData.isolated = true;
                this._sourceMeshesNeedColorUpdate.add(x);
                this._isolatedMeshes.push(x);
            }
        });
        this.render(this._selectedMeshes);
    }
    emitSelectionChanged(manual, render) {
        if (render) {
            this.render(manual ? null : this._selectedMeshes);
        }
        const ids = new Set();
        this._selectedMeshes.forEach(x => ids.add(x.userData.id));
        this._selectionChange.next(ids);
        if (manual) {
            this._manualSelectionChange.next(ids);
        }
    }
    highlightMeshAtPoint(x, y) {
        const mesh = this.getMeshAt(x, y);
        this.highlightItem(mesh);
    }
    highlightItem(mesh) {
        if (mesh === this._highlightedMesh) {
            return;
        }
        this.removeHighlighting();
        if (mesh) {
            mesh.userData.highlighted = true;
            this._sourceMeshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = mesh;
        }
        this.render();
    }
    removeHighlighting() {
        if (this._highlightedMesh) {
            const mesh = this._highlightedMesh;
            mesh.userData.highlighted = undefined;
            this._sourceMeshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = null;
        }
    }
}

export { GltfViewer, GltfViewerOptions };
