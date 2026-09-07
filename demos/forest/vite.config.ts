import { defineConfig } from "vite";
export default defineConfig({ base: "./", server: { port: 5186, strictPort: true }, build: { chunkSizeWarningLimit: 2200 } });
