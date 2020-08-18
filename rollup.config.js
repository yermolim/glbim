import { terser } from "rollup-plugin-terser";
import externals from "rollup-plugin-node-externals";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";

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
      // exclude: [
      //   "css-element-queries"
      // ]
    }),
    // commonjs(),
    // resolve({
    //   browser: true,
    // }),
  ]
}];
