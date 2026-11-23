import {defineConfig} from "@rsbuild/core";

// One ES module in dist/index.js that keeps the named export for importers.
export default defineConfig({
  output: {
    distPath: {root: "dist"},
    minify: true,
    target: "node",
  },
  source: {
    entry: {index: "./src/index.js"},
  },
  tools: {
    rspack: {
      output: {library: {type: "module"}},
    },
  },
});
