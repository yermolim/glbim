import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import license from "rollup-plugin-license";
import externals from "rollup-plugin-node-externals";
import dts from "rollup-plugin-dts";
// import { terser } from "rollup-plugin-terser";

export default [  
  // main build
  {
    input: "tsc/glbim-viewer.js",
    output: [
      { file: "dist/glbim.esm.js", format: "esm"},
      // TODO: configure terser to prevent imports from shadowing variables
      // { file: "dist/glbim.esm.min.js", format: "es", plugins: [terser()] },
    ],
    external: [],
    plugins: [
      license({
        banner: `   
          glbim (GLB/IFC model viewer)
          Copyright (C) 2020-present Volodymyr Yermolenko (yermolim@gmail.com), Chemproject PJSC
      
          This program is free software: you can redistribute it and/or modify
          it under the terms of the GNU Affero General Public License as published
          by the Free Software Foundation, either version 3 of the License, or
          (at your option) any later version.
      
          This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
          GNU Affero General Public License for more details.
      
          You should have received a copy of the GNU Affero General Public License
          along with this program.  If not, see <https://www.gnu.org/licenses/>.
          
          You can be released from the requirements of the license by purchasing
          a commercial license. Buying such a license is mandatory as soon as you
          develop commercial activities involving this program without
          disclosing the source code of your own applications.
        `,
      }),
      externals({
        deps: true,
        devDeps: false,
      }),
    ]
  },
  {
    input: "tsc/glbim-viewer.d.ts",
    output: [
      { file: "dist/glbim.d.ts", format: "esm" },
    ],
    plugins: [
      dts(),
    ],
  },
  // demo build
  {
    input: "tsc/_demo/demo.js",
    output: [
      { file: "demo/demo.js", format: "esm" },
    ],
    plugins: [
      nodeResolve({
        browser: true
      }),
      commonjs(),
    ],
  },
];
