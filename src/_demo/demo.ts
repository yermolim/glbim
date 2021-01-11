import { GltfViewer } from "../gltf-viewer";
import { GltfViewerOptions } from "../gltf-viewer-options";

const viewer = new GltfViewer("gltf-viewer-container", "/assets/draco/", new GltfViewerOptions);
console.log(viewer);
