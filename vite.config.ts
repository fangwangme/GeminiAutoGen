import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    target: "es2020",
    outDir: path.resolve(rootDir, "../.shared/extension-dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: path.resolve(rootDir, "src/background.ts"),
        content: path.resolve(rootDir, "src/content.ts"),
        sidepanel: path.resolve(rootDir, "src/sidepanel.ts"),
        options: path.resolve(rootDir, "src/options.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
