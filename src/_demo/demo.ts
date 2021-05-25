import { GltfViewer } from "../gltf-viewer";
import { GltfViewerOptions } from "../gltf-viewer-options";

const viewer = new GltfViewer("gltf-viewer-container", "/assets/draco/", new GltfViewerOptions());
viewer.openModelsAsync([
  {
    url: "/assets/models/building_frame.glb",
    guid: "094c317c-ec3c-4964-888d-942c31107463",
    name: "building frame"
  },
  {
    url: "/assets/models/building_staircase.glb",
    guid: "d047287c-6a59-4ebf-9bc8-ffb01a6da7f6",
    name: "building staircase"
  },
]);

// viewer.openModelsAsync([
//   {
//     url: "/assets/models/pig.glb",
//     guid: "c248a5d4-c759-4cd9-b99b-715d8bbd6f01",
//     name: "pig"
//   },
// ]);

console.log(viewer);
