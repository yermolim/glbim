/**
 * MIT License
 *
 * Copyright (c) 2020-present yermolim (Volodymyr Yermolenko)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE
 */

import { BehaviorSubject, Subject, AsyncSubject, firstValueFrom } from 'rxjs';
import { Matrix4, Mesh, BufferGeometry, MeshStandardMaterial, MOUSE, TOUCH, Box3, Vector3, Euler, Quaternion, PerspectiveCamera, MeshPhysicalMaterial, NormalBlending, DoubleSide, Color, MeshPhongMaterial, MeshBasicMaterial, NoBlending, LineBasicMaterial, SpriteMaterial, CanvasTexture, Vector4, Object3D, Vector2, Raycaster, OrthographicCamera, Sprite, AmbientLight, HemisphereLight, DirectionalLight, InstancedBufferAttribute, Scene, Uint32BufferAttribute, Uint8BufferAttribute, Float32BufferAttribute, WebGLRenderer, sRGBEncoding, NoToneMapping, WebGLRenderTarget, Triangle } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull';

class GltfViewerOptions {
    constructor(item = null) {
        this.useAntialiasing = true;
        this.usePhysicalLights = true;
        this.ambientLightIntensity = 1;
        this.hemiLightIntensity = 0.4;
        this.dirLightIntensity = 0.6;
        this.highlightingEnabled = true;
        this.highlightColor = 0xFFFF00;
        this.selectionColor = 0xFF0000;
        this.isolationColor = 0x555555;
        this.isolationOpacity = 0.2;
        this.meshMergeType = null;
        this.fastRenderType = null;
        this.axesHelperEnabled = true;
        this.axesHelperPlacement = "top-right";
        this.axesHelperSize = 128;
        this.basePoint = null;
        this.selectionAutoFocusEnabled = true;
        this.cameraControlsDisabled = false;
        if (item != null) {
            Object.assign(this, item);
        }
    }
}

class PointerEventHelper {
    static get default() {
        return {
            downX: null,
            downY: null,
            maxDiff: 10,
            mouseMoveTimer: null,
            waitForDouble: false,
            touch: false,
            allowArea: true,
        };
    }
}
class Vec4 {
    constructor(x, y, z, w = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
    static getDistance(start, end) {
        const distX = end.x - start.x;
        const distY = end.y - start.y;
        const distZ = end.z - start.z;
        const distW = Math.sqrt(distX * distX + distY * distY + distZ * distZ);
        return new Vec4(distX, distY, distZ, distW);
    }
}
class Vec4DoubleCS {
    constructor(isZup = false, x = 0, y = 0, z = 0, w = 0) {
        this._x = x;
        this._w = w;
        if (isZup) {
            this._y = z;
            this._z = -y;
        }
        else {
            this._y = y;
            this._z = z;
        }
    }
    get x() {
        return this._x;
    }
    get w() {
        return this._w;
    }
    get y_Yup() {
        return this._y;
    }
    get z_Yup() {
        return this._z;
    }
    get y_Zup() {
        return -this._z;
    }
    get z_Zup() {
        return this._y;
    }
    static fromVector3(vec, isZup = false) {
        return vec
            ? new Vec4DoubleCS(isZup, vec.x, vec.y, vec.z)
            : new Vec4DoubleCS(isZup);
    }
    toVec4(isZup = false) {
        return !isZup
            ? new Vec4(this._x, this._y, this._z, this._w)
            : new Vec4(this._x, -this._z, this._y, this._w);
    }
    equals(other) {
        if (!other) {
            return false;
        }
        return this._x === other._x
            && this._y === other._y
            && this._z === other._z
            && this._w === other._w;
    }
}
class Distance {
    constructor(start, end) {
        this.start = new Vec4(start.x, start.y, start.z);
        this.end = new Vec4(end.x, end.y, end.z);
        this.distance = Vec4.getDistance(this.start, this.end);
    }
}

class SelectionFrame {
    constructor() {
        const frame = document.createElement("div");
        frame.style.position = "absolute";
        frame.style.borderStyle = "dashed";
        frame.style.borderWidth = "2px";
        frame.style.borderColor = "dodgerblue";
        frame.style.background = "rgba(30, 144, 255, 0.1)";
        frame.style.pointerEvents = "none";
        this._element = frame;
    }
    destroy() {
        this._element.remove();
        this._element = null;
    }
    show(container, x1, y1, x2, y2) {
        if (!this._element) {
            return;
        }
        const xMin = Math.min(x1, x2);
        const yMin = Math.min(y1, y2);
        const xMax = Math.max(x1, x2);
        const yMax = Math.max(y1, y2);
        const { top, left } = container.getBoundingClientRect();
        this._element.style.left = xMin - left + "px";
        this._element.style.top = yMin - top + "px";
        this._element.style.width = xMax - xMin + "px";
        this._element.style.height = yMax - yMin + "px";
        container.append(this._element);
    }
    hide() {
        this._element.remove();
    }
}

var __awaiter$4 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class ModelLoaderService {
    constructor(dracoDecoderPath, basePoint = null) {
        this._loadingStateChange = new BehaviorSubject(false);
        this._modelLoadingStart = new Subject();
        this._modelLoadingEnd = new Subject();
        this._modelLoadingProgress = new Subject();
        this._modelsOpenedChange = new BehaviorSubject([]);
        this._loadingInProgress = false;
        this._loadingQueue = [];
        this._loadedModels = new Set();
        this._loadedModelsByGuid = new Map();
        this._loadedMeshes = new Set();
        this._loadedMeshesById = new Map();
        this._loadedModelsArray = [];
        this._loadedMeshesArray = [];
        this._onQueueLoaded = new Set();
        this._onModelLoaded = new Set();
        this._onModelUnloaded = new Set();
        this._onMeshLoaded = new Set();
        this._onMeshUnloaded = new Set();
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
    get loadedModelsArray() {
        return this._loadedModelsArray;
    }
    get loadedMeshesArray() {
        return this._loadedMeshesArray;
    }
    get openedModelInfos() {
        return this._modelsOpenedChange.getValue();
    }
    get loadingInProgress() {
        return this._loadingInProgress;
    }
    destroy() {
        var _a, _b;
        this._loadingStateChange.complete();
        this._modelLoadingStart.complete();
        this._modelLoadingProgress.complete();
        this._modelLoadingEnd.complete();
        this._modelsOpenedChange.complete();
        (_a = this._loadedMeshes) === null || _a === void 0 ? void 0 : _a.forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        (_b = this._loader.dracoLoader) === null || _b === void 0 ? void 0 : _b.dispose();
        this._loader = null;
    }
    addQueueCallback(type, cb) {
        switch (type) {
            case "queue-loaded":
                this._onQueueLoaded.add(cb);
                return;
        }
    }
    addModelCallback(type, cb) {
        switch (type) {
            case "model-loaded":
                this._onModelLoaded.add(cb);
                return;
            case "model-unloaded":
                this._onModelUnloaded.add(cb);
                return;
        }
    }
    addMeshCallback(type, cb) {
        switch (type) {
            case "mesh-loaded":
                this._onMeshLoaded.add(cb);
                return;
            case "mesh-unloaded":
                this._onMeshUnloaded.add(cb);
                return;
        }
    }
    removeCallback(type, cb) {
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
    openModelsAsync(modelInfos) {
        return __awaiter$4(this, void 0, void 0, function* () {
            if (!(modelInfos === null || modelInfos === void 0 ? void 0 : modelInfos.length)) {
                return [];
            }
            const promises = [];
            modelInfos.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$4(this, void 0, void 0, function* () {
                    const { url, guid, name } = x;
                    const result = !this._loadedModelsByGuid.has(guid)
                        ? yield this.loadModel(url, guid, name)
                        : { url, guid };
                    resultSubject.next(result);
                    resultSubject.complete();
                }));
                promises.push(firstValueFrom(resultSubject));
            });
            this.processLoadingQueueAsync();
            const overallResult = yield Promise.all(promises);
            return overallResult;
        });
    }
    ;
    closeModelsAsync(modelGuids) {
        return __awaiter$4(this, void 0, void 0, function* () {
            if (!(modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length)) {
                return;
            }
            const promises = [];
            modelGuids.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$4(this, void 0, void 0, function* () {
                    this.removeModelFromLoaded(x);
                    resultSubject.next(true);
                    resultSubject.complete();
                }));
                promises.push(firstValueFrom(resultSubject));
            });
            this.processLoadingQueueAsync();
            yield Promise.all(promises);
        });
    }
    ;
    closeAllModelsAsync() {
        return __awaiter$4(this, void 0, void 0, function* () {
            const loadedGuids = this.openedModelInfos.map(x => x.guid);
            return this.closeModelsAsync(loadedGuids);
        });
    }
    getLoadedMeshesById(id) {
        return this._loadedMeshesById.get(id);
    }
    findMeshesByIds(ids) {
        const found = [];
        const notFound = new Set();
        ids.forEach(x => {
            const meshes = this.getLoadedMeshesById(x);
            if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                found.push(...meshes);
            }
            else {
                notFound.add(x);
            }
        });
        return { found, notFound };
    }
    processLoadingQueueAsync() {
        return __awaiter$4(this, void 0, void 0, function* () {
            if (!this._loader
                || this._loadingInProgress
                || !this._loadingQueue.length) {
                return;
            }
            this._loadingInProgress = true;
            this._loadingStateChange.next(true);
            while (this._loadingQueue.length > 0) {
                const action = this._loadingQueue.shift();
                yield action();
            }
            this.updateModelsDataArrays();
            if (this._onQueueLoaded.size) {
                for (const callback of this._onQueueLoaded) {
                    yield callback();
                }
            }
            this.emitOpenedModelsChanged();
            this._loadingStateChange.next(false);
            this._loadingInProgress = false;
            yield this.processLoadingQueueAsync();
        });
    }
    loadModel(url, guid, name) {
        return __awaiter$4(this, void 0, void 0, function* () {
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
                if (this._wcsToUcsMatrix) {
                    x.position.applyMatrix4(this._wcsToUcsMatrix);
                }
                this._loadedMeshes.add(x);
                if (this._loadedMeshesById.has(id)) {
                    this._loadedMeshesById.get(id).push(x);
                }
                else {
                    this._loadedMeshesById.set(id, [x]);
                }
                meshes.push(x);
                handles.add(x.name);
                if (this._onMeshLoaded.size) {
                    for (const callback of this._onMeshLoaded) {
                        callback(x);
                    }
                }
            }
        });
        const modelInfo = { name, meshes, handles };
        this._loadedModels.add(modelInfo);
        this._loadedModelsByGuid.set(modelGuid, modelInfo);
        if (this._onModelLoaded.size) {
            for (const callback of this._onModelLoaded) {
                callback(modelGuid);
            }
        }
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
            if (this._onMeshUnloaded.size) {
                for (const callback of this._onMeshUnloaded) {
                    callback(x);
                }
            }
            (_a = x.geometry) === null || _a === void 0 ? void 0 : _a.dispose();
        });
        this._loadedModels.delete(modelData);
        this._loadedModelsByGuid.delete(modelGuid);
        if (this._onModelUnloaded.size) {
            for (const callback of this._onModelUnloaded) {
                callback(modelGuid);
            }
        }
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
        this._modelsOpenedChange.next(modelOpenedInfos);
    }
}

class CameraControls extends OrbitControls {
    constructor(camera, domElement) {
        super(camera, domElement);
        this.screenSpacePanning = true;
        this.mouseButtons.LEFT = null;
        this.mouseButtons.MIDDLE = MOUSE.ROTATE;
        this.mouseButtons.RIGHT = MOUSE.PAN;
        this.touches.ONE = TOUCH.ROTATE;
        this.touches.TWO = TOUCH.DOLLY_PAN;
    }
}

class CameraService {
    constructor(container, renderCallback) {
        this._focusBox = new Box3();
        this._rRadius = 0;
        this._rPosFocus = new Vector3();
        this._rPosRelCamTarget = new Vector3();
        this._rPosRelCamTemp = new Vector3();
        this._rEuler = new Euler();
        this._rQcfSource = new Quaternion();
        this._rQcfTarget = new Quaternion();
        this._rQcfTemp = new Quaternion();
        this.onCameraPositionChange = () => {
            this._cameraPositionChanged.next(Vec4DoubleCS.fromVector3(this._camera.position));
            this._renderCb();
        };
        this._renderCb = renderCallback;
        const camera = new PerspectiveCamera(75, 1, 1, 10000);
        camera.position.set(0, 1000, 1000);
        camera.lookAt(0, 0, 0);
        this._cameraPositionChanged = new BehaviorSubject(Vec4DoubleCS.fromVector3(camera.position));
        this.cameraPositionChange$ = this._cameraPositionChanged.asObservable();
        const controls = new CameraControls(camera, container);
        controls.addEventListener("change", this.onCameraPositionChange);
        controls.update();
        this._camera = camera;
        this._controls = controls;
    }
    get camera() {
        return this._camera;
    }
    destroy() {
        this._controls.dispose();
        this._cameraPositionChanged.complete();
    }
    resize(width, height) {
        if (this._camera) {
            this._camera.aspect = width / height;
            this._camera.updateProjectionMatrix();
        }
    }
    rotateToFaceTheAxis(axis, animate, toZUp = true) {
        this.prepareRotation(axis, toZUp);
        this.applyRotation(animate);
    }
    focusCameraOnObjects(objects, offset = 1.2) {
        if (!(objects === null || objects === void 0 ? void 0 : objects.length)) {
            if (!this._focusBox.isEmpty()) {
                this.focusCameraOnBox(this._focusBox, offset);
            }
            return;
        }
        this._focusBox.makeEmpty();
        for (const object of objects) {
            this._focusBox.expandByObject(object);
        }
        this.focusCameraOnBox(this._focusBox, offset);
    }
    enableControls() {
        this._controls.enablePan = true;
        this._controls.enableRotate = true;
        this._controls.enableZoom = true;
    }
    disableControls() {
        this._controls.enablePan = false;
        this._controls.enableRotate = false;
        this._controls.enableZoom = false;
    }
    focusCameraOnBox(box, offset) {
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this._camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / this._camera.aspect;
        const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
        const direction = this._controls.target.clone()
            .sub(this._camera.position)
            .normalize()
            .multiplyScalar(distance);
        this._controls.maxDistance = Math.max(distance * 10, 10000);
        this._controls.target.copy(center);
        this._camera.near = Math.min(distance / 100, 1);
        this._camera.far = Math.max(distance * 100, 10000);
        this._camera.updateProjectionMatrix();
        this._camera.position.copy(center).sub(direction);
        this._controls.update();
    }
    prepareRotation(axis, toZUp) {
        switch (axis) {
            case "x":
                this._rPosRelCamTarget.set(1, 0, 0);
                this._rEuler.set(0, Math.PI * 0.5, 0);
                break;
            case "y":
                if (toZUp) {
                    this._rPosRelCamTarget.set(0, 0, -1);
                    this._rEuler.set(0, Math.PI, 0);
                }
                else {
                    this._rPosRelCamTarget.set(0, 1, 0);
                    this._rEuler.set(Math.PI * -0.5, 0, 0);
                }
                break;
            case "z":
                if (toZUp) {
                    this._rPosRelCamTarget.set(0, 1, 0);
                    this._rEuler.set(Math.PI * -0.5, 0, 0);
                }
                else {
                    this._rPosRelCamTarget.set(0, 0, 1);
                    this._rEuler.set(0, 0, 0);
                }
                break;
            case "-x":
                this._rPosRelCamTarget.set(-1, 0, 0);
                this._rEuler.set(0, Math.PI * -0.5, 0);
                break;
            case "-y":
                if (toZUp) {
                    this._rPosRelCamTarget.set(0, 0, 1);
                    this._rEuler.set(0, 0, 0);
                }
                else {
                    this._rPosRelCamTarget.set(0, -1, 0);
                    this._rEuler.set(Math.PI * 0.5, 0, 0);
                }
                break;
            case "-z":
                if (toZUp) {
                    this._rPosRelCamTarget.set(0, -1, 0);
                    this._rEuler.set(Math.PI * 0.5, 0, 0);
                }
                else {
                    this._rPosRelCamTarget.set(0, 0, -1);
                    this._rEuler.set(0, Math.PI, 0);
                }
                break;
            default:
                return;
        }
        this._rPosFocus.copy(this._controls.target);
        this._rRadius = this._camera.position.distanceTo(this._rPosFocus);
        this._rPosRelCamTarget.multiplyScalar(this._rRadius);
        this._rQcfSource.copy(this._camera.quaternion);
        this._rQcfTarget.setFromEuler(this._rEuler);
    }
    applyRotation(animate) {
        if (!animate) {
            this._camera.position.copy(this._rPosFocus).add(this._rPosRelCamTarget);
            this._camera.quaternion.copy(this._rQcfTarget);
            this.onCameraPositionChange();
        }
        else {
            const rotationSpeed = 2 * Math.PI;
            const totalTime = this._rQcfSource.angleTo(this._rQcfTarget) / rotationSpeed;
            let timeDelta;
            let step;
            const animationStart = performance.now();
            const renderRotationFrame = () => {
                timeDelta = (performance.now() - animationStart) / 1000;
                step = timeDelta / totalTime;
                if (step > 1) {
                    step = 1;
                }
                this._rQcfTemp.copy(this._rQcfSource).slerp(this._rQcfTarget, step);
                this._rPosRelCamTemp.set(0, 0, 1)
                    .applyQuaternion(this._rQcfTemp)
                    .multiplyScalar(this._rRadius);
                this._camera.position.copy(this._rPosFocus)
                    .add(this._rPosRelCamTemp);
                this._camera.quaternion.copy(this._rQcfTemp);
                this.onCameraPositionChange();
                if (this._rQcfTemp.angleTo(this._rQcfTarget)) {
                    window.requestAnimationFrame(() => renderRotationFrame());
                }
            };
            renderRotationFrame();
        }
    }
}

