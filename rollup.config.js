import { terser } from "rollup-plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import externals from "rollup-plugin-node-externals";

export default [  
  // main build
  {
    input: "tsc/gltf-viewer.js",
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
  },
  // demo build
  {
    input: "tsc/_demo/demo.js",
    output: [
      { file: "demo/demo.js", format: "es" },
    ],
    plugins: [
      nodeResolve({
        browser: true
      }),
      commonjs(),
    ],
  },
];
