import { defineConfig } from "vite";
import monacoEditorPluginModule from "vite-plugin-monaco-editor";

// The plugin's CJS export is { default: fn }, so extract it
const monacoEditorPlugin = (monacoEditorPluginModule as any).default ?? monacoEditorPluginModule;

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