class ColorRgbRmo {
    constructor(r, g, b, roughness, metalness, opacity, byte = false) {
        if (byte) {
            this.r = r / 255;
            this.g = g / 255;
            this.b = b / 255;
            this.roughness = roughness / 255;
            this.metalness = metalness / 255;
            this.opacity = opacity / 255;
        }
        else {
            this.r = r;
            this.g = g;
            this.b = b;
            this.roughness = roughness;
            this.metalness = metalness;
            this.opacity = opacity;
        }
    }
    get rByte() {
        return this.r * 255;
    }
    get gByte() {
        return this.g * 255;
    }
    get bByte() {
        return this.b * 255;
    }
    get roughnessByte() {
        return this.roughness * 255;
    }
    get metalnessByte() {
        return this.metalness * 255;
    }
    get opacityByte() {
        return this.opacity * 255;
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

class MaterialBuilder {
    static buildGlobalMaterial() {
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
    static buildIsolationColor(hex, opacity) {
        const isolationColor = new Color(hex);
        const isolationColorRgbRmo = new ColorRgbRmo(isolationColor.r, isolationColor.g, isolationColor.b, 1, 0, opacity);
        return isolationColorRgbRmo;
    }
    static buildStandardMaterial(rgbRmo) {
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
    static buildPhongMaterial() {
        const material = new MeshPhongMaterial({
            color: 0x808080,
            transparent: false,
            flatShading: true,
            blending: NormalBlending,
            side: DoubleSide,
        });
        return material;
    }
    static buildBasicMaterial(color) {
        return new MeshBasicMaterial({
            color,
            blending: NoBlending,
            side: DoubleSide,
        });
    }
    static buildLineBasicMaterial(color, width) {
        return new LineBasicMaterial({ color, linewidth: width });
    }
    static buildLineMaterial(color, width, dashed) {
        const material = new LineMaterial({
            color,
            linewidth: width,
        });
        if (dashed) {
            material.dashed = true;
            material.dashScale = 0.5;
            material.dashSize = 1;
            material.gapSize = 1;
            material.defines.USE_DASH = "";
            material.needsUpdate = true;
        }
        return material;
    }
    static buildSpriteMaterial(texture) {
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
}

class CanvasTextureBuilder {
    static buildAxisLabelTexture(size, color, text) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 4, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fill();
        if (text) {
            ctx.font = size / 3 + "px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#000000";
            ctx.fillText(text, size / 2, size / 2 - size / 6);
        }
        return new CanvasTexture(canvas);
    }
    static buildSpriteAtlasTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        CanvasTextureBuilder.drawWarningSign(ctx, "gray", true, 64, 0, 0);
        CanvasTextureBuilder.drawWarningSign(ctx, "yellow", true, 64, 64, 0);
        CanvasTextureBuilder.drawWarningSign(ctx, "orange", true, 64, 128, 0);
        CanvasTextureBuilder.drawWarningSign(ctx, "red", true, 64, 192, 0);
        CanvasTextureBuilder.drawWarningSign(ctx, "gray", false, 64, 0, 64);
        CanvasTextureBuilder.drawWarningSign(ctx, "yellow", false, 64, 64, 64);
        CanvasTextureBuilder.drawWarningSign(ctx, "orange", false, 64, 128, 64);
        CanvasTextureBuilder.drawWarningSign(ctx, "red", false, 64, 192, 64);
        CanvasTextureBuilder.drawCameraLogo(ctx, "steelblue", 64, 0, 128);
        CanvasTextureBuilder.drawCameraLogo(ctx, "black", 64, 64, 128);
        const uvMap = new Map();
        uvMap.set("warn_0", new Vector4(0, 0.75, 0.25, 1));
        uvMap.set("warn_1", new Vector4(0.25, 0.75, 0.5, 1));
        uvMap.set("warn_2", new Vector4(0.5, 0.75, 0.75, 1));
        uvMap.set("warn_3", new Vector4(0.75, 0.75, 1, 1));
        uvMap.set("warn_0_selected", new Vector4(0, 0.5, 0.25, 0.75));
        uvMap.set("warn_1_selected", new Vector4(0.25, 0.5, 0.5, 0.75));
        uvMap.set("warn_2_selected", new Vector4(0.5, 0.5, 0.75, 0.75));
        uvMap.set("warn_3_selected", new Vector4(0.75, 0.5, 1, 0.75));
        uvMap.set("photo", new Vector4(0, 0.25, 0.25, 0.5));
        uvMap.set("photo_selected", new Vector4(0.25, 0.25, 0.5, 0.5));
        return {
            texture: new CanvasTexture(canvas),
            uvMap,
        };
    }
    static buildCircleTexture(size, color) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fill();
        return new CanvasTexture(canvas);
    }
    static drawWarningSign(ctx, color, drawInner, size, offsetX, offsetY) {
        ctx.moveTo(offsetX, offsetY);
        ctx.fillStyle = color;
        const outerPath = new Path2D(`
      M ${0.09375 * size + offsetX} ${0.9375 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.0125 * size + offsetX} ${0.796875 * size + offsetY}
      L ${0.41875 * size + offsetX} ${0.07815 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.58046875 * size + offsetX} ${0.078125 * size + offsetY} 
      L ${0.9875 * size + offsetX} ${0.796875 * size + offsetY} 
      A ${0.09375 * size} ${0.09375 * size} 0 0 1 ${0.90625 * size + offsetX} ${0.9375 * size + offsetY} 
      Z`);
        ctx.fill(outerPath);
        if (drawInner) {
            ctx.fillStyle = "white";
            const innerPath = new Path2D(`
        M ${0.1953125 * size + offsetX} ${0.8515625 * size + offsetY}
        A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.134375 * size + offsetX} ${0.74609375 * size + offsetY}
        L ${0.4390625 * size + offsetX} ${0.2109375 * size + offsetY} 
        A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.5609375 * size + offsetX} ${0.2109375 * size + offsetY}
        L ${0.865625 * size + offsetX} ${0.74609375 * size + offsetY}
        A ${0.0703125 * size} ${0.0703125 * size} 0 0 1 ${0.8046875 * size + offsetX} ${0.8515625 * size + offsetY} 
        Z`);
            ctx.fill(innerPath);
        }
        ctx.fillStyle = "black";
        const exclamationPath = new Path2D(`
      M ${0.4375 * size + offsetX} ${0.3515625 * size + offsetY} 
      a ${0.0625 * size} ${0.0625 * size} 0 0 1 ${0.125 * size} 0
      L ${0.53125 * size + offsetX} ${0.625 * size + offsetY} 
      a ${0.0234375 * size} ${0.0234375 * size} 0 0 1 ${-0.046875 * size} 0`);
        ctx.fill(exclamationPath);
        ctx.moveTo(0.5 * size + offsetX, 0.75 * size + offsetY);
        ctx.arc(0.5 * size + offsetX, 0.75 * size + offsetY, 0.0625 * size, 0, 2 * Math.PI);
        ctx.fill();
    }
    static drawCameraLogo(ctx, color, size, offsetX, offsetY) {
        ctx.moveTo(offsetX, offsetY);
        const mainPath = new Path2D(`
      M ${offsetX} ${0.3 * size + offsetY}
      H ${0.05 * size + offsetX}
      V ${0.25 * size + offsetY}
      H ${0.15 * size + offsetX}
      V ${0.30 * size + offsetY}
      H ${0.2 * size + offsetX}
      L ${0.3 * size + offsetX} ${0.15 * size + offsetY}
      H ${0.5 * size + offsetX}
      L ${0.6 * size + offsetX} ${0.3 * size + offsetY}
      H ${0.7 * size + offsetX}
      V ${0.25 * size + offsetY}
      H ${0.9 * size + offsetX}
      V ${0.3 * size + offsetY}
      H ${size + offsetX}
      V ${0.9 * size + offsetY}
      H ${offsetX}
      V ${0.3 * size + offsetY}
    `);
        ctx.fillStyle = color;
        ctx.fill(mainPath);
        const innerPath = new Path2D(`
    	M ${0.7 * size + offsetX} ${0.4 * size + offsetY}
      H ${0.85 * size + offsetX}
      V ${0.5 * size + offsetY}
      H ${0.7 * size + offsetX} 
      V ${0.4 * size + offsetY}
    `);
        ctx.fillStyle = "white";
        ctx.fill(innerPath);
        ctx.beginPath();
        ctx.moveTo(0.4 * size + offsetX, 0.6 * size + offsetY);
        ctx.arc(0.4 * size + offsetX, 0.6 * size + offsetY, 0.2 * size, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0.4 * size + offsetX, 0.6 * size + offsetY);
        ctx.arc(0.4 * size + offsetX, 0.6 * size + offsetY, 0.15 * size, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0.1 * size + offsetX, 0.45 * size + offsetY);
        ctx.arc(0.1 * size + offsetX, 0.45 * size + offsetY, 0.05 * size, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
    }
}

class Axes extends Object3D {
    constructor(container, axisClickedCallback, enabled = true, placement = "top-right", size = 128) {
        super();
        this._clickPoint = new Vector2();
        this._axisMaterials = new Array(3);
        this._axisLabelMaterials = new Array(6);
        this._axes = new Array(3);
        this._labels = new Array(6);
        this._viewportBak = new Vector4();
        this.onDivPointerUp = (e) => {
            if (!this.enabled) {
                return;
            }
            const { clientX, clientY } = e;
            const { left, top, width, height } = this._div.getBoundingClientRect();
            this._clickPoint.set((clientX - left - width / 2) / (width / 2), -(clientY - top - height / 2) / (height / 2));
            const label = this.getIntersectionLabel();
            if (label) {
                const axis = label.userData.axis;
                if (this._axisCLickedCallback) {
                    this._axisCLickedCallback(axis);
                }
            }
        };
        this._raycaster = new Raycaster();
        this._camera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
        this._camera.position.set(0, 0, 2);
        this._container = container;
        this._axisCLickedCallback = axisClickedCallback;
        this.initAxes();
        this.updateOptions(enabled, placement, size);
    }
    get size() {
        return this._size;
    }
    set size(value) {
        this.updateOptions(this.enabled, this._placement, value);
    }
    get placement() {
        return this._placement;
    }
    set placement(value) {
        this.updateOptions(this.enabled, value, this._size);
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(value) {
        this.updateOptions(value, this._placement, this._size);
    }
    updateOptions(enabled, placement, size) {
        this._enabled = enabled;
        this._size = size;
        this._placement = placement;
        this.initDiv();
    }
    destroy() {
        this.destroyDiv();
        this.destroyAxes();
    }
    render(mainCamera, renderer, toZUp = true) {
        if (!this.enabled) {
            return;
        }
        this.quaternion.copy(mainCamera.quaternion).invert();
        if (toZUp) {
            this.quaternion.multiply(Axes._toZUp);
        }
        this.updateMatrixWorld();
        renderer.getViewport(this._viewportBak);
        renderer.autoClear = false;
        renderer.clearDepth();
        switch (this._placement) {
            case "top-left":
                renderer.setViewport(0, renderer.getContext().drawingBufferHeight - this._size, this._size, this._size);
                break;
            case "top-right":
                renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, renderer.getContext().drawingBufferHeight - this._size, this._size, this._size);
                break;
            case "bottom-left":
                renderer.setViewport(0, 0, this._size, this._size);
                break;
            case "bottom-right":
                renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, 0, this._size, this._size);
                break;
        }
        renderer.render(this, this._camera);
        renderer.setViewport(this._viewportBak.x, this._viewportBak.y, this._viewportBak.z, this._viewportBak.w);
        renderer.autoClear = true;
    }
    initAxes() {
        this._axisMaterials[0] = MaterialBuilder.buildLineMaterial(0xFF3653, 0.02, false);
        this._axisMaterials[1] = MaterialBuilder.buildLineMaterial(0x8adb00, 0.02, false);
        this._axisMaterials[2] = MaterialBuilder.buildLineMaterial(0x2c8FFF, 0.02, false);
        this._axisLabelMaterials[0] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0xFF3653, "X"));
        this._axisLabelMaterials[1] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0xA32235, "-X"));
        this._axisLabelMaterials[2] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x8ADB00, "Y"));
        this._axisLabelMaterials[3] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x588C00, "-Y"));
        this._axisLabelMaterials[4] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x2C8FFF, "Z"));
        this._axisLabelMaterials[5] = MaterialBuilder
            .buildSpriteMaterial(CanvasTextureBuilder.buildAxisLabelTexture(64, 0x1C5BA3, "-Z"));
        this._axisGeometry = new LineGeometry();
        this._axisGeometry.setPositions([0, 0, 0, 0.8, 0, 0]);
        const xAxis = new Line2(this._axisGeometry, this._axisMaterials[0]);
        const yAxis = new Line2(this._axisGeometry, this._axisMaterials[1]);
        const zAxis = new Line2(this._axisGeometry, this._axisMaterials[2]);
        yAxis.rotation.z = Math.PI / 2;
        zAxis.rotation.y = -Math.PI / 2;
        this.add(xAxis);
        this.add(yAxis);
        this.add(zAxis);
        this._axes[0] = xAxis;
        this._axes[1] = yAxis;
        this._axes[2] = zAxis;
        const xLabel = new Sprite(this._axisLabelMaterials[0]);
        const yLabel = new Sprite(this._axisLabelMaterials[2]);
        const zLabel = new Sprite(this._axisLabelMaterials[4]);
        const xLabelN = new Sprite(this._axisLabelMaterials[1]);
        const yLabelN = new Sprite(this._axisLabelMaterials[3]);
        const zLabelN = new Sprite(this._axisLabelMaterials[5]);
        xLabel.userData.axis = "x";
        yLabel.userData.axis = "y";
        zLabel.userData.axis = "z";
        xLabelN.userData.axis = "-x";
        yLabelN.userData.axis = "-y";
        zLabelN.userData.axis = "-z";
        xLabel.position.x = 1;
        yLabel.position.y = 1;
        zLabel.position.z = 1;
        xLabelN.position.x = -1;
        yLabelN.position.y = -1;
        zLabelN.position.z = -1;
        xLabelN.scale.setScalar(0.8);
        yLabelN.scale.setScalar(0.8);
        zLabelN.scale.setScalar(0.8);
        this.add(xLabel);
        this.add(yLabel);
        this.add(zLabel);
        this.add(xLabelN);
        this.add(yLabelN);
        this.add(zLabelN);
        this._labels[0] = xLabel;
        this._labels[1] = yLabel;
        this._labels[2] = zLabel;
        this._labels[3] = xLabelN;
        this._labels[4] = yLabelN;
        this._labels[5] = zLabelN;
    }
    destroyAxes() {
        var _a, _b;
        this._axisGeometry.dispose();
        (_a = this._axisMaterials) === null || _a === void 0 ? void 0 : _a.forEach(x => x.dispose());
        this._axisMaterials = null;
        (_b = this._axisLabelMaterials) === null || _b === void 0 ? void 0 : _b.forEach(x => { x.map.dispose(); x.dispose(); });
        this._axisLabelMaterials = null;
    }
    initDiv() {
        this.destroyDiv();
        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.height = this._size + "px";
        div.style.width = this._size + "px";
        switch (this._placement) {
            case "top-left":
                div.style.top = 0 + "px";
                div.style.left = 0 + "px";
                break;
            case "top-right":
                div.style.top = 0 + "px";
                div.style.right = 0 + "px";
                break;
            case "bottom-left":
                div.style.bottom = 0 + "px";
                div.style.left = 0 + "px";
                break;
            case "bottom-right":
                div.style.bottom = 0 + "px";
                div.style.right = 0 + "px";
                break;
        }
        div.addEventListener("pointerup", this.onDivPointerUp);
        this._container.append(div);
        this._div = div;
    }
    destroyDiv() {
        if (this._div) {
            this._div.removeEventListener("pointerup", this.onDivPointerUp);
            this._div.remove();
            this._div = null;
        }
    }
    getIntersectionLabel() {
        this._raycaster.setFromCamera(this._clickPoint, this._camera);
        const intersection = this._raycaster.intersectObjects(this._labels)[0];
        if (!intersection) {
            return null;
        }
        else {
            return intersection.object;
        }
    }
}
Axes._toZUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

