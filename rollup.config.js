import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import license from "rollup-plugin-license";
import externals from "rollup-plugin-node-externals";
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
          GLB/IFC model viewer
          Copyright (C) 2020-present, Volodymyr Yermolenko (yermolim@gmail.com)
      
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
        `,
      }),
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
