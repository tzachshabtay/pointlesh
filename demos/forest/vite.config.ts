import { defineConfig } from "vite";
import { stablePreview } from "./scripts/stable-preview";

export default defineConfig({
  base: "./",
  plugins: [stablePreview()],
  server: { port: 5186, strictPort: true },
  build: { chunkSizeWarningLimit: 2200 },
});