class Lights {
    constructor(physicalLights, ambientLightIntensity, hemiLightIntensity, dirLightIntensity) {
        const ambientLight = new AmbientLight(0x222222, physicalLights
            ? ambientLightIntensity * Math.PI
            : ambientLightIntensity);
        this._ambientLight = ambientLight;
        const hemiLight = new HemisphereLight(0xffffbb, 0x080820, physicalLights
            ? hemiLightIntensity * Math.PI
            : hemiLightIntensity);
        hemiLight.position.set(0, 2000, 0);
        this._hemisphereLight = hemiLight;
        const dirLight = new DirectionalLight(0xffffff, physicalLights
            ? dirLightIntensity * Math.PI
            : dirLightIntensity);
        dirLight.position.set(-2, 10, 2);
        this._directionalLight = dirLight;
    }
    update(physicalLights, ambientLightIntensity, hemiLightIntensity, dirLightIntensity) {
        this._ambientLight.intensity = physicalLights
            ? ambientLightIntensity * Math.PI
            : ambientLightIntensity;
        this._hemisphereLight.intensity = physicalLights
            ? hemiLightIntensity * Math.PI
            : hemiLightIntensity;
        this._directionalLight.intensity = physicalLights
            ? dirLightIntensity * Math.PI
            : dirLightIntensity;
    }
    getLights() {
        return [
            this._ambientLight,
            this._hemisphereLight,
            this._directionalLight,
        ];
    }
    getCopy() {
        return [
            new AmbientLight().copy(this._ambientLight),
            new HemisphereLight().copy(this._hemisphereLight),
            new DirectionalLight().copy(this._directionalLight),
        ];
    }
}

class HudTool {
    constructor(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize) {
        this._hudResolution = new Vector2();
        this._hudProjectionMatrix = new Matrix4();
        this._subjects = [];
        this._hudElements = new Map();
        this._hudScene = hudScene;
        this._hudResolution = hudResolution;
        this._hudProjectionMatrix = hudProjectionMatrix;
        this._toolZIndex = toolZIndex;
        this._cameraZIndex = cameraZIndex;
        this._spriteSize = spriteSize;
    }
    destroy() {
        this.destroyHudElements();
        this._subjects.forEach(x => x.complete());
    }
    update() {
        this._hudElements.forEach(x => x.update());
    }
    getHudElement(key) {
        return this._hudElements.get(key);
    }
    addHudElement(element, key) {
        if (!(element === null || element === void 0 ? void 0 : element.object3d)) {
            return;
        }
        if (this._hudElements.has(key)) {
            this.removeHudElement(key);
        }
        this._hudElements.set(key, element);
        this._hudScene.add(element.object3d);
    }
    removeHudElement(key) {
        const element = this._hudElements.get(key);
        if (element) {
            this._hudScene.remove(element.object3d);
            element.destroy();
            this._hudElements.delete(key);
        }
    }
    clearHudElements() {
        this._hudElements.forEach(v => {
            this._hudScene.remove(v.object3d);
            v.destroy();
        });
        this._hudElements.clear();
    }
    destroyHudElements() {
        this._hudElements.forEach(v => {
            this._hudScene.remove(v.object3d);
            v.destroy();
        });
        this._hudElements = null;
    }
}

class HudInstancedMarker {
    constructor(hudProjectionMatrix, hudResolution, texture, sizePx, spriteZIndex, cameraZIndex, keepVisible, maxInstances = 10000) {
        const material = MaterialBuilder.buildSpriteMaterial(texture);
        material.onBeforeCompile = shader => {
            shader.uniforms = Object.assign({}, shader.uniforms, {
                hudMatrix: { value: hudProjectionMatrix },
                resolution: { value: hudResolution },
            });
            shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform vec2 resolution;
        uniform mat4 hudMatrix;
        attribute vec3 instancePosition;
        attribute vec4 instanceUv;
        attribute float instanceScale;

        vec3 applyMatrix4(vec3 vec, mat4 mat) {
          vec3 result = vec3(0.0);
          float w = 1.0 / (mat[0].w * vec.x + mat[1].w * vec.y + mat[2].w * vec.z + mat[3].w);
          result .x = (mat[0].x * vec.x + mat[1].x * vec.y + mat[2].x * vec.z + mat[3].x) * w;
          result .y = (mat[0].y * vec.x + mat[1].y * vec.y + mat[2].y * vec.z + mat[3].y) * w;
          result .z = (mat[0].z * vec.x + mat[1].z * vec.y + mat[2].z * vec.z + mat[3].z) * w;
          return result;			
        }

        void main() {
      `);
            shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `
        #ifdef USE_UV
          vec2 iUv = vec2(uv.x == 0.0 ? instanceUv.x : instanceUv.z, uv.y == 0.0 ? instanceUv.y : instanceUv.w);          
          vUv = (uvTransform * vec3(iUv, 1)).xy;
        #endif
      `);
            shader.vertexShader = shader.vertexShader.replace("vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );", "");
            shader.vertexShader = shader.vertexShader.replace("#ifndef USE_SIZEATTENUATION", ` 
          scale.x *= instanceScale;
          scale.y *= instanceScale;

          vec3 hudPosition = applyMatrix4(instancePosition, hudMatrix);
          if (hudPosition.z > 1.0) {
            gl_Position = vec4(0.0, 0.0, 0.0, -1.0);
            return;
          }
          hudPosition.z = ${(spriteZIndex - cameraZIndex).toFixed()}.0;
        `
                +
                    (keepVisible
                        ? `
            vec2 halfRes = resolution * 0.5;
            if (hudPosition.x > halfRes.x) {
              hudPosition.x = halfRes.x - scale.x * 0.5;
            } else if (hudPosition.x < -halfRes.x) {
              hudPosition.x = -halfRes.x + scale.x * 0.5;
            }
            if (hudPosition.y > halfRes.y) {
              hudPosition.y = halfRes.y - scale.y * 0.5;
            } else if (hudPosition.y < -halfRes.y) {
              hudPosition.y = -halfRes.y + scale.y * 0.5;
            }
          `
                        : "")
                +
                    `
          vec4 mvPosition = mat4(
            modelViewMatrix[0], 
            modelViewMatrix[1], 
            modelViewMatrix[2], 
            vec4(hudPosition, 1)
          ) * vec4(0.0, 0.0, 0.0, 1.0);

          #ifndef USE_SIZEATTENUATION
        `);
        };
        const sprite = new Sprite(material);
        sprite.geometry = sprite.geometry.clone();
        sprite.geometry.setAttribute("instancePosition", new InstancedBufferAttribute(new Float32Array(3 * maxInstances), 3));
        sprite.geometry.setAttribute("instanceUv", new InstancedBufferAttribute(new Float32Array(4 * maxInstances), 4));
        sprite.geometry.setAttribute("instanceScale", new InstancedBufferAttribute(new Float32Array(maxInstances), 1));
        sprite.geometry["isInstancedBufferGeometry"] = false;
        sprite.geometry["instanceCount"] = 0;
        sprite.frustumCulled = false;
        sprite.visible = false;
        sprite.scale.set(sizePx, sizePx, 1);
        sprite.position.set(0, 0, 0);
        this._sprite = sprite;
    }
    get object3d() {
        return this._sprite;
    }
    update() {
    }
    destroy() {
        this._sprite.geometry.dispose();
        this._sprite = null;
    }
    set(data) {
        const instancePosition = this._sprite.geometry.getAttribute("instancePosition");
        const instanceUv = this._sprite.geometry.getAttribute("instanceUv");
        const instanceScale = this._sprite.geometry.getAttribute("instanceScale");
        const maxPositionCount = instancePosition.count;
        if (!(data === null || data === void 0 ? void 0 : data.length)) {
            this.reset();
            return;
        }
        else if (data.length > maxPositionCount) {
            data = data.slice(0, maxPositionCount);
        }
        this._sprite.geometry["isInstancedBufferGeometry"] = true;
        this._sprite.geometry["instanceCount"] = data.length;
        data.forEach((d, i) => {
            var _a;
            if (d.position) {
                instancePosition.setXYZ(i, d.position.x, d.position.y_Yup, d.position.z_Yup);
            }
            else {
                instancePosition.setXYZ(i, 0, 0, 0);
            }
            if (d.uv) {
                instanceUv.setXYZW(i, d.uv.x, d.uv.y, d.uv.z, d.uv.w);
            }
            else {
                instanceUv.setXYZW(i, 0, 0, 1, 1);
            }
            instanceScale.setX(i, (_a = d.scale) !== null && _a !== void 0 ? _a : 1);
        });
        instancePosition.needsUpdate = true;
        instanceUv.needsUpdate = true;
        instanceScale.needsUpdate = true;
        this._sprite.visible = true;
    }
    reset() {
        if (this._sprite.visible) {
            this._sprite.visible = false;
            this._sprite.geometry["isInstancedBufferGeometry"] = false;
            this._sprite.geometry["instanceCount"] = 0;
        }
    }
}

class HudUniqueMarker {
    constructor(hudProjectionMatrix, texture, sizePx, markerZIndex, cameraZIndex) {
        const material = MaterialBuilder.buildSpriteMaterial(texture);
        material.onBeforeCompile = shader => {
            shader.uniforms = Object.assign({}, shader.uniforms, { hudMatrix: { value: hudProjectionMatrix } });
            shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform mat4 hudMatrix;

        vec3 applyMatrix4(vec3 vec, mat4 mat) {
          vec3 result = vec3(0.0);
          float w = 1.0 / (mat[0].w * vec.x + mat[1].w * vec.y + mat[2].w * vec.z + mat[3].w);
          result .x = (mat[0].x * vec.x + mat[1].x * vec.y + mat[2].x * vec.z + mat[3].x) * w;
          result .y = (mat[0].y * vec.x + mat[1].y * vec.y + mat[2].y * vec.z + mat[3].y) * w;
          result .z = (mat[0].z * vec.x + mat[1].z * vec.y + mat[2].z * vec.z + mat[3].z) * w;
          return result;			
        }

        void main() {
      `);
            shader.vertexShader = shader.vertexShader.replace("vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );", ` 
          vec3 globalPosition = modelMatrix[3].xyz;
          vec3 hudPosition = applyMatrix4(globalPosition, hudMatrix);
          if (hudPosition.z > 1.0) {
            hudPosition.x = -hudPosition.x;
            hudPosition.y = -hudPosition.y;
          }
          hudPosition.z = ${(markerZIndex - cameraZIndex).toFixed()}.0;

          vec4 mvPosition = mat4(
            modelViewMatrix[0], 
            modelViewMatrix[1], 
            modelViewMatrix[2], 
            vec4(hudPosition, 1)
          ) * vec4( 0.0, 0.0, 0.0, 1.0 );
        `);
        };
        const sprite = new Sprite(material);
        sprite.visible = false;
        sprite.scale.set(sizePx, sizePx, 1);
        sprite.position.set(0, 0, 0);
        sprite.frustumCulled = false;
        this._sprite = sprite;
    }
    get object3d() {
        return this._sprite;
    }
    update() {
    }
    destroy() {
        this._sprite.material.dispose();
        this._sprite = null;
    }
    set(positions) {
        if ((positions === null || positions === void 0 ? void 0 : positions.length) !== 1) {
            this.reset();
            return;
        }
        this._sprite.position.copy(positions[0]);
        this._sprite.visible = true;
    }
    reset() {
        if (this._sprite.visible) {
            this._sprite.visible = false;
            this._sprite.position.set(0, 0, 0);
        }
    }
}

