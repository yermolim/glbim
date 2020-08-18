import { terser } from "rollup-plugin-terser";
import externals from "rollup-plugin-node-externals";

export default [{
  input: "tsc/ts-basic-gltf-viewer.js",
  output: [
    { file: "dist/ts-basic-gltf-viewer.esm.js", format: "es"},
    { file: "dist/ts-basic-gltf-viewer.esm.min.js", format: "es", plugins: [terser()] },
  ],
  external: [],
  plugins: [
    externals({
      deps: true,
      devDeps: false,
    }),
  ]
}];
