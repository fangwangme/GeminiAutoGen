import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(rootDir, ".shared/extension-dist");

const entries = [
  { src: "manifest.json", dest: "manifest.json" },
  { src: "sidepanel.html", dest: "sidepanel.html" },
  { src: "options.html", dest: "options.html" },
  { src: "docs", dest: "docs" }
];

await mkdir(outDir, { recursive: true });

await Promise.all(
  entries.map(({ src, dest }) =>
    cp(path.resolve(rootDir, src), path.resolve(outDir, dest), {
      recursive: true,
      force: true
    })
  )
);
