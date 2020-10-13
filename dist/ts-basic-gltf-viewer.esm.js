import { BehaviorSubject, Subject, AsyncSubject } from 'rxjs';
import { first } from 'rxjs/operators';
import { PerspectiveCamera, Box3, Vector3, AmbientLight, HemisphereLight, DirectionalLight, MeshPhysicalMaterial, NormalBlending, DoubleSide, Color, MeshPhongMaterial, MeshBasicMaterial, NoBlending, LineBasicMaterial, CanvasTexture, SpriteMaterial, Quaternion, Object3D, Vector4, OrthographicCamera, Sprite, SphereBufferGeometry, Mesh, Scene, Uint32BufferAttribute, Uint8BufferAttribute, Float32BufferAttribute, BufferGeometry, Raycaster, Vector2, Triangle, WebGLRenderTarget, WebGLRenderer, sRGBEncoding, NoToneMapping, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { ResizeSensor } from 'css-element-queries';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull';

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
class Vec4 {
    constructor(x, y, z, w = 0, toZup = false) {
        this.x = x;
        if (toZup) {
            this.y = -z;
            this.z = y;
        }
        else {
            this.y = y;
            this.z = z;
        }
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
class Distance {
    constructor(start, end, toZup) {
        this.start = new Vec4(start.x, start.y, start.z, 0, toZup);
        this.end = new Vec4(end.x, end.y, end.z, 0, toZup);
        this.distance = Vec4.getDistance(this.start, this.end);
    }
}

class GltfViewerOptions {
    constructor(item = null) {
        this.useAntialiasing = false;
        this.usePhysicalLights = false;
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
        this.showAxesHelper = true;
        if (item != null) {
            Object.assign(this, item);
        }
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
        this._changeCallback = changeCallback;
        this._camera = camera;
        this._orbitControls = orbitControls;
    }
    get camera() {
        return this._camera;
    }
    changeCanvas(rendererCanvas) {
        this._orbitControls.dispose();
        this._orbitControls = new OrbitControls(this.camera, rendererCanvas);
        this._orbitControls.addEventListener("change", this._changeCallback);
        if (this._lastFocusBox) {
            this.focusCameraOnBox(this._lastFocusBox);
        }
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
        this._lastFocusBox = box;
        this.focusCameraOnBox(box);
    }
    focusCameraOnBox(box) {
        const offset = 1.2;
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

class ColorRgbRmo {
    constructor(r, g, b, roughness, metalness, opacity) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.roughness = roughness;
        this.metalness = metalness;
        this.opacity = opacity;
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
            flatShading: true,
            blending: NoBlending,
            side: DoubleSide,
        });
    }
    static buildLineBasicMaterial(color, width) {
        return new LineBasicMaterial({ color, linewidth: width });
    }
    static buildLineMaterial(color, width) {
        return new LineMaterial({ color, linewidth: width });
    }
    static buildAxisSpriteMaterial(size, color, text) {
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
        const texture = new CanvasTexture(canvas);
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
    static buildCircleSpriteMaterial(size, color) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fill();
        const texture = new CanvasTexture(canvas);
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
    static buildSquareSpriteMaterial(size, color) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fillRect(0, 0, size, size);
        const texture = new CanvasTexture(canvas);
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
    static buildTriangleSpriteMaterial(size, color) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.moveTo(0, size);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(size, size);
        ctx.closePath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fill();
        const texture = new CanvasTexture(canvas);
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
    static buildDiamondSpriteMaterial(size, color) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.moveTo(0, size / 2);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(size, size / 2);
        ctx.lineTo(size / 2, size);
        ctx.closePath();
        ctx.fillStyle = new Color(color).getStyle();
        ctx.fill();
        const texture = new CanvasTexture(canvas);
        return new SpriteMaterial({ map: texture, toneMapped: false });
    }
}

class Axes extends Object3D {
    constructor(size = 128) {
        super();
        this._viewportBak = new Vector4();
        this._axisMaterials = new Array(3);
        this._axisLabelMaterials = new Array(6);
        this._size = size;
        this._camera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
        this._camera.position.set(0, 0, 2);
        this.buildAxes();
    }
    destroy() {
        this.destroyAxes();
    }
    render(mainCamera, renderer) {
        this.quaternion.copy(mainCamera.quaternion).inverse();
        this.quaternion.multiply(Axes._toZUp);
        this.updateMatrixWorld();
        renderer.getViewport(this._viewportBak);
        renderer.autoClear = false;
        renderer.setViewport(renderer.getContext().drawingBufferWidth - this._size, renderer.getContext().drawingBufferHeight - this._size, this._size, this._size);
        renderer.render(this, this._camera);
        renderer.setViewport(this._viewportBak.x, this._viewportBak.y, this._viewportBak.z, this._viewportBak.w);
        renderer.autoClear = true;
    }
    buildAxes() {
        this._axisMaterials[0] = MaterialBuilder.buildLineMaterial(0xFF3653, 0.02);
        this._axisMaterials[1] = MaterialBuilder.buildLineMaterial(0x8adb00, 0.02);
        this._axisMaterials[2] = MaterialBuilder.buildLineMaterial(0x2c8FFF, 0.02);
        this._axisLabelMaterials[0] = MaterialBuilder.buildAxisSpriteMaterial(64, 0xFF3653, "X");
        this._axisLabelMaterials[1] = MaterialBuilder.buildAxisSpriteMaterial(64, 0xA32235, "-X");
        this._axisLabelMaterials[2] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x8ADB00, "Y");
        this._axisLabelMaterials[3] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x588C00, "-Y");
        this._axisLabelMaterials[4] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x2C8FFF, "Z");
        this._axisLabelMaterials[5] = MaterialBuilder.buildAxisSpriteMaterial(64, 0x1C5BA3, "-Z");
        this._axisGeometry = new LineGeometry();
        this._axisGeometry.setPositions([0, 0, 0, 0.8, 0, 0]);
        this.xAxis = new Line2(this._axisGeometry, this._axisMaterials[0]);
        this.yAxis = new Line2(this._axisGeometry, this._axisMaterials[1]);
        this.zAxis = new Line2(this._axisGeometry, this._axisMaterials[2]);
        this.yAxis.rotation.z = Math.PI / 2;
        this.zAxis.rotation.y = -Math.PI / 2;
        this.add(this.xAxis);
        this.add(this.yAxis);
        this.add(this.zAxis);
        this.xLabel = new Sprite(this._axisLabelMaterials[0]);
        this.xLabelN = new Sprite(this._axisLabelMaterials[1]);
        this.yLabel = new Sprite(this._axisLabelMaterials[2]);
        this.yLabelN = new Sprite(this._axisLabelMaterials[3]);
        this.zLabel = new Sprite(this._axisLabelMaterials[4]);
        this.zLabelN = new Sprite(this._axisLabelMaterials[5]);
        this.xLabel.position.x = 1;
        this.yLabel.position.y = 1;
        this.zLabel.position.z = 1;
        this.xLabelN.position.x = -1;
        this.yLabelN.position.y = -1;
        this.zLabelN.position.z = -1;
        this.xLabelN.scale.setScalar(0.8);
        this.yLabelN.scale.setScalar(0.8);
        this.zLabelN.scale.setScalar(0.8);
        this.add(this.xLabel);
        this.add(this.yLabel);
        this.add(this.zLabel);
        this.add(this.xLabelN);
        this.add(this.yLabelN);
        this.add(this.zLabelN);
    }
    destroyAxes() {
        var _a, _b;
        this._axisGeometry.dispose();
        (_a = this._axisMaterials) === null || _a === void 0 ? void 0 : _a.forEach(x => x.dispose());
        this._axisMaterials = null;
        (_b = this._axisLabelMaterials) === null || _b === void 0 ? void 0 : _b.forEach(x => { x.map.dispose(); x.dispose(); });
        this._axisLabelMaterials = null;
    }
}
Axes._toZUp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class RenderScene {
    constructor(isolationColor, isolationOpacity, selectionColor, highlightColor) {
        this._geometries = [];
        this._materials = new Map();
        this._markerMaterials = [];
        this._lineMaterials = [];
        this._markers = new Map();
        this._lines = new Map();
        this._geometryIndexBySourceMesh = new Map();
        this._sourceMeshesByGeometryIndex = new Map();
        this._renderMeshBySourceMesh = new Map();
        this._geometryIndicesNeedSort = new Set();
        this.updateCommonColors(isolationColor, isolationOpacity, selectionColor, highlightColor);
        this._globalMaterial = MaterialBuilder.buildGlobalMaterial();
        this.buildMarkers();
        this.buildLines();
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
        this.destroyMarkers();
        this.destroyLines();
    }
    updateSceneAsync(lights, meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
            this.deleteScene();
            yield this.createSceneAsync(lights, meshes, models, meshMergeType);
        });
    }
    updateSceneMaterials() {
        this._globalMaterial.needsUpdate = true;
        this._materials.forEach(v => v.needsUpdate = true);
    }
    updateResolution(rendererBufferWidth, rendererBufferHeight) {
        this._lineMaterials.forEach(x => x.resolution.set(rendererBufferWidth, rendererBufferHeight));
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
    updateCommonColors(isolationColor, isolationOpacity, selectionColor, highlightColor) {
        this._isolationColor = MaterialBuilder.buildIsolationColor(isolationColor, isolationOpacity);
        this._selectionColor = new Color(selectionColor);
        this._highlightColor = new Color(highlightColor);
    }
    setMarker(type, position) {
        const marker = this._markers.get(type);
        if (!marker.active) {
            this.scene.add(marker.mesh);
            marker.active = true;
        }
        marker.mesh.position.set(position.x, position.y, position.z);
    }
    resetMarker(type) {
        const marker = this._markers.get(type);
        if (marker.active) {
            this.scene.remove(marker.mesh);
            marker.active = false;
            marker.mesh.position.set(0, 0, 0);
        }
    }
    resetMarkers() {
        [...this._markers.keys()].forEach(x => this.resetMarker(x));
    }
    setSegment(type, start, end) {
        const lineInfo = this._lines.get(type);
        if (!lineInfo.active) {
            this.scene.add(lineInfo.line);
            lineInfo.active = true;
        }
        lineInfo.line.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    }
    resetSegment(type) {
        const lineInfo = this._lines.get(type);
        if (lineInfo.active) {
            this.scene.remove(lineInfo.line);
            lineInfo.active = false;
            lineInfo.line.geometry.setPositions([0, 0, 0, 0, 0, 0]);
        }
    }
    resetSegments() {
        [...this._lines.keys()].forEach(x => this.resetSegment(x));
    }
    buildMarkers() {
        this._markerMaterials[0] = MaterialBuilder.buildBasicMaterial(0xFF00FF);
        this._markerMaterials[1] = MaterialBuilder.buildBasicMaterial(0x391285);
        this._markerMaterials[2] = MaterialBuilder.buildBasicMaterial(0x00FFFF);
        this._markerGeometry = new SphereBufferGeometry(0.1, 16, 8);
        this._markers.set("temp", {
            mesh: new Mesh(this._markerGeometry, this._markerMaterials[0]),
            active: false,
            type: "temp",
        });
        this._markers.set("start", {
            mesh: new Mesh(this._markerGeometry, this._markerMaterials[1]),
            active: false,
            type: "start",
        });
        this._markers.set("end", {
            mesh: new Mesh(this._markerGeometry, this._markerMaterials[2]),
            active: false,
            type: "end",
        });
    }
    destroyMarkers() {
        var _a;
        this._markers = null;
        this._markerGeometry.dispose();
        this._markerGeometry = null;
        (_a = this._markerMaterials) === null || _a === void 0 ? void 0 : _a.forEach(x => x.dispose());
        this._markerMaterials = null;
    }
    buildLines() {
        this._lineMaterials[0] = MaterialBuilder.buildLineMaterial(0x0000FF, 2);
        const lineGeometry = new LineGeometry();
        lineGeometry.setPositions([0, 0, 0, 0, 0, 0]);
        const distanceLine = new Line2(lineGeometry, this._lineMaterials[0]);
        distanceLine.frustumCulled = false;
        this._lines.set("distance", {
            line: distanceLine,
            active: false,
            type: "distance",
        });
    }
    destroyLines() {
        var _a, _b;
        (_a = this._lines) === null || _a === void 0 ? void 0 : _a.forEach(v => v.line.geometry.dispose());
        this._lines = null;
        (_b = this._lineMaterials) === null || _b === void 0 ? void 0 : _b.forEach(x => x.dispose());
        this._lineMaterials = null;
    }
    deleteScene() {
        this._geometries.forEach(x => x.geometry.dispose());
        this._geometries.length = 0;
        this._geometryIndexBySourceMesh.clear();
        this._sourceMeshesByGeometryIndex.clear();
        this._renderMeshBySourceMesh.clear();
        this._geometryIndicesNeedSort.clear();
        this._markers.forEach(x => x.active = false);
        this._lines.forEach(x => x.active = false);
        this._scene = null;
    }
    createSceneAsync(lights, meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    const renderMesh = new Mesh(sourceMesh.geometry, material);
                    renderMesh.applyMatrix4(sourceMesh.matrix);
                    this._renderMeshBySourceMesh.set(sourceMesh, renderMesh);
                    scene.add(renderMesh);
                });
            }
            this._currentMergeType = meshMergeType;
            this._scene = scene;
        });
    }
    groupModelMeshesByMergeType(meshes, models, meshMergeType) {
        return __awaiter(this, void 0, void 0, function* () {
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
        return __awaiter(this, void 0, void 0, function* () {
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
            renderMesh.material = material;
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
            const { rgbRmo, opacityChanged } = this.refreshMeshColors(mesh);
            indicesBySourceMesh.get(mesh).forEach(i => {
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
    destroyMaterials() {
        this._globalMaterial.dispose();
        this._globalMaterial = null;
        this._materials.forEach(v => v.dispose());
        this._materials = null;
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
        return __awaiter$1(this, void 0, void 0, function* () {
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
        return __awaiter$1(this, void 0, void 0, function* () {
            if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
                return null;
            }
            const hullPoints = [];
            const hullChunkSize = 100;
            const hullChunk = (chunk) => {
                chunk.forEach(x => {
                    const hull = new ConvexHull().setFromObject(x);
                    hull.faces.forEach(f => {
                        let edge = f.edge;
                        do {
                            hullPoints.push(edge.head().point);
                            edge = edge.next;
                        } while (edge !== f.edge);
                    });
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
        return __awaiter$1(this, void 0, void 0, function* () {
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
        const boxPosition = new Float32BufferAttribute(boxPositionArray, 3).applyMatrix4(mesh.matrix).array;
        return boxPosition;
    }
}

class PointSnapHelper {
    constructor() {
        this.raycaster = new Raycaster();
    }
    static convertClientToCanvas(renderer, clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const pixelRatio = renderer.getPixelRatio();
        const x = (clientX - rect.left) * (renderer.domElement.width / rect.width) * pixelRatio || 0;
        const y = (clientY - rect.top) * (renderer.domElement.height / rect.height) * pixelRatio || 0;
        return new Vector2(x, y);
    }
    static convertWorldToCanvas(camera, renderer, point) {
        const nPoint = new Vector3().copy(point).project(camera);
        if (nPoint.x > 1 || nPoint.y < -1 || nPoint.y > 1 || nPoint.y < -1) {
            return null;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        const canvasWidth = renderer.domElement.width / (renderer.domElement.width / rect.width) || 0;
        const canvasHeight = renderer.domElement.height / (renderer.domElement.height / rect.height) || 0;
        const x = (nPoint.x + 1) * canvasWidth / 2;
        const y = (nPoint.y - 1) * canvasHeight / -2;
        return new Vector2(x, y);
    }
    destroy() {
    }
    getPoint(camera, mesh, mousePoint) {
        this.raycaster.setFromCamera(mousePoint, camera);
        const intersection = this.raycaster.intersectObject(mesh)[0];
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

class PickingScene {
    constructor() {
        this._lastPickingColor = 0;
        this._materials = [];
        this._releasedMaterials = [];
        this._pickingMeshById = new Map();
        this._sourceMeshByPickingColor = new Map();
        const scene = new Scene();
        scene.background = new Color(0);
        this._scene = scene;
        this._target = new WebGLRenderTarget(1, 1);
        this._pointSnap = new PointSnapHelper();
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
    getSourceMeshAt(camera, renderer, clientX, clientY) {
        const position = PointSnapHelper.convertClientToCanvas(renderer, clientX, clientY);
        return this.getSourceMeshAtPosition(camera, renderer, position);
    }
    getSnapPointAt(camera, renderer, clientX, clientY) {
        const position = PointSnapHelper.convertClientToCanvas(renderer, clientX, clientY);
        const mesh = this.getSourceMeshAtPosition(camera, renderer, position);
        if (!mesh) {
            return null;
        }
        return this.getMeshSnapPointAtPosition(camera, renderer, position, this._pickingMeshById.get(mesh.uuid));
    }
    getSourceMeshAtPosition(camera, renderer, position) {
        const context = renderer.getContext();
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
    getMeshSnapPointAtPosition(camera, renderer, position, mesh) {
        const context = renderer.getContext();
        const xNormalized = position.x / context.drawingBufferWidth * 2 - 1;
        const yNormalized = position.y / context.drawingBufferHeight * -2 + 1;
        const point = this._pointSnap.getPoint(camera, mesh, new Vector2(xNormalized, yNormalized));
        return point;
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
            flatShading: true,
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

var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
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
        this._optionsChange = new BehaviorSubject(null);
        this._loadingStateChange = new BehaviorSubject(false);
        this._modelLoadingStart = new Subject();
        this._modelLoadingEnd = new Subject();
        this._modelLoadingProgress = new Subject();
        this._openedModelsChange = new BehaviorSubject([]);
        this._selectionChange = new BehaviorSubject(new Set());
        this._manualSelectionChange = new Subject();
        this._lastFrameTime = new BehaviorSubject(0);
        this._snapPointChange = new Subject();
        this._distanceMeasureChange = new Subject();
        this._subscriptions = [];
        this._measureMode = false;
        this._measurePoints = { start: null, end: null };
        this._meshesNeedColorUpdate = new Set();
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
        this.onCanvasPointerDown = (e) => {
            this._pointerEventHelper.downX = e.clientX;
            this._pointerEventHelper.downY = e.clientY;
        };
        this.onCanvasPointerUp = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            if (!this._pointerEventHelper.downX
                || Math.abs(x - this._pointerEventHelper.downX) > this._pointerEventHelper.maxDiff
                || Math.abs(y - this._pointerEventHelper.downY) > this._pointerEventHelper.maxDiff) {
                return;
            }
            if (this._measureMode) {
                this.setMeasureMarkerAtPoint(x, y);
            }
            else {
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
            }
            this._pointerEventHelper.downX = null;
            this._pointerEventHelper.downY = null;
        };
        this.onCanvasMouseMove = (e) => {
            if (e.buttons) {
                return;
            }
            clearTimeout(this._pointerEventHelper.mouseMoveTimer);
            this._pointerEventHelper.mouseMoveTimer = null;
            this._pointerEventHelper.mouseMoveTimer = window.setTimeout(() => {
                const x = e.clientX;
                const y = e.clientY;
                this.highlightMeshAtPoint(x, y);
                if (this._measureMode) {
                    this.setTempMarkerAtPoint(x, y);
                }
            }, 30);
        };
        this.initObservables();
        this._container = document.getElementById(containerId);
        if (!this._container) {
            throw new Error("Container not found!");
        }
        this._options = new GltfViewerOptions(options);
        this._optionsChange.next(this._options);
        this._lights = new Lights(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
        this._pickingScene = new PickingScene();
        this._renderScene = new RenderScene(this._options.isolationColor, this._options.isolationOpacity, this._options.selectionColor, this._options.highlightColor);
        this._simplifiedScene = new SimplifiedScene();
        this._axes = new Axes();
        this.initLoader(dracoDecoderPath);
        this.initRenderer();
        this._containerResizeSensor = new ResizeSensor(this._container, () => {
            this.resizeRenderer();
        });
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this._subscriptions.forEach(x => x.unsubscribe());
        this.closeSubjects();
        (_a = this._containerResizeSensor) === null || _a === void 0 ? void 0 : _a.detach();
        this._containerResizeSensor = null;
        (_b = this._cameraControls) === null || _b === void 0 ? void 0 : _b.destroy();
        this._cameraControls = null;
        (_c = this._axes) === null || _c === void 0 ? void 0 : _c.destroy();
        this._axes = null;
        (_d = this._renderer) === null || _d === void 0 ? void 0 : _d.dispose();
        (_f = (_e = this._loader) === null || _e === void 0 ? void 0 : _e.dracoLoader) === null || _f === void 0 ? void 0 : _f.dispose();
        (_g = this._pickingScene) === null || _g === void 0 ? void 0 : _g.destroy();
        this._pickingScene = null;
        (_h = this._simplifiedScene) === null || _h === void 0 ? void 0 : _h.destroy();
        this._simplifiedScene = null;
        (_j = this._renderScene) === null || _j === void 0 ? void 0 : _j.destroy();
        this._renderScene = null;
        (_k = this._loadedMeshes) === null || _k === void 0 ? void 0 : _k.forEach(x => {
            x.geometry.dispose();
            x.material.dispose();
        });
        this._loadedMeshes = null;
    }
    updateOptionsAsync(options) {
        return __awaiter$2(this, void 0, void 0, function* () {
            const oldOptions = this._options;
            this._options = new GltfViewerOptions(options);
            let rendererReinitialized = false;
            let lightsUpdated = false;
            let colorsUpdated = false;
            let materialsUpdated = false;
            let sceneUpdated = false;
            if (this._options.useAntialiasing !== oldOptions.useAntialiasing) {
                this.initRenderer();
                rendererReinitialized = true;
            }
            if (this._options.usePhysicalLights !== oldOptions.usePhysicalLights
                || this._options.ambientLightIntensity !== oldOptions.ambientLightIntensity
                || this._options.hemiLightIntensity !== oldOptions.hemiLightIntensity
                || this._options.dirLightIntensity !== oldOptions.dirLightIntensity) {
                this._renderer.physicallyCorrectLights = this._options.usePhysicalLights;
                this._lights.update(this._options.usePhysicalLights, this._options.ambientLightIntensity, this._options.hemiLightIntensity, this._options.dirLightIntensity);
                lightsUpdated = true;
            }
            if (this._options.isolationColor !== oldOptions.isolationColor
                || this._options.isolationOpacity !== oldOptions.isolationOpacity
                || this._options.selectionColor !== oldOptions.selectionColor
                || this._options.highlightColor !== oldOptions.highlightColor) {
                this._renderScene.updateCommonColors(this._options.isolationColor, this._options.isolationOpacity, this._options.selectionColor, this._options.highlightColor);
                colorsUpdated = true;
            }
            if (rendererReinitialized || lightsUpdated || colorsUpdated) {
                this._renderScene.updateSceneMaterials();
                this._simplifiedScene.updateSceneMaterials();
                materialsUpdated = true;
            }
            if (this._options.meshMergeType !== oldOptions.meshMergeType
                || this._options.fastRenderType !== oldOptions.fastRenderType) {
                yield this.updateRenderSceneAsync();
                sceneUpdated = true;
            }
            if (this._options.showAxesHelper !== oldOptions.showAxesHelper
                && !(materialsUpdated || sceneUpdated)) {
                this.render();
            }
            if (this._options.highlightingEnabled !== oldOptions.highlightingEnabled) {
                if (this._options.highlightingEnabled) {
                    this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
                }
                else {
                    this._renderer.domElement.removeEventListener("mousemove", this.onCanvasMouseMove);
                }
            }
            this._optionsChange.next(this._options);
            return this._options;
        });
    }
    openModelsAsync(modelInfos) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(modelInfos === null || modelInfos === void 0 ? void 0 : modelInfos.length)) {
                return [];
            }
            const promises = [];
            modelInfos.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$2(this, void 0, void 0, function* () {
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
        return __awaiter$2(this, void 0, void 0, function* () {
            if (!(modelGuids === null || modelGuids === void 0 ? void 0 : modelGuids.length)) {
                return;
            }
            const promises = [];
            modelGuids.forEach(x => {
                const resultSubject = new AsyncSubject();
                this._loadingQueue.push(() => __awaiter$2(this, void 0, void 0, function* () {
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
    zoomToItems(ids) {
        if (ids === null || ids === void 0 ? void 0 : ids.length) {
            const { found } = this.findMeshesByIds(new Set(ids));
            if (found.length) {
                this.render(found);
                return;
            }
        }
        this.renderWholeScene();
    }
    toggleMeasureMode(value) {
        if (this._measureMode === value) {
            return;
        }
        if (this._measureMode) {
            this.clearMeasurements();
            this._measureMode = false;
        }
        else {
            this._measureMode = true;
        }
    }
    getOpenedModels() {
        return this._openedModelsChange.getValue();
    }
    getSelectedItems() {
        return this._selectionChange.getValue();
    }
    initObservables() {
        this.optionsChange$ = this._optionsChange.asObservable();
        this.loadingStateChange$ = this._loadingStateChange.asObservable();
        this.modelLoadingStart$ = this._modelLoadingStart.asObservable();
        this.modelLoadingProgress$ = this._modelLoadingProgress.asObservable();
        this.modelLoadingEnd$ = this._modelLoadingEnd.asObservable();
        this.openedModelsChange$ = this._openedModelsChange.asObservable();
        this.selectionChange$ = this._selectionChange.asObservable();
        this.manualSelectionChange$ = this._manualSelectionChange.asObservable();
        this.lastFrameTime$ = this._lastFrameTime.asObservable();
        this.snapPointChange$ = this._snapPointChange.asObservable();
        this.distanceMeasureChange$ = this._distanceMeasureChange.asObservable();
    }
    closeSubjects() {
        this._optionsChange.complete();
        this._loadingStateChange.complete();
        this._modelLoadingStart.complete();
        this._modelLoadingProgress.complete();
        this._modelLoadingEnd.complete();
        this._openedModelsChange.complete();
        this._selectionChange.complete();
        this._manualSelectionChange.complete();
        this._lastFrameTime.complete();
        this._snapPointChange.complete();
        this._distanceMeasureChange.complete();
    }
    addCanvasEventListeners() {
        const { highlightingEnabled } = this._options;
        this._renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerDown);
        this._renderer.domElement.addEventListener("pointerup", this.onCanvasPointerUp);
        if (highlightingEnabled) {
            this._renderer.domElement.addEventListener("mousemove", this.onCanvasMouseMove);
        }
    }
    initRenderer() {
        if (this._renderer) {
            this._renderer.domElement.remove();
            this._renderer.dispose();
            this._renderer.forceContextLoss();
            this._renderer = null;
        }
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
        this.addCanvasEventListeners();
        if (this._cameraControls) {
            this._cameraControls.changeCanvas(this._renderer.domElement);
        }
        else {
            this._cameraControls = new CameraControls(this._renderer.domElement, () => this.renderOnCameraMove());
        }
        this._container.append(this._renderer.domElement);
    }
    resizeRenderer() {
        var _a;
        const { width, height } = this._container.getBoundingClientRect();
        (_a = this._cameraControls) === null || _a === void 0 ? void 0 : _a.resize(width, height);
        if (this._renderer) {
            this._renderer.setSize(width, height, false);
            if (this._renderScene) {
                const ctx = this._renderer.getContext();
                this._renderScene.updateResolution(ctx.drawingBufferWidth, ctx.drawingBufferHeight);
            }
            this.render();
        }
    }
    updateRenderSceneAsync() {
        return __awaiter$2(this, void 0, void 0, function* () {
            yield this._renderScene.updateSceneAsync(this._lights.getLights(), this._loadedMeshesArray, this._loadedModelsArray, this._options.meshMergeType);
            if (this._options.fastRenderType) {
                yield this._simplifiedScene.updateSceneAsync(this._lights.getCopy(), this._loadedMeshesArray, this._options.fastRenderType);
            }
            else {
                this._simplifiedScene.clearScene();
            }
            this.renderWholeScene();
        });
    }
    prepareToRender(focusObjects = null) {
        if (focusObjects === null || focusObjects === void 0 ? void 0 : focusObjects.length) {
            this._cameraControls.focusCameraOnObjects(focusObjects);
        }
        if (this._meshesNeedColorUpdate.size) {
            this._renderScene.updateMeshColors(this._meshesNeedColorUpdate);
            this._meshesNeedColorUpdate.clear();
        }
    }
    render(focusObjects = null, fast = false) {
        this.prepareToRender(focusObjects);
        requestAnimationFrame(() => {
            var _a, _b, _c;
            if (!this._renderer) {
                return;
            }
            const start = performance.now();
            if (fast && ((_a = this._simplifiedScene) === null || _a === void 0 ? void 0 : _a.scene)) {
                this._renderer.render(this._simplifiedScene.scene, this._cameraControls.camera);
            }
            else if ((_b = this._renderScene) === null || _b === void 0 ? void 0 : _b.scene) {
                this._renderer.render(this._renderScene.scene, this._cameraControls.camera);
            }
            if (this._options.showAxesHelper) {
                (_c = this._axes) === null || _c === void 0 ? void 0 : _c.render(this._cameraControls.camera, this._renderer);
            }
            const frameTime = performance.now() - start;
            this._lastFrameTime.next(frameTime);
        });
    }
    renderWholeScene() {
        this.render(this._loadedMeshesArray.length ? [this._renderScene.scene] : null);
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
    initLoader(dracoDecoderPath) {
        const loader = new GLTFLoader();
        if (dracoDecoderPath) {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(dracoDecoderPath);
            dracoLoader.preload();
            loader.setDRACOLoader(dracoLoader);
        }
        this._loader = loader;
    }
    processLoadingQueueAsync() {
        return __awaiter$2(this, void 0, void 0, function* () {
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
            this.runQueuedColoring();
            this.runQueuedSelection();
            yield this.updateRenderSceneAsync();
            this.emitOpenedModelsChanged();
            this._loadingStateChange.next(false);
            this._loadingInProgress = false;
            yield this.processLoadingQueueAsync();
        });
    }
    loadModel(url, guid, name) {
        return __awaiter$2(this, void 0, void 0, function* () {
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
        this.resetSelection();
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
                            this._meshesNeedColorUpdate.add(mesh);
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
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._coloredMeshes.length = 0;
    }
    getMeshAt(clientX, clientY) {
        return this._renderer && this._pickingScene
            ? this._pickingScene.getSourceMeshAt(this._cameraControls.camera, this._renderer, clientX, clientY)
            : null;
    }
    getSnapPointAt(clientX, clientY) {
        return this._renderer && this._pickingScene
            ? this._pickingScene.getSnapPointAt(this._cameraControls.camera, this._renderer, clientX, clientY)
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
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._selectedMeshes.length = 0;
    }
    removeIsolation() {
        for (const mesh of this._isolatedMeshes) {
            mesh.userData.isolated = undefined;
            this._meshesNeedColorUpdate.add(mesh);
        }
        this._isolatedMeshes.length = 0;
    }
    resetSelection() {
        this.removeSelection();
        this.removeIsolation();
    }
    selectMeshAtPoint(clientX, clientY, keepPreviousSelection) {
        const mesh = this.getMeshAt(clientX, clientY);
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
        this.resetSelection();
        if (!(meshes === null || meshes === void 0 ? void 0 : meshes.length)) {
            this.emitSelectionChanged(manual, true);
            return null;
        }
        meshes.forEach(x => {
            x.userData.selected = true;
            this._meshesNeedColorUpdate.add(x);
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
                this._meshesNeedColorUpdate.add(x);
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
    highlightMeshAtPoint(clientX, clientY) {
        const mesh = this.getMeshAt(clientX, clientY);
        this.highlightItem(mesh);
    }
    highlightItem(mesh) {
        if (mesh === this._highlightedMesh) {
            return;
        }
        this.removeHighlighting();
        if (mesh) {
            mesh.userData.highlighted = true;
            this._meshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = mesh;
        }
        this.render();
    }
    removeHighlighting() {
        if (this._highlightedMesh) {
            const mesh = this._highlightedMesh;
            mesh.userData.highlighted = undefined;
            this._meshesNeedColorUpdate.add(mesh);
            this._highlightedMesh = null;
        }
    }
    setTempMarkerAtPoint(clientX, clientY) {
        const point = this.getSnapPointAt(clientX, clientY);
        if (point) {
            this._renderScene.setMarker("temp", point);
            this._snapPointChange.next(new Vec4(point.x, point.y, point.z, 0, true));
        }
        else {
            this._renderScene.resetMarker("temp");
            this._snapPointChange.next(null);
        }
        this.render();
    }
    setMeasureMarkerAtPoint(x, y) {
        const point = this._pickingScene.getSnapPointAt(this._cameraControls.camera, this._renderer, x, y);
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
            this._renderScene.setMarker("start", this._measurePoints.start);
        }
        else {
            this._renderScene.resetMarker("start");
        }
        if (this._measurePoints.end) {
            this._renderScene.setMarker("end", this._measurePoints.end);
            this._renderScene.setSegment("distance", this._measurePoints.start, this._measurePoints.end);
        }
        else {
            this._renderScene.resetMarker("end");
            this._renderScene.resetSegment("distance");
        }
        this.render();
        this.emitDistanceMeasureChange();
    }
    emitDistanceMeasureChange() {
        if (this._measurePoints.start && this._measurePoints.end) {
            this._distanceMeasureChange.next(new Distance(this._measurePoints.start, this._measurePoints.end, true));
        }
        else {
            this._distanceMeasureChange.next(null);
        }
    }
    clearMeasurements() {
        this._measurePoints.start = null;
        this._measurePoints.end = null;
        this._distanceMeasureChange.next(null);
        this._renderScene.resetMarkers();
        this._renderScene.resetSegments();
        this.render();
    }
}

export { Distance, GltfViewer, GltfViewerOptions, Vec4 };