class HudPointSnap extends HudTool {
    constructor(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize) {
        super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize);
        this._selectedPoints = new Map();
        this._snapPointsHighlightChange = new Subject();
        this._snapPointsManualSelectionChange = new BehaviorSubject([]);
        this._subjects.push(this._snapPointsHighlightChange, this._snapPointsManualSelectionChange);
        this.snapPointsHighlightChange$ = this._snapPointsHighlightChange.asObservable();
        this.snapPointsManualSelectionChange$ = this._snapPointsManualSelectionChange.asObservable();
        this.initSprites();
    }
    setSnapPoint(snapPoint) {
        if (snapPoint) {
            const snapPosition = snapPoint.position.toVec4();
            this.getHudElement("s_snap").set([new Vector3(snapPosition.x, snapPosition.y, snapPosition.z)]);
            this._snapPointsHighlightChange.next(snapPoint);
        }
        else {
            this.getHudElement("s_snap").reset();
            this._snapPointsHighlightChange.next(null);
        }
    }
    resetSnapPoint() {
        this._snapPointsHighlightChange.next(null);
        this.getHudElement("s_snap").reset();
    }
    addSnapPointToSelected(point) {
        if (!point) {
            return;
        }
        this._selectedPoints.set(`${point.position.x}|${point.position.y_Yup}|${point.position.z_Yup}|${point.meshId}`, point);
        this.updateSelectedPointSprites();
    }
    removeSnapPointFromSelected(point) {
        if (!point) {
            return;
        }
        const key = `${point.position.x}|${point.position.y_Yup}|${point.position.z_Yup}|${point.meshId}`;
        if (this._selectedPoints.has(key)) {
            this._selectedPoints.delete(key);
            this.updateSelectedPointSprites();
        }
    }
    setSelectedSnapPoints(points) {
        if (!(points === null || points === void 0 ? void 0 : points.length)) {
            this.resetSelectedSnapPoints();
            return;
        }
        this._selectedPoints.clear();
        points.forEach(x => {
            this._selectedPoints.set(`${x.position.x}|${x.position.y_Yup}|${x.position.z_Yup}|${x.meshId}`, x);
        });
        this.updateSelectedPointSprites();
    }
    resetSelectedSnapPoints() {
        this._selectedPoints.clear();
        this.updateSelectedPointSprites();
    }
    reset() {
        this.resetSelectedSnapPoints();
        this.resetSnapPoint();
    }
    initSprites() {
        this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution, CanvasTextureBuilder.buildCircleTexture(64, 0x8B0000), this._spriteSize, this._toolZIndex, this._cameraZIndex, false), "s_snap_selection");
        this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, CanvasTextureBuilder.buildCircleTexture(64, 0xFF00FF), this._spriteSize, this._toolZIndex, this._cameraZIndex), "s_snap");
    }
    updateSelectedPointSprites() {
        const points = new Array(this._selectedPoints.size);
        const instanceData = new Array(this._selectedPoints.size);
        let i = 0;
        this._selectedPoints.forEach(v => {
            points[i] = v;
            instanceData[i++] = {
                position: v.position,
                scale: 1,
                uv: null,
            };
        });
        this.getHudElement("s_snap_selection").set(instanceData);
        this._snapPointsManualSelectionChange.next(points);
    }
}

class HudLineSegment {
    constructor(hudProjectionMatrix, hudResolution, color, width, zIndex, dashed = false) {
        this._hudResolution = hudResolution;
        const material = MaterialBuilder.buildLineMaterial(color, width, dashed);
        material.onBeforeCompile = shader => {
            shader.uniforms = Object.assign({}, shader.uniforms, { hudMatrix: { value: hudProjectionMatrix } });
            shader.vertexShader = shader.vertexShader.replace("void main() {", `
        uniform mat4 hudMatrix;

        vec3 applyMatrix4(vec3 vec, mat4 mat) {
          vec3 result = vec3(0.0);
          float w = 1.0 / (mat[0].w * vec.x + mat[1].w * vec.y + mat[2].w * vec.z + mat[3].w);
          result .x = (mat[0].x * vec.x + mat[1].x * vec.y + mat[2].x * vec.z + mat[3].x) * w;
          result .y = (mat[0].y * vec.x + mat[1].y * vec.y + mat[2].y * vec.z + mat[3].y) * w;
          result .z = (mat[0].z * vec.x + mat[1].z * vec.y + mat[2].z * vec.z + mat[3].z) * w;
          return result;			
        }

        void main() {
          vec3 hudStart = applyMatrix4(instanceStart, hudMatrix);
          if (hudStart.z > 1.0) {
            hudStart.x = -hudStart.x;
            hudStart.y = -hudStart.y;
          }
          hudStart.z = ${zIndex}.0;

          vec3 hudEnd = applyMatrix4(instanceEnd, hudMatrix);
          if (hudEnd.z > 1.0) {
            hudEnd.x = -hudEnd.x;
            hudEnd.y = -hudEnd.y;
          }
          hudEnd.z = ${zIndex}.0;

          float hudDistanceStart = 0.0;
          float hudDistanceEnd = length(hudEnd - hudStart);
      `);
            shader.vertexShader = shader.vertexShader.replace("vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;", "vLineDistance = ( position.y < 0.5 ) ? dashScale * hudDistanceStart : dashScale * hudDistanceEnd;");
            shader.vertexShader = shader.vertexShader.replace("vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );", "vec4 start = modelViewMatrix * vec4( hudStart, 1.0 );");
            shader.vertexShader = shader.vertexShader.replace("vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );", "vec4 end = modelViewMatrix * vec4( hudEnd, 1.0 );");
        };
        const geometry = new LineGeometry();
        geometry.setPositions(new Array(6).fill(0));
        const segment = new Line2(geometry, material);
        segment.frustumCulled = false;
        segment.visible = false;
        this._segment = segment;
    }
    get object3d() {
        return this._segment;
    }
    update() {
        this._segment.material.resolution.copy(this._hudResolution);
    }
    destroy() {
        this._segment.geometry.dispose();
        this._segment.material.dispose();
        this._segment = null;
    }
    set(positions) {
        if ((positions === null || positions === void 0 ? void 0 : positions.length) !== 2) {
            this.reset();
            return;
        }
        const [start, end] = positions;
        if (!this._segment.visible) {
            this._segment.visible = true;
        }
        this._segment.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    }
    reset() {
        if (this._segment.visible) {
            this._segment.visible = false;
            this._segment.geometry.setPositions(new Array(6).fill(0));
        }
    }
}

class HudDistanceMeasurer extends HudTool {
    constructor(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize) {
        super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize);
        this._measurePoints = { start: null, end: null };
        this._distanceMeasureChange = new Subject();
        this._subjects.push(this._distanceMeasureChange);
        this.distanceMeasureChange$ = this._distanceMeasureChange.asObservable();
        this.initLines();
        this.initSprites();
    }
    setEndMarker(point) {
        if (!point) {
            if (this._measurePoints.start) {
                this._measurePoints.start = null;
            }
            if (this._measurePoints.end) {
                this._measurePoints.end = null;
            }
        }
        else {
            if (this._measurePoints.end) {
                this._measurePoints.start = this._measurePoints.end;
                this._measurePoints.end = point;
            }
            else if (this._measurePoints.start) {
                this._measurePoints.end = point;
            }
            else {
                this._measurePoints.start = point;
            }
        }
        if (this._measurePoints.start) {
            this.getHudElement("s_dm_start").set([this._measurePoints.start]);
        }
        else {
            this.getHudElement("s_dm_start").reset();
        }
        if (this._measurePoints.end) {
            this.getHudElement("s_dm_end").set([this._measurePoints.end]);
            this.setLines(true);
        }
        else {
            this.getHudElement("s_dm_end").reset();
            this.resetLines();
        }
        if (this._measurePoints.start && this._measurePoints.end) {
            const start = Vec4DoubleCS.fromVector3(this._measurePoints.start);
            const end = Vec4DoubleCS.fromVector3(this._measurePoints.end);
            const distance = new Distance(start.toVec4(true), end.toVec4(true));
            this._distanceMeasureChange.next(distance);
        }
        else {
            this._distanceMeasureChange.next(null);
        }
    }
    reset() {
        this._measurePoints.start = null;
        this._measurePoints.end = null;
        this._distanceMeasureChange.next(null);
        this.resetSprites();
        this.resetLines();
    }
    initLines() {
        this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 0x2c8FFF, 2, this._toolZIndex, true), "l_dm_z");
        this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 0x8adb00, 2, this._toolZIndex, true), "l_dm_y");
        this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 0xFF3653, 2, this._toolZIndex, true), "l_dm_x");
        this.addHudElement(new HudLineSegment(this._hudProjectionMatrix, this._hudResolution, 0x0000FF, 4, this._toolZIndex), "l_dm_w");
    }
    setLines(toZUp) {
        const wStart = this._measurePoints.start;
        const wEnd = this._measurePoints.end;
        const distance = new Vector3().copy(wEnd).sub(wStart);
        const xEnd = new Vector3(wStart.x + distance.x, wStart.y, wStart.z);
        const yEnd = toZUp
            ? new Vector3(xEnd.x, xEnd.y, xEnd.z + distance.z)
            : new Vector3(xEnd.x, xEnd.y + distance.y, xEnd.z);
        this.getHudElement("l_dm_z").set([yEnd, wEnd]);
        this.getHudElement("l_dm_y").set([xEnd, yEnd]);
        this.getHudElement("l_dm_x").set([wStart, xEnd]);
        this.getHudElement("l_dm_w").set([wStart, wEnd]);
    }
    resetLines() {
        this.getHudElement("l_dm_z").reset();
        this.getHudElement("l_dm_y").reset();
        this.getHudElement("l_dm_x").reset();
        this.getHudElement("l_dm_w").reset();
    }
    initSprites() {
        this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, CanvasTextureBuilder.buildCircleTexture(64, 0x391285), this._spriteSize, this._toolZIndex, this._cameraZIndex), "s_dm_start");
        this.addHudElement(new HudUniqueMarker(this._hudProjectionMatrix, CanvasTextureBuilder.buildCircleTexture(64, 0x00FFFF), this._spriteSize, this._toolZIndex, this._cameraZIndex), "s_dm_end");
    }
    resetSprites() {
        this.getHudElement("s_dm_start").reset();
        this.getHudElement("s_dm_end").reset();
    }
}

class HudMarkers extends HudTool {
    constructor(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize) {
        super(hudScene, hudResolution, hudProjectionMatrix, toolZIndex, cameraZIndex, spriteSize);
        this._markers = [];
        this._selectedMarkerIds = new Set();
        this._tempVec3 = new Vector3();
        this._tempVec2 = new Vector2();
        this._markersChange = new BehaviorSubject([]);
        this._markersSelectionChange = new BehaviorSubject([]);
        this._markersManualSelectionChange = new BehaviorSubject([]);
        this._markersHighlightChange = new Subject();
        this._subjects.push(this._markersChange, this._markersSelectionChange, this._markersManualSelectionChange, this._markersHighlightChange);
        this.markersChange$ = this._markersChange.asObservable();
        this.markersSelectionChange$ = this._markersSelectionChange.asObservable();
        this.markersManualSelectionChange$ = this._markersManualSelectionChange.asObservable();
        this.markersHighlightChange$ = this._markersHighlightChange.asObservable();
        this.initSprites();
    }
    addMarker(marker) {
        if (!marker) {
            return;
        }
        const found = this._markers.find(x => x.id === marker.id);
        if (!found) {
            this._markers.push(marker);
            this.emitMarkers();
            this.updateSprites();
        }
    }
    removeMarker(markerId) {
        if (markerId) {
            this._markers = this._markers.filter(x => x.id !== markerId);
            if (this._selectedMarkerIds.delete(markerId)) {
                this.emitSelected();
            }
            this.emitMarkers();
            this.updateSprites();
        }
    }
    setMarkers(markers) {
        if (!(markers === null || markers === void 0 ? void 0 : markers.length)) {
            this.resetMarkers();
            return;
        }
        this._markers = markers;
        if (this._selectedMarkerIds.size) {
            this._selectedMarkerIds.clear();
            this.emitSelected();
        }
        this.emitMarkers();
        this.updateSprites();
    }
    resetMarkers() {
        if (this._selectedMarkerIds.size) {
            this._selectedMarkerIds.clear();
            this.emitSelected();
        }
        if (this._markers.length) {
            this._markers.length = 0;
            this.emitMarkers();
        }
        this.updateSprites();
    }
    highlightMarker(marker) {
        if (marker === this._highlightedMarker) {
            return;
        }
        this._highlightedMarker = marker;
        this.emitHighlighted();
        this.updateSprites();
    }
    addMarkerToSelection(markerId) {
        if (!this._selectedMarkerIds.has(markerId)) {
            this._selectedMarkerIds.add(markerId);
            this.updateSprites();
            this.emitSelected(true);
        }
    }
    removeMarkerFromSelection(markerId) {
        if (this._selectedMarkerIds.delete(markerId)) {
            this.updateSprites();
            this.emitSelected(true);
        }
    }
    setSelectedMarkers(markerIds, manual) {
        this._selectedMarkerIds.clear();
        if (markerIds === null || markerIds === void 0 ? void 0 : markerIds.length) {
            markerIds.forEach(x => this._selectedMarkerIds.add(x));
        }
        this.updateSprites();
        if (manual) {
            this.emitSelected(manual);
        }
    }
    resetSelectedMarkers() {
        if (this._selectedMarkerIds.size) {
            this._selectedMarkerIds.clear();
            this.updateSprites();
            this.emitSelected();
        }
    }
    getMarkerAtCanvasPoint(canvasPositionZeroCenter) {
        if (this._markers.length) {
            const maxDistance = this._spriteSize / 2;
            for (let i = this._markers.length - 1; i >= 0; i--) {
                const marker = this._markers[i];
                this._tempVec3.set(marker.position.x, marker.position.y_Yup, marker.position.z_Yup)
                    .applyMatrix4(this._hudProjectionMatrix);
                if (this._tempVec3.z > 1) {
                    continue;
                }
                this._tempVec2.set(this._tempVec3.x, this._tempVec3.y);
                if (this._tempVec2.distanceTo(canvasPositionZeroCenter) < maxDistance) {
                    return marker;
                }
            }
        }
        return null;
    }
    initSprites() {
        const { texture, uvMap } = CanvasTextureBuilder.buildSpriteAtlasTexture();
        this._uvMap = uvMap;
        this.addHudElement(new HudInstancedMarker(this._hudProjectionMatrix, this._hudResolution, texture, this._spriteSize, this._toolZIndex, this._cameraZIndex, true, 1000), "s_warn");
    }
    updateSprites() {
        this._markers.sort((a, b) => {
            if (a.type === b.type) {
                return 0;
            }
            else if (a.type > b.type) {
                return 1;
            }
            else {
                return -1;
            }
        });
        const instanceData = new Array(this._markers.length);
        let i = 0;
        this._markers.forEach(v => {
            instanceData[i++] = {
                position: v.position,
                scale: this._highlightedMarker === v
                    ? 1.5
                    : 1,
                uv: this._uvMap.get(this._selectedMarkerIds.has(v.id) ? v.type + "_selected" : v.type),
            };
        });
        this.getHudElement("s_warn").set(instanceData);
    }
    emitMarkers() {
        this._markersChange.next(this._markers);
    }
    emitHighlighted() {
        this._markersHighlightChange.next(this._highlightedMarker);
    }
    emitSelected(manual = false) {
        const selectedMarkers = this._markers.filter(x => this._selectedMarkerIds.has(x.id));
        this._markersSelectionChange.next(selectedMarkers);
        if (manual) {
            this._markersManualSelectionChange.next(selectedMarkers);
        }
    }
}

