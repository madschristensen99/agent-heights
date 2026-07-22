import { defineConfig } from "vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor";

export default defineConfig({
  root: "client",
  envDir: "..",
  plugins: [
    // @ts-ignore — plugin has no type declarations
    monacoEditorPlugin({}),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
