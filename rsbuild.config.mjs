import {defineConfig} from "@rsbuild/core";

// A library, so the bundle keeps its named export as an ES module.
export default defineConfig({
  environments: {
    node: {
      output: {distPath: {root: "dist"}, minify: true, target: "node"},
      source: {entry: {index: "./src/index.js"}},
      tools: {
        rspack: {output: {library: {type: "module"}}},
      },
    },
  },
});