class HudScene {
    constructor() {
        this._cameraZ = 10;
        this._scene = new Scene();
        this._hudResolution = new Vector2();
        this._hudScale = new Matrix4();
        this._hudProjectionMatrix = new Matrix4();
        this.projectToHud = (point) => {
            point.applyMatrix4(this._hudProjectionMatrix);
            if (point.z > 1) {
                point.x = -point.x;
                point.y = -point.y;
            }
        };
        this._pointSnap = new HudPointSnap(this._scene, this._hudResolution, this._hudProjectionMatrix, 9, this._cameraZ, 8);
        this._distanceMeasurer = new HudDistanceMeasurer(this._scene, this._hudResolution, this._hudProjectionMatrix, 8, this._cameraZ, 8);
        this._markers = new HudMarkers(this._scene, this._hudResolution, this._hudProjectionMatrix, 1, this._cameraZ, 24);
    }
    get pointSnap() {
        return this._pointSnap;
    }
    get distanceMeasurer() {
        return this._distanceMeasurer;
    }
    get markers() {
        return this._markers;
    }
    destroy() {
        this._pointSnap.destroy();
        this._pointSnap = null;
        this._distanceMeasurer.destroy();
        this._distanceMeasurer = null;
        this._markers.destroy();
        this._markers = null;
        this._scene = null;
    }
    render(mainCamera, renderer) {
        const ctx = renderer.getContext();
        this.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);
        this.updateHudProjectionMatrix(mainCamera);
        this._distanceMeasurer.update();
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this._scene, this._camera);
        renderer.autoClear = true;
    }
    updateResolution(rendererBufferWidth, rendererBufferHeight) {
        if (rendererBufferWidth === this._hudResolution.x
            && rendererBufferHeight === this._hudResolution.y) {
            return;
        }
        this._hudResolution.set(rendererBufferWidth, rendererBufferHeight);
        this.updateCameraResolution();
    }
    updateCameraResolution() {
        if (!this._camera) {
            this._camera = new OrthographicCamera(this._hudResolution.x / -2, this._hudResolution.x / 2, this._hudResolution.y / 2, this._hudResolution.y / -2, 1, 10);
            this._camera.position.setZ(this._cameraZ);
        }
        else {
            this._camera.left = this._hudResolution.x / -2;
            this._camera.right = this._hudResolution.x / 2;
            this._camera.top = this._hudResolution.y / 2;
            this._camera.bottom = this._hudResolution.y / -2;
            this._camera.updateProjectionMatrix();
        }
    }
    updateHudProjectionMatrix(camera) {
        this._hudScale.makeScale(this._hudResolution.x / 2, this._hudResolution.y / 2, 1);
        this._hudProjectionMatrix.copy(this._hudScale)
            .multiply(camera.projectionMatrix)
            .multiply(camera.matrixWorldInverse);
    }
}

