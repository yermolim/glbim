# ts-basic-gltf-viewer
three.js-based basic gltf model viewer

features:
- multiple gltf/glb (with optional draco compression) models support
- view only (model editing is out of this package's scope)
- renderer with auto canvas resize and transparent background (so outer container background used)
- optional performance optimization by merging all scene meshes into single mesh (or one mesh per loaded model optionally) with vertex colors (alpha supported) to reduce frame time by minimizing render calls
- optional render speed optimization while moving/rotating camera by using simplified background scene
- assigning different colors to groups of model meshes
- selection of model meshes from code by mesh ids (a combination of internal model UUID and mesh 'name' field used as id) with auto centering camera on selection
- mouse and touch support (pointer events used): OrbitControls navigation; single (tap/click) and multiple (ctrl + click) manual selection of model meshes (fast GPU picking used); isolation of selected meshes (double-tap/click); highlighting model meshes on hover
- notification of changes in opened models and mesh selection using rxjs subjects
- options change at runtime

created for personal use in specific project (target models are static without the need to take into account their internal structure; all meshes use indexed BufferGeometry and MeshStandardMaterial without textures), so use cases may be limited and not much description provided, but maybe some parts of the code will still be helpful to someone. 
if I find time for this, or if there are any requests, I will complete the description.

dependencies:
- <a href="https://github.com/mrdoob/three.js">three.js<a>
- <a href="https://github.com/ReactiveX/rxjs">RxJS<a>
- <a href="https://github.com/marcj/css-element-queries">CSS Element Queries<a>