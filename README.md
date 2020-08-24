# ts-basic-gltf-viewer
three.js-based basic gltf model viewer

features:
- gltf/glb (with draco compression) models support
- most of three.js settings are default
- view only (model editing is out of this package's scope)
- transparent renderer background (so outer container background used)
- renderer canvas auto resize
- multiple models support
- mouse and touch support (pointer events used)
- highlighting model meshes on hover
- selection of model meshes from code by mesh ids (combination of model uuid and mesh 'name' field used as id)
- single (tap/click) and multiple (ctrl + click) manual selection of model meshes (GPU picking used)
- isolation of selected meshes (double tap/click)
- auto centering camera on selected meshes
- assigning different colors to groups of model meshes
- notification of changes in opened models and mesh selection using rxjs subjects

created for personal use in specific project (target models are static, without textures and without the need to take into account their internal structure), so use cases may be limited and not much description provided, but maybe some parts of the code will still be helpful to someone. 
if I find time for this, or if there are any requests, I will complete the description.

dependencies:
- <a href="https://github.com/mrdoob/three.js">three.js<a>
- <a href="https://github.com/ReactiveX/rxjs">RxJS<a>
- <a href="https://github.com/marcj/css-element-queries">CSS Element Queries<a>