var __awaiter$3 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class RenderScene {
    constructor(colors) {
        this._geometries = [];
        this._materials = new Map();
        this._geometryIndexBySourceMesh = new Map();
        this._sourceMeshesByGeometryIndex = new Map();
        this._renderMeshBySourceMesh = new Map();
        this._geometryIndicesNeedSort = new Set();
        this.updateCommonColors(colors);
        this._globalMaterial = MaterialBuilder.buildGlobalMaterial();
    }
    get scene() {
        return this._scene;
    }
    get geometries() {
        return this._geometries;
    }
    get meshes() {
        return [...this._renderMeshBySourceMesh.values()];
    }
    destroy() {
        this.destroyScene();
        this.destroyMaterials();
    }
    updateSceneAsync(lights, meshes, models, meshMergeType) {
        return __awaiter$3(this, void 0, void 0, function* () {
            this.deleteScene();
            yield this.createSceneAsync(lights, meshes, models, meshMergeType);
        });
    }
    updateSceneMaterials() {
        this._globalMaterial.needsUpdate = true;
        this._materials.forEach(v => v.needsUpdate = true);
    }
    updateMeshColors(sourceMeshes) {
        if (this._currentMergeType) {
            this.updateMeshGeometryColors(sourceMeshes);
        }
        else {
            this.updateMeshMaterials(sourceMeshes);
        }
        this.sortGeometryIndicesByOpacity();
    }
    updateCommonColors(colors) {
        if (!colors) {
            throw new Error("Colors are not defined");
        }
        const { isolationColor, isolationOpacity, selectionColor, highlightColor } = colors;
        this._isolationColor = MaterialBuilder.buildIsolationColor(isolationColor, isolationOpacity);
        this._selectionColor = new Color(selectionColor);
        this._highlightColor = new Color(highlightColor);
    }
    deleteScene() {
        this._geometries.forEach(x => x.geometry.dispose());
        this._geometries.length = 0;
        this._geometryIndexBySourceMesh.clear();
        this._sourceMeshesByGeometryIndex.clear();
        this._renderMeshBySourceMesh.clear();
        this._geometryIndicesNeedSort.clear();
        this._scene = null;
    }
    createSceneAsync(lights, meshes, models, meshMergeType) {
        return __awaiter$3(this, void 0, void 0, function* () {
            const scene = new Scene();
            scene.add(...lights);
            if (meshMergeType) {
                const meshGroups = yield this.groupModelMeshesByMergeType(meshes, models, meshMergeType);
                for (const meshGroup of meshGroups) {
                    if (meshGroup.length) {
                        const geometry = yield this.buildRenderGeometryAsync(meshGroup);
                        if (!geometry) {
                            continue;
                        }
                        this._geometries.push(geometry);
                        const i = this._geometries.length - 1;
                        this._sourceMeshesByGeometryIndex.set(i, meshGroup);
                        this._geometryIndicesNeedSort.add(i);
                        meshGroup.forEach(x => {
                            this._geometryIndexBySourceMesh.set(x, i);
                        });
                    }
                }
                this._geometries.forEach(x => {
                    const mesh = new Mesh(x.geometry, this._globalMaterial);
                    scene.add(mesh);
                });
            }
            else {
                meshes.forEach(sourceMesh => {
                    const rgbRmo = ColorRgbRmo.getFromMesh(sourceMesh);
                    const material = this.getMaterialByColor(rgbRmo);
                    sourceMesh.updateMatrixWorld();
                    const renderMesh = new Mesh(sourceMesh.geometry, material);
                    renderMesh.applyMatrix4(sourceMesh.matrixWorld);
                    this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
                    scene.add(renderMesh);
                });
            }
            this._currentMergeType = meshMergeType;
            this._scene = scene;
        });
    }
    groupModelMeshesByMergeType(meshes, models, meshMergeType) {
        return __awaiter$3(this, void 0, void 0, function* () {
            let grouppedMeshes;
            switch (meshMergeType) {
                case "scene":
                    grouppedMeshes = [meshes];
                    break;
                case "model":
                    grouppedMeshes = models.map(x => x.meshes).filter(x => x.length);
                    break;
                case "model+":
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
        return __awaiter$3(this, void 0, void 0, function* () {
            let positionsLen = 0;
            let indicesLen = 0;
            meshes.forEach(x => {
                positionsLen += x.geometry.getAttribute("position").count * 3;
                indicesLen += x.geometry.getIndex().count;
            });
            if (positionsLen === 0) {
                return null;
            }
            const indexBuffer = new Uint32BufferAttribute(new Uint32Array(indicesLen), 1);
            const colorBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
            const rmoBuffer = new Uint8BufferAttribute(new Uint8Array(positionsLen), 3, true);
            const positionBuffer = new Float32BufferAttribute(new Float32Array(positionsLen), 3);
            const indicesBySourceMesh = new Map();
            let positionsOffset = 0;
            let indicesOffset = 0;
            const chunkSize = 100;
            const processChunk = (chunk) => {
                chunk.forEach(x => {
                    x.updateMatrixWorld();
                    const geometry = x.geometry
                        .clone()
                        .applyMatrix4(x.matrixWorld);
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
                        colorBuffer.setXYZ(positionsOffset, rgbrmo.rByte, rgbrmo.gByte, rgbrmo.bByte);
                        rmoBuffer.setXYZ(positionsOffset, rgbrmo.roughnessByte, rgbrmo.metalnessByte, rgbrmo.opacityByte);
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
    updateMeshMaterials(sourceMeshes) {
        sourceMeshes.forEach((sourceMesh) => {
            const { rgbRmo } = this.refreshMeshColors(sourceMesh);
            const material = this.getMaterialByColor(rgbRmo);
            const renderMesh = this._renderMeshBySourceMesh.get(sourceMesh);
            if (renderMesh) {
                renderMesh.material = material;
            }
        });
    }
    updateMeshGeometryColors(sourceMeshes) {
        const meshesByRgIndex = new Map();
        sourceMeshes.forEach((mesh) => {
            const rgIndex = this._geometryIndexBySourceMesh.get(mesh);
            if (meshesByRgIndex.has(rgIndex)) {
                meshesByRgIndex.get(rgIndex).push(mesh);
            }
            else {
                meshesByRgIndex.set(rgIndex, [mesh]);
            }
        });
        meshesByRgIndex.forEach((v, k) => {
            this.updateGeometryColors(k, v);
        });
    }
    updateGeometryColors(rgIndex, meshes) {
        const geometry = this._geometries[rgIndex];
        if (!geometry) {
            return;
        }
        const { colors, rmos, indicesBySourceMesh } = geometry;
        let anyMeshOpacityChanged = false;
        meshes.forEach(mesh => {
            const indices = indicesBySourceMesh.get(mesh);
            const { rgbRmo, opacityChanged } = this.refreshMeshColors(mesh, rmos.getZ(indices[0]) / 255);
            indices.forEach(i => {
                colors.setXYZ(i, rgbRmo.rByte, rgbRmo.gByte, rgbRmo.bByte);
                rmos.setXYZ(i, rgbRmo.roughnessByte, rgbRmo.metalnessByte, rgbRmo.opacityByte);
            });
            if (!anyMeshOpacityChanged && opacityChanged) {
                anyMeshOpacityChanged = true;
            }
        });
        colors.needsUpdate = true;
        rmos.needsUpdate = true;
        if (anyMeshOpacityChanged) {
            this._geometryIndicesNeedSort.add(rgIndex);
        }
    }
    sortGeometryIndicesByOpacity() {
        this._geometryIndicesNeedSort.forEach(i => {
            const meshes = this._sourceMeshesByGeometryIndex.get(i);
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
            const { indices, indicesBySourceMesh } = this._geometries[i];
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
        this._geometryIndicesNeedSort.clear();
    }
    destroyScene() {
        var _a;
        this._scene = null;
        (_a = this._geometries) === null || _a === void 0 ? void 0 : _a.forEach(x => x.geometry.dispose());
        this._geometries = null;
    }
    getMaterialByColor(rgbRmo) {
        const key = rgbRmo.toString();
        if (this._materials.has(key)) {
            return this._materials.get(key);
        }
        const material = MaterialBuilder.buildStandardMaterial(rgbRmo);
        this._materials.set(key, material);
        return material;
    }
    refreshMeshColors(mesh, opacityInitial = null) {
        opacityInitial = opacityInitial !== null && opacityInitial !== void 0 ? opacityInitial : ColorRgbRmo.getFromMesh(mesh).opacity;
        if (!mesh.userData.isolated) {
            ColorRgbRmo.deleteFromMesh(mesh);
        }
        const rgbRmoBase = ColorRgbRmo.getFromMesh(mesh);
        let rgbRmo;
        if (mesh.userData.highlighted) {
            rgbRmo = new ColorRgbRmo(this._highlightColor.r, this._highlightColor.g, this._highlightColor.b, rgbRmoBase.roughness, rgbRmoBase.metalness, rgbRmoBase.opacity);
        }
        else if (mesh.userData.selected) {
            rgbRmo = new ColorRgbRmo(this._selectionColor.r, this._selectionColor.g, this._selectionColor.b, rgbRmoBase.roughness, rgbRmoBase.metalness, rgbRmoBase.opacity);
        }
        else if (mesh.userData.isolated) {
            rgbRmo = this._isolationColor;
        }
        else {
            rgbRmo = rgbRmoBase;
        }
        ColorRgbRmo.setToMesh(mesh, rgbRmo);
        const opacityChanged = (rgbRmo.opacity === 1 && opacityInitial < 1)
            || (rgbRmo.opacity < 1 && opacityInitial === 1);
        return { rgbRmo, opacityChanged };
    }
    destroyMaterials() {
        this._globalMaterial.dispose();
        this._globalMaterial = null;
        this._materials.forEach(v => v.dispose());
        this._materials = null;
    }
}

var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class SimplifiedScene {
    constructor() {
        this._boxIndices = [
            0, 1, 3,
            3, 1, 2,
            1, 5, 2,
            2, 5, 6,
            5, 4, 6,
            6, 4, 7,
            4, 0, 7,
            7, 0, 3,
            3, 2, 7,
            7, 2, 6,
            4, 5, 0,
            0, 5, 1,
        ];
        this._geometries = [];
        this._simpleMaterial = MaterialBuilder.buildPhongMaterial();
    }
    get scene() {
        return this._scene;
    }
    get geometries() {
        return this._geometries;
    }
    destroy() {
        var _a;
        (_a = this._geometries) === null || _a === void 0 ? void 0 : _a.forEach(x => x.dispose());
        this._geometries = null;
        this._scene = null;
        this._simpleMaterial.dispose();
        this._simpleMaterial = null;
    }
    clearScene() {
        this._scene = null;
    }
    updateSceneAsync(lights, meshes, fastRenderType) {
        return __awaiter$2(this, void 0, void 0, function* () {
            this._scene = null;
            const scene = new Scene();
            scene.add(...lights);
            this._geometries.forEach(x => x.dispose());
            this._geometries.length = 0;
            let geometry;
            switch (fastRenderType) {
                case "ch":
                    geometry = yield this.buildHullGeometryAsync(meshes);
                    break;
                case "aabb":
                    geometry = yield this.buildBoxGeometryAsync(meshes);
                    break;
                case "ombb":
                default:
                    throw new Error("Render type not implemented");
            }
            if (geometry) {
                this._geometries.push(geometry);
            }
            this._geometries.forEach(x => {
                const mesh = new Mesh(x, this._simpleMaterial);
                scene.add(mesh);
            });
            this._scene = scene;
        });
    }
    updateSceneMaterials() {
        this._simpleMaterial.needsUpdate = true;
    }
    buildHullGeometryAsync(meshes) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
                return null;
            }
            const hullPoints = [];
            const hullChunkSize = 100;
            const hullChunk = (chunk) => {
                chunk.forEach(x => {
                    try {
                        const hull = new ConvexHull().setFromObject(x);
                        hull.faces.forEach(f => {
                            let edge = f.edge;
                            do {
                                hullPoints.push(edge.head().point);
                                edge = edge.next;
                            } while (edge !== f.edge);
                        });
                    }
                    catch (_a) {
                    }
                });
            };
            for (let i = 0; i < meshes.length; i += hullChunkSize) {
                yield new Promise((resolve) => {
                    setTimeout(() => {
                        hullChunk(meshes.slice(i, i + hullChunkSize));
                        resolve();
                    }, 0);
                });
            }
            const indexArray = new Uint32Array(hullPoints.length);
            let currentIndex = 0;
            const indexByKey = new Map();
            const uniquePoints = [];
            hullPoints.forEach((x, i) => {
                const key = `${x.x}|${x.y}|${x.z}`;
                if (!indexByKey.has(key)) {
                    indexArray[i] = currentIndex;
                    indexByKey.set(key, currentIndex++);
                    uniquePoints.push(x);
                }
                else {
                    indexArray[i] = indexByKey.get(key);
                }
            });
            const positionArray = new Float32Array(uniquePoints.length * 3);
            let currentPosition = 0;
            uniquePoints.forEach(x => {
                positionArray[currentPosition++] = x.x;
                positionArray[currentPosition++] = x.y;
                positionArray[currentPosition++] = x.z;
            });
            const positionBuffer = new Float32BufferAttribute(positionArray, 3);
            const indexBuffer = new Uint32BufferAttribute(indexArray, 1);
            const outputGeometry = new BufferGeometry();
            outputGeometry.setAttribute("position", positionBuffer);
            outputGeometry.setIndex(indexBuffer);
            return outputGeometry;
        });
    }
    buildBoxGeometryAsync(meshes) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
                return null;
            }
            const positionArray = new Float32Array(meshes.length * 8 * 3);
            const indexArray = new Uint32Array(meshes.length * 12 * 3);
            let positionsOffset = 0;
            let indicesOffset = 0;
            const chunkSize = 100;
            const processChunk = (chunk) => {
                chunk.forEach(x => {
                    const boxPositions = this.getMeshBoxPositions(x);
                    const indexPositionOffset = positionsOffset / 3;
                    for (let i = 0; i < boxPositions.length; i++) {
                        positionArray[positionsOffset++] = boxPositions[i];
                    }
                    this._boxIndices.forEach(i => indexArray[indicesOffset++] = indexPositionOffset + i);
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
            const positionBuffer = new Float32BufferAttribute(positionArray, 3);
            const indexBuffer = new Uint32BufferAttribute(indexArray, 1);
            const outputGeometry = new BufferGeometry();
            outputGeometry.setAttribute("position", positionBuffer);
            outputGeometry.setIndex(indexBuffer);
            return outputGeometry;
        });
    }
    getMeshBoxPositions(mesh) {
        const box = new Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position"));
        const boxPositionArray = new Float32Array(24);
        boxPositionArray[0] = box.min.x;
        boxPositionArray[1] = box.min.y;
        boxPositionArray[2] = box.max.z;
        boxPositionArray[3] = box.max.x;
        boxPositionArray[4] = box.min.y;
        boxPositionArray[5] = box.max.z;
        boxPositionArray[6] = box.max.x;
        boxPositionArray[7] = box.max.y;
        boxPositionArray[8] = box.max.z;
        boxPositionArray[9] = box.min.x;
        boxPositionArray[10] = box.max.y;
        boxPositionArray[11] = box.max.z;
        boxPositionArray[12] = box.min.x;
        boxPositionArray[13] = box.min.y;
        boxPositionArray[14] = box.min.z;
        boxPositionArray[15] = box.max.x;
        boxPositionArray[16] = box.min.y;
        boxPositionArray[17] = box.min.z;
        boxPositionArray[18] = box.max.x;
        boxPositionArray[19] = box.max.y;
        boxPositionArray[20] = box.min.z;
        boxPositionArray[21] = box.min.x;
        boxPositionArray[22] = box.max.y;
        boxPositionArray[23] = box.min.z;
        mesh.updateMatrixWorld();
        const boxPosition = new Float32BufferAttribute(boxPositionArray, 3).applyMatrix4(mesh.matrixWorld).array;
        return boxPosition;
    }
}

class ScenesService {
    constructor(container, cameraService, options) {
        if (!options) {
            throw new Error("Options is not defined");
        }
        this._options = options;
        this._lights = new Lights(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
        this._axes = new Axes(container, (axis) => cameraService.rotateToFaceTheAxis(axis, true), this._options.axesHelperEnabled, this._options.axesHelperPlacement, this._options.axesHelperSize);
        this._renderScene = new RenderScene({
            isolationColor: this._options.isolationColor,
            isolationOpacity: this._options.isolationOpacity,
            selectionColor: this._options.selectionColor,
            highlightColor: this._options.highlightColor
        });
        this._simplifiedScene = new SimplifiedScene();
        this._hudScene = new HudScene();
    }
    get lights() {
        return this._lights;
    }
    get axes() {
        return this._axes;
    }
    get renderScene() {
        return this._renderScene;
    }
    get simplifiedScene() {
        return this._simplifiedScene;
    }
    get hudScene() {
        return this._hudScene;
    }
    destroy() {
        var _a, _b, _c, _d;
        (_a = this._axes) === null || _a === void 0 ? void 0 : _a.destroy();
        this._axes = null;
        (_b = this._hudScene) === null || _b === void 0 ? void 0 : _b.destroy();
        this._hudScene = null;
        (_c = this._simplifiedScene) === null || _c === void 0 ? void 0 : _c.destroy();
        this._simplifiedScene = null;
        (_d = this._renderScene) === null || _d === void 0 ? void 0 : _d.destroy();
        this._renderScene = null;
    }
}

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class RenderService {
    constructor(container, loaderService, cameraService, scenesService, options, lastFrameTimeSubject) {
        this._rendererEventListeners = new Map();
        this._meshesNeedColorUpdate = new Set();
        this.resizeRenderer = () => {
            var _a;
            const { width, height } = this._container.getBoundingClientRect();
            (_a = this._cameraService) === null || _a === void 0 ? void 0 : _a.resize(width, height);
            if (this._renderer) {
                this._renderer.setSize(width, height, false);
                this.render();
            }
        };
        if (!container) {
            throw new Error("Container is not defined");
        }
        if (!loaderService) {
            throw new Error("LoaderService is not defined");
        }
        if (!cameraService) {
            throw new Error("CameraService is not defined");
        }
        if (!scenesService) {
            throw new Error("SceneService is not defined");
        }
        if (!options) {
            throw new Error("Options is not defined");
        }
        this._container = container;
        this._loaderService = loaderService;
        this._cameraService = cameraService;
        this._scenesService = scenesService;
        this._options = options;
        this._lastFrameTimeSubject = lastFrameTimeSubject;
        const { useAntialiasing, usePhysicalLights } = this._options;
        const renderer = new WebGLRenderer({
            alpha: true,
            antialias: useAntialiasing,
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = sRGBEncoding;
        renderer.toneMapping = NoToneMapping;
        renderer.physicallyCorrectLights = usePhysicalLights;
        this._renderer = renderer;
        this.resizeRenderer();
        this._cameraService.focusCameraOnObjects(null);
        this._container.append(this._renderer.domElement);
    }
    set options(value) {
        this._options = value;
    }
    get renderer() {
        return this._renderer;
    }
    get canvas() {
        return this._renderer.domElement;
    }
    get camera() {
        return this._cameraService.camera;
    }
    destroy() {
        this.removeAllRendererEventListeners();
        this._renderer.domElement.remove();
        this._renderer.dispose();
        this._renderer.forceContextLoss();
        this._renderer = null;
    }
    addRendererEventListener(type, listener) {
        const existingListenersForType = this._rendererEventListeners.get(type);
        if (existingListenersForType) {
            if (existingListenersForType.has(listener)) {
                return;
            }
            existingListenersForType.add(listener);
        }
        else {
            this._rendererEventListeners.set(type, new Set([listener]));
        }
        this._renderer.domElement.addEventListener(type, listener);
    }
    ;
    removeRendererEventListener(type, listener) {
        this._renderer.domElement.removeEventListener(type, listener);
        const existingListenersForType = this._rendererEventListeners.get(type);
        if (existingListenersForType) {
            existingListenersForType.delete(listener);
        }
    }
    ;
    removeAllRendererEventListeners() {
        this._rendererEventListeners.forEach((v, k) => {
            v.forEach(x => this._renderer.domElement.removeEventListener(k, x));
        });
        this._rendererEventListeners.clear();
    }
    updateRenderSceneAsync() {
        return __awaiter$1(this, void 0, void 0, function* () {
            yield this._scenesService.renderScene.updateSceneAsync(this._scenesService.lights.getLights(), this._loaderService.loadedMeshesArray, this._loaderService.loadedModelsArray, this._options.meshMergeType);
            if (this._options.fastRenderType) {
                yield this._scenesService.simplifiedScene.updateSceneAsync(this._scenesService.lights.getCopy(), this._loaderService.loadedMeshesArray, this._options.fastRenderType);
            }
            else {
                this._scenesService.simplifiedScene.clearScene();
            }
            this.renderWholeScene();
        });
    }
    renderOnCameraMove() {
        if (this._options.fastRenderType) {
            if (this._deferRender) {
                clearTimeout(this._deferRender);
                this._deferRender = null;
            }
            this.render(null, true);
            this._deferRender = window.setTimeout(() => {
                this._deferRender = null;
                this.render();
            }, 300);
        }
        else {
            this.render();
        }
    }
    render(focusObjects = null, fast = false) {
        this.prepareToRender(focusObjects);
        requestAnimationFrame(() => {
            var _a, _b, _c, _d, _e;
            if (!this._renderer) {
                return;
            }
            const start = performance.now();
            if (fast && ((_a = this._scenesService.simplifiedScene) === null || _a === void 0 ? void 0 : _a.scene)) {
                this._renderer.render(this._scenesService.simplifiedScene.scene, this._cameraService.camera);
            }
            else if ((_b = this._scenesService.renderScene) === null || _b === void 0 ? void 0 : _b.scene) {
                this._renderer.render(this._scenesService.renderScene.scene, this._cameraService.camera);
            }
            (_c = this._scenesService.hudScene) === null || _c === void 0 ? void 0 : _c.render(this._cameraService.camera, this._renderer);
            (_d = this._scenesService.axes) === null || _d === void 0 ? void 0 : _d.render(this._cameraService.camera, this._renderer);
            const frameTime = performance.now() - start;
            (_e = this._lastFrameTimeSubject) === null || _e === void 0 ? void 0 : _e.next(frameTime);
        });
    }
    renderWholeScene() {
        this.render(this._loaderService.loadedMeshesArray.length ? [this._scenesService.renderScene.scene] : null);
    }
    enqueueMeshForColorUpdate(mesh) {
        this._meshesNeedColorUpdate.add(mesh);
    }
    convertClientToCanvas(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelRatio = this.renderer.getPixelRatio();
        const x = (clientX - rect.left) * (this.canvas.width / rect.width) * pixelRatio || 0;
        const y = (clientY - rect.top) * (this.canvas.height / rect.height) * pixelRatio || 0;
        return new Vector2(x, y);
    }
    convertClientToCanvasZeroCenter(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelRatio = this.renderer.getPixelRatio();
        const canvasRatioW = (this.canvas.width / rect.width) * pixelRatio || 0;
        const canvasRatioH = (this.canvas.height / rect.height) * pixelRatio || 0;
        const x = (clientX - rect.left) * canvasRatioW;
        const y = (clientY - rect.top) * canvasRatioH;
        const canvasHalfWidth = rect.width * canvasRatioW / 2;
        const canvasHalfHeight = rect.height * canvasRatioH / 2;
        const xC = x - canvasHalfWidth;
        const yC = canvasHalfHeight - y;
        return new Vector2(xC, yC);
    }
    convertClientToCanvasZeroCenterNormalized(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelRatio = this.renderer.getPixelRatio();
        const canvasRatioW = (this.canvas.width / rect.width) * pixelRatio || 0;
        const canvasRatioH = (this.canvas.height / rect.height) * pixelRatio || 0;
        const x = (clientX - rect.left) * canvasRatioW;
        const y = (clientY - rect.top) * canvasRatioH;
        const canvasHalfWidth = rect.width * canvasRatioW / 2;
        const canvasHalfHeight = rect.height * canvasRatioH / 2;
        const xC = (x - canvasHalfWidth) / canvasHalfWidth;
        const yC = (canvasHalfHeight - y) / canvasHalfHeight;
        return new Vector2(xC, yC);
    }
    convertWorldToCanvas(point) {
        const nPoint = new Vector3().copy(point).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        const canvasWidth = this.canvas.width / (this.canvas.width / rect.width) || 0;
        const canvasHeight = this.canvas.height / (this.canvas.height / rect.height) || 0;
        const x = (nPoint.x + 1) * canvasWidth / 2;
        const y = (nPoint.y - 1) * canvasHeight / -2;
        return new Vector2(x, y);
    }
    convertWorldToCanvasZeroCenter(point) {
        const nPoint = new Vector3().copy(point).project(this.camera);
        if (nPoint.z > 1) {
            nPoint.x = -nPoint.x;
            nPoint.y = -nPoint.y;
        }
        const rect = this.canvas.getBoundingClientRect();
        const canvasWidth = this.canvas.width / (this.canvas.width / rect.width) || 0;
        const canvasHeight = this.canvas.height / (this.canvas.height / rect.height) || 0;
        const x = nPoint.x * canvasWidth / 2;
        const y = nPoint.y * canvasHeight / 2;
        return new Vector2(x, y);
    }
    prepareToRender(focusObjects = null) {
        if (focusObjects === null || focusObjects === void 0 ? void 0 : focusObjects.length) {
            this._cameraService.focusCameraOnObjects(focusObjects);
        }
        if (this._meshesNeedColorUpdate.size) {
            this._scenesService.renderScene.updateMeshColors(this._meshesNeedColorUpdate);
            this._meshesNeedColorUpdate.clear();
        }
    }
}

class PickingScene {
    constructor() {
        this._materials = [];
        this._releasedMaterials = [];
        this._pickingMeshBySourceMesh = new Map();
        this._sourceMeshByPickingColor = new Map();
        this._lastPickingColor = 0;
        const scene = new Scene();
        scene.background = new Color(0);
        this._scene = scene;
        this._target = new WebGLRenderTarget(1, 1);
    }
    get scene() {
        return this._scene;
    }
    destroy() {
        this._materials.forEach(x => x.dispose());
        this._materials = null;
        this._target.dispose();
        this._target = null;
        this._pickingMeshBySourceMesh.clear();
        this._sourceMeshByPickingColor.clear();
    }
    ;
    add(sourceMesh) {
        const pickingMeshMaterial = this.getMaterial();
        const colorString = pickingMeshMaterial.color.getHex().toString(16);
        const pickingMesh = new Mesh(sourceMesh.geometry, pickingMeshMaterial);
        pickingMesh.userData.sourceId = sourceMesh.userData.id;
        pickingMesh.userData.sourceUuid = sourceMesh.uuid;
        pickingMesh.userData.color = colorString;
        pickingMesh.position.copy(sourceMesh.position);
        pickingMesh.rotation.copy(sourceMesh.rotation);
        pickingMesh.scale.copy(sourceMesh.scale);
        this._scene.add(pickingMesh);
        this._pickingMeshBySourceMesh.set(sourceMesh, pickingMesh);
        this._sourceMeshByPickingColor.set(colorString, sourceMesh);
    }
    remove(sourceMesh) {
        const pickingMesh = this._pickingMeshBySourceMesh.get(sourceMesh);
        if (pickingMesh) {
            this._scene.remove(pickingMesh);
            this._pickingMeshBySourceMesh.delete(sourceMesh);
            this._sourceMeshByPickingColor.delete(pickingMesh.userData.color);
            this.releaseMaterial(pickingMesh.material);
        }
    }
    getSourceMeshAt(camera, renderer, canvasPosition) {
        return this.getSourceMeshAtPosition(camera, renderer, canvasPosition);
    }
    getPickingMeshAt(camera, renderer, canvasPosition) {
        const sourceMesh = this.getSourceMeshAtPosition(camera, renderer, canvasPosition);
        return sourceMesh
            ? this._pickingMeshBySourceMesh.get(sourceMesh)
            : null;
    }
    getSourceMeshAtPosition(camera, renderer, position) {
        const context = renderer.getContext();
        this._pickingMeshBySourceMesh.forEach((picking, source) => {
            var _a;
            picking.visible = !!((_a = ColorRgbRmo.getFromMesh(source)) === null || _a === void 0 ? void 0 : _a.opacity);
        });
        camera.setViewOffset(context.drawingBufferWidth, context.drawingBufferHeight, position.x, position.y, 1, 1);
        renderer.setRenderTarget(this._target);
        renderer.render(this._scene, camera);
        renderer.setRenderTarget(null);
        camera.clearViewOffset();
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
        const material = new MeshBasicMaterial({
            color: color,
            blending: NoBlending,
            side: DoubleSide,
        });
        this._materials.push(material);
        return material;
    }
    releaseMaterial(material) {
        this._releasedMaterials.push(material);
    }
}

class PickingService {
    constructor(loaderService) {
        this.onLoaderMeshLoaded = (mesh) => {
            this.addMesh(mesh);
        };
        this.onLoaderMeshUnloaded = (mesh) => {
            this.removeMesh(mesh);
        };
        if (!loaderService) {
            throw new Error("LoaderService is not defined");
        }
        this._loaderService = loaderService;
        this._loaderService.addMeshCallback("mesh-loaded", this.onLoaderMeshLoaded);
        this._loaderService.addMeshCallback("mesh-unloaded", this.onLoaderMeshUnloaded);
        this._pickingScene = new PickingScene();
        this._raycaster = new Raycaster();
    }
    get scene() {
        return this._pickingScene.scene;
    }
    destroy() {
        var _a;
        this._loaderService.removeCallback("mesh-loaded", this.onLoaderMeshLoaded);
        this._loaderService.removeCallback("mesh-unloaded", this.onLoaderMeshUnloaded);
        (_a = this._pickingScene) === null || _a === void 0 ? void 0 : _a.destroy();
        this._pickingScene = null;
    }
    getMeshAt(renderService, clientX, clientY) {
        const position = renderService.convertClientToCanvas(clientX, clientY);
        return this._pickingScene.getSourceMeshAt(renderService.camera, renderService.renderer, position);
    }
    getSnapPointAt(renderService, clientX, clientY) {
        const position = renderService.convertClientToCanvas(clientX, clientY);
        const pickingMesh = this._pickingScene.getPickingMeshAt(renderService.camera, renderService.renderer, position);
        const point = pickingMesh
            ? this.getMeshSnapPointAtPosition(renderService.camera, renderService.renderer, position, pickingMesh)
            : null;
        const snapPoint = point
            ? { meshId: pickingMesh.userData.sourceId, position: Vec4DoubleCS.fromVector3(point) }
            : null;
        return snapPoint;
    }
    getMeshIdsInArea(renderService, clientStartX, clientStartY, clientEndX, clientEndY) {
        const canvasStart = renderService.convertClientToCanvas(clientStartX, clientStartY);
        const canvasEnd = renderService.convertClientToCanvas(clientEndX, clientEndY);
        const minAreaCX = Math.min(canvasStart.x, canvasEnd.x);
        const minAreaCY = Math.min(canvasStart.y, canvasEnd.y);
        const maxAreaCX = Math.max(canvasStart.x, canvasEnd.x);
        const maxAreaCY = Math.max(canvasStart.y, canvasEnd.y);
        const centerPointTemp = new Vector3();
        const ids = [];
        for (const x of this.scene.children) {
            if (!(x instanceof Mesh)) {
                continue;
            }
            if (x.geometry.boundingSphere === null) {
                x.geometry.computeBoundingSphere();
            }
            centerPointTemp.copy(x.geometry.boundingSphere.center);
            x.updateMatrixWorld();
            centerPointTemp.applyMatrix4(x.matrixWorld);
            const canvasCoords = renderService.convertWorldToCanvas(centerPointTemp);
            if (canvasCoords.x < minAreaCX
                || canvasCoords.x > maxAreaCX
                || canvasCoords.y < minAreaCY
                || canvasCoords.y > maxAreaCY) {
                continue;
            }
            ids.push(x.userData.sourceId);
        }
        return ids;
    }
    getMeshesInArea(renderService, clientStartX, clientStartY, clientEndX, clientEndY) {
        const ids = this.getMeshIdsInArea(renderService, clientStartX, clientStartY, clientEndX, clientEndY);
        const { found } = this._loaderService.findMeshesByIds(new Set(ids));
        return found;
    }
    addMesh(mesh) {
        this._pickingScene.add(mesh);
    }
    removeMesh(mesh) {
        this._pickingScene.remove(mesh);
    }
    getMeshSnapPointAtPosition(camera, renderer, position, mesh) {
        if (!mesh) {
            return null;
        }
        const context = renderer.getContext();
        const xNormalized = position.x / context.drawingBufferWidth * 2 - 1;
        const yNormalized = position.y / context.drawingBufferHeight * -2 + 1;
        return this.getPoint(camera, mesh, new Vector2(xNormalized, yNormalized));
    }
    getPoint(camera, mesh, mousePoint) {
        this._raycaster.setFromCamera(mousePoint, camera);
        const intersection = this._raycaster.intersectObject(mesh)[0];
        if (!intersection) {
            return null;
        }
        const intersectionPoint = new Vector3().copy(intersection.point);
        intersection.object.worldToLocal(intersectionPoint);
        const snapPoint = new Vector3().copy(this.getNearestVertex(mesh, intersectionPoint, intersection.face));
        if (!snapPoint) {
            return null;
        }
        intersection.object.localToWorld(snapPoint);
        return snapPoint;
    }
    getNearestVertex(mesh, point, face) {
        const a = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, face.a);
        const b = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, face.b);
        const c = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, face.c);
        const baryPoint = new Vector3();
        new Triangle(a, b, c).getBarycoord(point, baryPoint);
        if (baryPoint.x > baryPoint.y && baryPoint.x > baryPoint.z) {
            return a;
        }
        else if (baryPoint.y > baryPoint.x && baryPoint.y > baryPoint.z) {
            return b;
        }
        else if (baryPoint.z > baryPoint.x && baryPoint.z > baryPoint.y) {
            return c;
        }
        else {
            return null;
        }
    }
}

class HighlightService {
    constructor(pickingService) {
        this._highlightedMeshes = new Set();
        if (!pickingService) {
            throw new Error("PickingService is not defined");
        }
        this._pickingService = pickingService;
    }
    destroy() {
    }
    highlightInArea(renderService, clientMinX, clientMinY, clientMaxX, clientMaxY) {
        const found = this._pickingService.getMeshesInArea(renderService, clientMinX, clientMinY, clientMaxX, clientMaxY);
        this.highlightMeshes(renderService, found);
    }
    highlightAtPoint(renderService, clientX, clientY) {
        const mesh = this._pickingService.getMeshAt(renderService, clientX, clientY);
        if (mesh) {
            this.highlightMeshes(renderService, [mesh]);
        }
        else {
            this.highlightMeshes(renderService, []);
        }
    }
    clearHighlight(renderService) {
        this.highlightMeshes(renderService, []);
    }
    highlightMeshes(renderService, meshes) {
        const meshSet = new Set(meshes || []);
        const addToHighlightList = [];
        const removeFromHighlightList = [];
        this._highlightedMeshes.forEach(mesh => {
            if (!meshSet.has(mesh)) {
                removeFromHighlightList.push(mesh);
            }
        });
        meshSet.forEach(mesh => {
            if (!this._highlightedMeshes.has(mesh)) {
                addToHighlightList.push(mesh);
            }
        });
        removeFromHighlightList.forEach(mesh => {
            mesh.userData.highlighted = undefined;
            renderService.enqueueMeshForColorUpdate(mesh);
            this._highlightedMeshes.delete(mesh);
        });
        addToHighlightList.forEach(mesh => {
            mesh.userData.highlighted = true;
            renderService.enqueueMeshForColorUpdate(mesh);
            this._highlightedMeshes.add(mesh);
        });
        renderService.render();
    }
}

class SelectionService {
    constructor(loaderService, pickingService) {
        this._selectionChange = new BehaviorSubject(new Set());
        this._manualSelectionChange = new Subject();
        this._queuedSelection = null;
        this._selectedMeshes = [];
        this._isolatedMeshes = [];
        this._focusOnProgrammaticSelection = true;
        this.onLoaderModelUnloaded = (modelGuid) => {
            this.removeModelMeshesFromSelectionArrays(modelGuid);
        };
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
    set focusOnProgrammaticSelection(value) {
        this._focusOnProgrammaticSelection = value;
    }
    get selectedIds() {
        return this._selectionChange.getValue();
    }
    destroy() {
        this._selectionChange.complete();
        this._manualSelectionChange.complete();
        this._loaderService.removeCallback("model-unloaded", this.onLoaderModelUnloaded);
    }
    select(renderService, ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loaderService.loadingInProgress) {
            this._queuedSelection = { ids, isolate: false };
            return;
        }
        this.findAndSelectMeshes(renderService, ids, false);
    }
    ;
    isolate(renderService, ids) {
        if (!(ids === null || ids === void 0 ? void 0 : ids.length)) {
            return;
        }
        if (this._loaderService.loadingInProgress) {
            this._queuedSelection = { ids, isolate: true };
            return;
        }
        this.findAndSelectMeshes(renderService, ids, true);
    }
    ;
    isolateSelected(renderService) {
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
    selectMeshAtPoint(renderService, keepPreviousSelection, clientX, clientY) {
        const mesh = this._pickingService.getMeshAt(renderService, clientX, clientY);
        if (!mesh) {
            this.applySelection(renderService, [], true, false);
            return;
        }
        let meshes;
        if (keepPreviousSelection) {
            if (mesh.userData.selected) {
                meshes = this._selectedMeshes.filter(x => x !== mesh);
            }
            else {
                meshes = [mesh, ...this._selectedMeshes];
            }
        }
        else {
            meshes = [mesh];
        }
        this.applySelection(renderService, meshes, true, false);
    }
    selectMeshesInArea(renderService, previousSelection, clientMinX, clientMinY, clientMaxX, clientMaxY) {
        const ids = this._pickingService.getMeshIdsInArea(renderService, clientMinX, clientMinY, clientMaxX, clientMaxY) || [];
        const idSet = new Set(ids);
        const { found } = this._loaderService.findMeshesByIds(idSet);
        let meshes;
        if (previousSelection === "keep") {
            meshes = [...found, ...this._selectedMeshes];
        }
        else if (previousSelection === "subtract") {
            meshes = [...this._selectedMeshes.filter(x => !idSet.has(x.userData.id))];
        }
        else {
            meshes = found;
        }
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.clearSelection(renderService);
        }
        else {
            this.applySelection(renderService, meshes, true, false);
        }
    }
    runQueuedSelection(renderService) {
        if (this._queuedSelection) {
            const { ids, isolate } = this._queuedSelection;
            this.findAndSelectMeshes(renderService, ids, isolate);
        }
    }
    reset(renderService) {
        this.clearSelection(renderService);
        this.clearIsolation(renderService);
    }
    findAndSelectMeshes(renderService, ids, isolate) {
        const { found } = this._loaderService.findMeshesByIds(new Set(ids));
        if (found.length) {
            this.applySelection(renderService, found, false, isolate);
        }
    }
    clearSelection(renderService) {
        for (const mesh of this._selectedMeshes) {
            mesh.userData.selected = undefined;
            renderService.enqueueMeshForColorUpdate(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    clearIsolation(renderService) {
        for (const mesh of this._isolatedMeshes) {
            mesh.userData.isolated = undefined;
            renderService.enqueueMeshForColorUpdate(mesh);
        }
        this._isolatedMeshes.length = 0;
    }
    applySelection(renderService, meshes, manual, isolateSelected) {
        this.reset(renderService);
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
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
        }
        else {
            this.emitSelectionChanged(renderService, manual, true);
        }
    }
    removeModelMeshesFromSelectionArrays(modelGuid) {
        this._selectedMeshes = this._selectedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
        this._isolatedMeshes = this._isolatedMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    }
    emitSelectionChanged(renderService, manual, render) {
        if (render) {
            renderService.render(manual || !this._focusOnProgrammaticSelection
                ? null
                : this._selectedMeshes);
        }
        const ids = new Set();
        this._selectedMeshes.forEach(x => ids.add(x.userData.id));
        this._selectionChange.next(ids);
        if (manual) {
            this._manualSelectionChange.next(ids);
        }
    }
}

class ColoringService {
    constructor(loaderService, selectionService) {
        this._queuedColoring = null;
        this._coloredMeshes = [];
        this.onLoaderModelUnloaded = (modelGuid) => {
            this.removeFromColoringArrays(modelGuid);
        };
        if (!loaderService) {
            throw new Error("LoaderService is not defined");
        }
        if (!selectionService) {
            throw new Error("SelectionService is not defined");
        }
        this._loaderService = loaderService;
        this._selectionService = selectionService;
        this._loaderService.addModelCallback("model-unloaded", this.onLoaderModelUnloaded);
    }
    destroy() {
        this._loaderService.removeCallback("model-unloaded", this.onLoaderModelUnloaded);
    }
    color(renderService, coloringInfos) {
        if (this._loaderService.loadingInProgress) {
            this._queuedColoring = coloringInfos;
            return;
        }
        this.resetSelectionAndColorMeshes(renderService, coloringInfos);
    }
    runQueuedColoring(renderService) {
        if (this._queuedColoring) {
            this.resetSelectionAndColorMeshes(renderService, this._queuedColoring);
        }
    }
    removeFromColoringArrays(modelGuid) {
        this._coloredMeshes = this._coloredMeshes.filter(x => x.userData.modelGuid !== modelGuid);
    }
    resetSelectionAndColorMeshes(renderService, coloringInfos) {
        this._selectionService.reset(renderService);
        this.colorMeshes(renderService, coloringInfos);
    }
    colorMeshes(renderService, coloringInfos) {
        this.removeColoring(renderService);
        if (coloringInfos === null || coloringInfos === void 0 ? void 0 : coloringInfos.length) {
            for (const info of coloringInfos) {
                const color = new Color(info.color);
                const customColor = new ColorRgbRmo(color.r, color.g, color.b, 1, 0, info.opacity);
                info.ids.forEach(x => {
                    const meshes = this._loaderService.getLoadedMeshesById(x);
                    if (meshes === null || meshes === void 0 ? void 0 : meshes.length) {
                        meshes.forEach(mesh => {
                            mesh.userData.colored = true;
                            ColorRgbRmo.setCustomToMesh(mesh, customColor);
                            renderService.enqueueMeshForColorUpdate(mesh);
                            this._coloredMeshes.push(mesh);
                        });
                    }
                });
            }
        }
        renderService.render();
    }
    removeColoring(renderService) {
        for (const mesh of this._coloredMeshes) {
            mesh.userData.colored = undefined;
            ColorRgbRmo.deleteFromMesh(mesh, true);
            renderService.enqueueMeshForColorUpdate(mesh);
        }
        this._coloredMeshes.length = 0;
    }
}

class HudService {
    constructor(scenesService, pickingService) {
        if (!scenesService) {
            throw new Error("ScenesService is not defined");
        }
        if (!pickingService) {
            throw new Error("PickingService is not defined");
        }
        this._scenesService = scenesService;
        this._pickingService = pickingService;
    }
    destroy() {
    }
    setVertexSnapAtPoint(renderService, clientX, clientY) {
        if (!renderService) {
            return;
        }
        const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);
        this._scenesService.hudScene.pointSnap.setSnapPoint(snapPoint);
        renderService.render();
    }
    selectVertexAtPoint(renderService, clientX, clientY) {
        if (!renderService) {
            return;
        }
        const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);
        this._scenesService.hudScene.pointSnap.setSelectedSnapPoints(snapPoint ? [snapPoint] : null);
        renderService.render();
    }
    highlightSpriteAtPoint(renderService, clientX, clientY) {
        if (!renderService) {
            return;
        }
        const point = renderService.convertClientToCanvasZeroCenter(clientX, clientY);
        const marker = this._scenesService.hudScene.markers.getMarkerAtCanvasPoint(point);
        this._scenesService.hudScene.markers.highlightMarker(marker);
        renderService.render();
    }
    selectSpriteAtPoint(renderService, clientX, clientY) {
        if (!renderService) {
            return;
        }
        const point = renderService.convertClientToCanvasZeroCenter(clientX, clientY);
        const marker = this._scenesService.hudScene.markers.getMarkerAtCanvasPoint(point);
        this._scenesService.hudScene.markers.setSelectedMarkers(marker ? [marker.id] : null, true);
        renderService.render();
    }
    measureDistanceAtPoint(renderService, clientX, clientY) {
        if (!renderService) {
            return;
        }
        const snapPoint = this._pickingService.getSnapPointAt(renderService, clientX, clientY);
        const snapPosition = snapPoint === null || snapPoint === void 0 ? void 0 : snapPoint.position.toVec4();
        this._scenesService.hudScene.distanceMeasurer.setEndMarker(snapPoint
            ? new Vector3(snapPosition.x, snapPosition.y, snapPosition.z)
            : null);
        renderService.render();
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
    constructor(containerId, dracoDecoderPath, options) {
        this._subscriptions = [];
        this._pointerEventHelper = PointerEventHelper.default;
        this._modeChange = new BehaviorSubject(null);
        this._optionsChange = new BehaviorSubject(null);
        this._contextLoss = new BehaviorSubject(false);
        this._lastFrameTime = new BehaviorSubject(0);
        this.onRendererPointerDown = (e) => {
            if (!e.isPrimary || e.button === 1 || e.button === 2) {
                return;
            }
            this._pointerEventHelper.touch = e.pointerType === "touch";
            this._pointerEventHelper.allowArea = e.pointerType !== "touch" || this._options.cameraControlsDisabled;
            this._pointerEventHelper.downX = e.clientX;
            this._pointerEventHelper.downY = e.clientY;
        };
        this.onRendererPointerMove = (e) => {
            if (!e.isPrimary) {
                return;
            }
            if (!this._options.highlightingEnabled) {
                return;
            }
            const x = e.clientX;
            const y = e.clientY;
            if (this._interactionMode === "select_mesh") {
                const { downX, downY, allowArea, maxDiff } = this._pointerEventHelper;
                if (allowArea
                    && downX !== undefined && downX !== null && allowArea
                    && (Math.abs(x - downX) > maxDiff || Math.abs(y - downY) > maxDiff)) {
                    this._selectionFrame.show(this._container, downX, downY, x, y);
                }
            }
            clearTimeout(this._pointerEventHelper.mouseMoveTimer);
            this._pointerEventHelper.mouseMoveTimer = null;
            this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
                const { downX, downY, allowArea } = this._pointerEventHelper;
                switch (this._interactionMode) {
                    case "select_mesh":
                        if (downX !== undefined && downX !== null && allowArea) {
                            this._highlightService.highlightInArea(this._renderService, downX, downY, x, y);
                        }
                        else {
                            this._highlightService.highlightAtPoint(this._renderService, x, y);
                        }
                        break;
                    case "select_vertex":
                        this._highlightService.highlightAtPoint(this._renderService, x, y);
                        this._hudService.setVertexSnapAtPoint(this._renderService, x, y);
                        break;
                    case "select_sprite":
                        this._hudService.highlightSpriteAtPoint(this._renderService, x, y);
                        break;
                    case "measure_distance":
                        this._hudService.setVertexSnapAtPoint(this._renderService, x, y);
                        break;
                }
            }, 30);
        };
        this.onRendererPointerUp = (e) => {
            if (!e.isPrimary || e.button === 1 || e.button === 2) {
                return;
            }
            this._selectionFrame.hide();
            this._highlightService.clearHighlight(this._renderService);
            const x = e.clientX;
            const y = e.clientY;
            const { downX, downY, touch, allowArea, maxDiff } = this._pointerEventHelper;
            if (!downX) {
                return;
            }
            if (Math.abs(x - downX) > maxDiff
                || Math.abs(y - downY) > maxDiff) {
                if (this._interactionMode === "select_mesh" && allowArea) {
                    let previousSelection;
                    if (e.ctrlKey || touch) {
                        previousSelection = "keep";
                    }
                    else if (e.altKey) {
                        previousSelection = "subtract";
                    }
                    else {
                        previousSelection = "remove";
                    }
                    this._selectionService.selectMeshesInArea(this._renderService, previousSelection, downX, downY, x, y);
                }
                this.clearDownPoint();
                return;
            }
            switch (this._interactionMode) {
                case "select_mesh":
                    if (this._pointerEventHelper.waitForDouble) {
                        this._selectionService.isolateSelected(this._renderService);
                        this._pointerEventHelper.waitForDouble = false;
                    }
                    else {
                        this._pointerEventHelper.waitForDouble = true;
                        setTimeout(() => {
                            this._pointerEventHelper.waitForDouble = false;
                        }, 300);
                        this._selectionService.selectMeshAtPoint(this._renderService, e.ctrlKey || touch, x, y);
                    }
                    break;
                case "select_vertex":
                    this._hudService.selectVertexAtPoint(this._renderService, x, y);
                    break;
                case "select_sprite":
                    this._hudService.selectSpriteAtPoint(this._renderService, x, y);
                    break;
                case "measure_distance":
                    this._hudService.measureDistanceAtPoint(this._renderService, x, y);
                    break;
            }
            this.clearDownPoint();
        };
        this.onRendererContextLoss = () => {
            var _a;
            this._contextLoss.next(true);
            (_a = this._loaderService) === null || _a === void 0 ? void 0 : _a.closeAllModelsAsync();
        };
        this.onRendererContextRestore = () => {
            this._contextLoss.next(false);
        };
        this.initObservables();
        this._container = document.getElementById(containerId);
        if (!this._container) {
            throw new Error("Container not found!");
        }
        this._options = new GltfViewerOptions(options);
        this._optionsChange.next(this._options);
        this.initLoaderService(dracoDecoderPath);
        this.initCameraService();
        this.initPickingService();
        this.initHighlightService();
        this.initSelectionService();
        this.initColoringService();
        this.initScenesService();
        this.initHudService();
        this.initRenderService();
        this._containerResizeObserver = new ResizeObserver(() => {
            var _a;
            (_a = this._renderService) === null || _a === void 0 ? void 0 : _a.resizeRenderer();
        });
        this._containerResizeObserver.observe(this._container);
        this._selectionFrame = new SelectionFrame();
        this.setInteractionMode("select_mesh");
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        this._selectionFrame.destroy();
        this._selectionFrame = null;
        this._containerResizeObserver.disconnect();
        this._containerResizeObserver = null;
        (_a = this._renderService) === null || _a === void 0 ? void 0 : _a.destroy();
        this._renderService = null;
        (_b = this._hudService) === null || _b === void 0 ? void 0 : _b.destroy();
        this._hudService = null;
        (_c = this._scenesService) === null || _c === void 0 ? void 0 : _c.destroy();
        this._scenesService = null;
        (_d = this._coloringService) === null || _d === void 0 ? void 0 : _d.destroy();
        this._coloringService = null;
        (_e = this._selectionService) === null || _e === void 0 ? void 0 : _e.destroy();
        this._selectionService = null;
        (_f = this._highlightService) === null || _f === void 0 ? void 0 : _f.destroy();
        this._highlightService = null;
        (_g = this._pickingService) === null || _g === void 0 ? void 0 : _g.destroy();
        this._pickingService = null;
        (_h = this._cameraService) === null || _h === void 0 ? void 0 : _h.destroy();
        this._cameraService = null;
        (_j = this._loaderService) === null || _j === void 0 ? void 0 : _j.destroy();
        this._loaderService = null;
    }
    updateOptionsAsync(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const oldOptions = this._options;
            this._options = new GltfViewerOptions(options);
            this._renderService.options = this._options;
            let rendererReinitialized = false;
            let axesHelperUpdated = false;
            let lightsUpdated = false;
            let colorsUpdated = false;
            let materialsUpdated = false;
            let sceneUpdated = false;
            if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {
                this.initRenderService();
                rendererReinitialized = true;
            }
            if (this._options.axesHelperEnabled !== oldOptions.axesHelperEnabled
                || this._options.axesHelperPlacement !== oldOptions.axesHelperPlacement
                || this._options.axesHelperSize !== oldOptions.axesHelperSize) {
                this._scenesService.axes.updateOptions(this._options.axesHelperEnabled, this._options.axesHelperPlacement, this._options.axesHelperSize);
                axesHelperUpdated = true;
            }
            if (this._options.usePhysicalLights !== oldOptions.usePhysicalLights
                || this._options.ambientLightIntensity !== oldOptions.ambientLightIntensity
                || this._options.hemiLightIntensity !== oldOptions.hemiLightIntensity
                || this._options.dirLightIntensity !== oldOptions.dirLightIntensity) {
                this._renderService.renderer.physicallyCorrectLights = this._options.usePhysicalLights;
                this._scenesService.lights.update(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
                lightsUpdated = true;
            }
            if (this._options.isolationColor !== oldOptions.isolationColor
                || this._options.isolationOpacity !== oldOptions.isolationOpacity
                || this._options.selectionColor !== oldOptions.selectionColor
                || this._options.highlightColor !== oldOptions.highlightColor) {
                this._scenesService.renderScene.updateCommonColors({
                    isolationColor: this._options.isolationColor,
                    isolationOpacity: this._options.isolationOpacity,
                    selectionColor: this._options.selectionColor,
                    highlightColor: this._options.highlightColor
                });
                colorsUpdated = true;
            }
            if (rendererReinitialized || lightsUpdated || colorsUpdated) {
                this._scenesService.renderScene.updateSceneMaterials();
                this._scenesService.simplifiedScene.updateSceneMaterials();
                materialsUpdated = true;
            }
            if (this._options.meshMergeType !== oldOptions.meshMergeType
                || this._options.fastRenderType !== oldOptions.fastRenderType) {
                yield this._renderService.updateRenderSceneAsync();
                sceneUpdated = true;
            }
            if (!(materialsUpdated || sceneUpdated)
                && axesHelperUpdated) {
                this._renderService.render();
            }
            if (this._options.cameraControlsDisabled) {
                this._cameraService.disableControls();
            }
            else {
                this._cameraService.enableControls();
            }
            this._selectionService.focusOnProgrammaticSelection = this._options.selectionAutoFocusEnabled;
            this._optionsChange.next(this._options);
            return this._options;
        });
    }
    setInteractionMode(value) {
        if (this._interactionMode === value) {
            return;
        }
        switch (this._interactionMode) {
            case "select_mesh":
                break;
            case "select_vertex":
                this._scenesService.hudScene.pointSnap.reset();
                break;
            case "select_sprite":
                this._scenesService.hudScene.markers.highlightMarker(null);
                this._scenesService.hudScene.markers.resetSelectedMarkers();
                break;
            case "measure_distance":
                this._scenesService.hudScene.pointSnap.reset();
                this._scenesService.hudScene.distanceMeasurer.reset();
                break;
        }
        this._interactionMode = value;
        this._modeChange.next(value);
        this._renderService.render();
    }
    openModelsAsync(modelInfos) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._loaderService.openModelsAsync(modelInfos);
        });
    }
    ;
    closeModelsAsync(modelGuids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._loaderService.closeModelsAsync(modelGuids);
        });
    }
    ;
    getOpenedModels() {
        var _a;
        return (_a = this._loaderService) === null || _a === void 0 ? void 0 : _a.openedModelInfos;
    }
    colorItems(coloringInfos) {
        this._coloringService.color(this._renderService, coloringInfos);
    }
    selectItems(ids) {
        this._selectionService.select(this._renderService, ids);
    }
    ;
    isolateItems(ids) {
        this._selectionService.isolate(this._renderService, ids);
    }
    ;
    zoomToItems(ids) {
        if (ids === null || ids === void 0 ? void 0 : ids.length) {
            const { found } = this._loaderService.findMeshesByIds(new Set(ids));
            if (found.length) {
                this._renderService.render(found);
                return;
            }
        }
        this._renderService.renderWholeScene();
    }
    getSelectedItems() {
        return this._selectionService.selectedIds;
    }
    setMarkers(markers) {
        var _a;
        (_a = this._scenesService.hudScene) === null || _a === void 0 ? void 0 : _a.markers.setMarkers(markers);
        this._renderService.render();
    }
    selectMarkers(ids) {
        var _a;
        (_a = this._scenesService.hudScene) === null || _a === void 0 ? void 0 : _a.markers.setSelectedMarkers(ids, false);
        this._renderService.render();
    }
    initObservables() {
        this.modeChange$ = this._modeChange.asObservable();
        this.contextLoss$ = this._contextLoss.asObservable();
        this.optionsChange$ = this._optionsChange.asObservable();
        this.lastFrameTime$ = this._lastFrameTime.asObservable();
    }
    closeSubjects() {
        this._modeChange.complete();
        this._contextLoss.complete();
        this._optionsChange.complete();
        this._lastFrameTime.complete();
    }
    clearDownPoint() {
        this._pointerEventHelper.downX = null;
        this._pointerEventHelper.downY = null;
    }
    initLoaderService(dracoDecoderPath) {
        this._loaderService = new ModelLoaderService(dracoDecoderPath, this._options.basePoint);
        this._loaderService.addQueueCallback("queue-loaded", () => __awaiter(this, void 0, void 0, function* () {
            this._coloringService.runQueuedColoring(this._renderService);
            this._selectionService.runQueuedSelection(this._renderService);
            yield this._renderService.updateRenderSceneAsync();
        }));
        this.loadingStateChange$ = this._loaderService.loadingStateChange$;
        this.modelLoadingStart$ = this._loaderService.modelLoadingStart$;
        this.modelLoadingEnd$ = this._loaderService.modelLoadingEnd$;
        this.modelLoadingProgress$ = this._loaderService.modelLoadingProgress$;
        this.modelsOpenedChange$ = this._loaderService.modelsOpenedChange$;
    }
    initCameraService() {
        this._cameraService = new CameraService(this._container, () => {
            var _a;
            (_a = this._renderService) === null || _a === void 0 ? void 0 : _a.renderOnCameraMove();
        });
        if (this._options.cameraControlsDisabled) {
            this._cameraService.disableControls();
        }
        this.cameraPositionChange$ = this._cameraService.cameraPositionChange$;
    }
    initPickingService() {
        this._pickingService = new PickingService(this._loaderService);
    }
    initHighlightService() {
        this._highlightService = new HighlightService(this._pickingService);
    }
    initSelectionService() {
        this._selectionService = new SelectionService(this._loaderService, this._pickingService);
        this._selectionService.focusOnProgrammaticSelection = this._options.selectionAutoFocusEnabled;
        this.meshesSelectionChange$ = this._selectionService.selectionChange$;
        this.meshesManualSelectionChange$ = this._selectionService.manualSelectionChange$;
    }
    initColoringService() {
        this._coloringService = new ColoringService(this._loaderService, this._selectionService);
    }
    initScenesService() {
        this._scenesService = new ScenesService(this._container, this._cameraService, this._options);
        this.snapPointsHighlightChange$ = this._scenesService.hudScene.pointSnap.snapPointsHighlightChange$;
        this.snapPointsManualSelectionChange$ = this._scenesService.hudScene.pointSnap.snapPointsManualSelectionChange$;
        this.markersChange$ = this._scenesService.hudScene.markers.markersChange$;
        this.markersSelectionChange$ = this._scenesService.hudScene.markers.markersSelectionChange$;
        this.markersManualSelectionChange$ = this._scenesService.hudScene.markers.markersManualSelectionChange$;
        this.markersHighlightChange$ = this._scenesService.hudScene.markers.markersHighlightChange$;
        this.distanceMeasureChange$ = this._scenesService.hudScene.distanceMeasurer.distanceMeasureChange$;
    }
    initHudService() {
        this._hudService = new HudService(this._scenesService, this._pickingService);
    }
    initRenderService() {
        if (this._renderService) {
            this._renderService.destroy();
            this._renderService = null;
        }
        this._renderService = new RenderService(this._container, this._loaderService, this._cameraService, this._scenesService, this._options, this._lastFrameTime);
        this._renderService.addRendererEventListener("webglcontextlost", this.onRendererContextLoss);
        this._renderService.addRendererEventListener("webglcontextrestored ", this.onRendererContextRestore);
        this._renderService.addRendererEventListener("pointerdown", this.onRendererPointerDown);
        this._renderService.addRendererEventListener("pointermove", this.onRendererPointerMove);
        this._renderService.addRendererEventListener("pointerup", this.onRendererPointerUp);
        this._renderService.addRendererEventListener("pointerout", this.onRendererPointerUp);
        this._renderService.addRendererEventListener("pointerleave", this.onRendererPointerUp);
    }
}

export { Distance, GltfViewer, GltfViewerOptions, Vec4DoubleCS };
