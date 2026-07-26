import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;

export default defineConfig({
  root: resolve(projectRoot, "src"),
  publicDir: false,
  plugins: [
    {
      name: "emit-extension-manifest",
      apply: "build",
      buildStart() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync(
            resolve(projectRoot, "manifest.json"),
            "utf8",
          ),
        });
      },
    },
  ],
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        background: resolve(projectRoot, "src/background.ts"),
        popup: resolve(projectRoot, "src/popup/index.html"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background"
            ? "background.js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    root: projectRoot,
  },
});

